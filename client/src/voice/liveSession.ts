import {
  functionCallFromEvent,
  responseFinishedFromEvent,
  serializeToolOutput,
  ToolTurnTracker,
  withToolTimeout,
  type LiveFunctionCall,
} from "./liveEvents";

export type ToolExecutor = (
  args: Record<string, unknown>,
  call: LiveFunctionCall,
) => Promise<unknown>;

export interface LiveSessionEvents {
  connected: (info: { sessionId: string }) => void;
  disconnected: (reason: string) => void;
  error: (message: string) => void;
  input_transcript: (delta: string, startMs: number, endMs: number) => void;
  output_transcript: (delta: string, startMs: number, endMs: number) => void;
  tool_call: (call: LiveFunctionCall) => void;
  tool_result: (call: LiveFunctionCall, ok: boolean) => void;
  delegation: (target: "client" | "responses") => void;
  server_event: (event: Record<string, unknown>) => void;
}

type EventName = keyof LiveSessionEvents;

export interface LiveSessionOptions {
  mediaStream: MediaStream;
  audioElement: HTMLAudioElement;
  /** Send the browser's SDP offer to the app server, which creates the OpenAI session. */
  negotiate: (sdp: string) => Promise<{ sdp: string; sessionId: string }>;
  tools: Record<string, ToolExecutor>;
}

export type LiveStatus = "idle" | "connecting" | "connected" | "closed";

const DATA_CHANNEL = "oai-events";
const ICE_GATHER_TIMEOUT_MS = 1_500;
/** Backend complaints that mean our tool bookkeeping and its own drifted apart. */
const TOOL_PROTOCOL_ERROR = /function call output|response\.create/i;

/**
 * A GPT-Live WebRTC session driven from the browser. Audio flows over the peer
 * connection; Live events flow over the data channel. Function calls from the
 * delegated backend are executed here and answered on the same channel.
 */
export class LiveVoiceSession {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private readonly tracker = new ToolTurnTracker();
  private readonly listeners = new Map<EventName, Set<(...args: never[]) => void>>();
  private eventCounter = 0;
  /** A continuation asked for while outputs were still owed. */
  private continuationQueued = false;
  status: LiveStatus = "idle";
  sessionId: string | null = null;

  constructor(private readonly options: LiveSessionOptions) {}

  on<K extends EventName>(event: K, handler: LiveSessionEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (...args: never[]) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler as (...args: never[]) => void);
    };
  }

  private emit<K extends EventName>(event: K, ...args: Parameters<LiveSessionEvents[K]>) {
    for (const handler of this.listeners.get(event) ?? []) {
      try {
        (handler as unknown as (...inner: Parameters<LiveSessionEvents[K]>) => void)(...args);
      } catch (error) {
        console.error(`Live listener for ${event} failed`, error);
      }
    }
  }

  private nextEventId(prefix: string) {
    this.eventCounter += 1;
    return `${prefix}-${this.eventCounter}`;
  }

  /** Send a Live client event. Returns false when the channel is not open. */
  send(event: Record<string, unknown>): boolean {
    const channel = this.channel;
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(event));
      return true;
    } catch (error) {
      this.emit("error", error instanceof Error ? error.message : "Failed to send event");
      return false;
    }
  }

  appendInstructions(content: string) {
    return this.send({
      type: "session.instructions.append",
      content: content.slice(0, 1_800),
      delegation_id: null,
      event_id: this.nextEventId("instructions"),
    });
  }

  appendThinking(content: string) {
    return this.send({
      type: "session.thinking.append",
      content: content.slice(0, 1_800),
      delegation_id: null,
      event_id: this.nextEventId("thinking"),
    });
  }

  appendCommentary(content: string) {
    return this.send({
      type: "session.commentary.append",
      content: content.slice(0, 1_800),
      delegation_id: null,
      event_id: this.nextEventId("commentary"),
    });
  }

  /** Add an item (developer note, user message, tool output) to the backend conversation. */
  addBackendItem(item: Record<string, unknown>) {
    return this.send({ type: "response.item.create", item, event_id: this.nextEventId("item") });
  }

  /**
   * Ask the backend to continue. The backend rejects `response.create` while any
   * function call output is still owed, so a request that arrives early is held
   * and sent by the tool call that settles the turn.
   */
  requestResponse(): boolean {
    if (this.tracker.busy) {
      this.continuationQueued = true;
      return false;
    }
    this.continuationQueued = false;
    return this.send({ type: "response.create", event_id: this.nextEventId("response") });
  }

  async setMuted(muted: boolean) {
    this.options.mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.send({ type: muted ? "session.input_audio.mute" : "session.input_audio.unmute" });
  }

  async connect(timeoutMs = 30_000): Promise<{ sessionId: string }> {
    if (this.status !== "idle") throw new Error("This voice session was already started.");
    this.status = "connecting";
    const peer = new RTCPeerConnection();
    this.peer = peer;

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      this.options.audioElement.srcObject = stream ?? new MediaStream([event.track]);
      void this.options.audioElement.play().catch(() => undefined);
    };
    for (const track of this.options.mediaStream.getAudioTracks()) {
      peer.addTrack(track, this.options.mediaStream);
    }
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState) && this.status !== "closed") {
        this.finish(`connection_${peer.connectionState}`);
      }
    };

    let startTimer = 0;
    const started = new Promise<{ sessionId: string }>((resolve, reject) => {
      startTimer = window.setTimeout(
        () => reject(new Error("Connecting took too long. Check your connection and try again.")),
        timeoutMs,
      );
      const attach = (channel: RTCDataChannel) => {
        this.channel = channel;
        channel.onmessage = (message) => this.handleMessage(message.data, resolve);
        channel.onerror = () => this.emit("error", "The voice data channel reported an error.");
        channel.onclose = () => {
          if (this.status !== "closed") this.finish("channel_closed");
        };
      };
      attach(peer.createDataChannel(DATA_CHANNEL));
      peer.ondatachannel = (event) => attach(event.channel);
    });
    // Surface a rejection through connect() only; avoid an unhandled rejection.
    started.catch(() => undefined);

    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    await this.waitForIceGathering(peer);
    const localSdp = peer.localDescription?.sdp;
    if (!localSdp) throw new Error("The browser did not produce a WebRTC offer.");

    const answer = await this.options.negotiate(localSdp);
    if (this.status !== "connecting") throw new Error("The voice session was closed while connecting.");
    await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    this.sessionId = answer.sessionId;

    try {
      const info = await started;
      this.status = "connected";
      this.emit("connected", info);
      return info;
    } finally {
      window.clearTimeout(startTimer);
    }
  }

  private waitForIceGathering(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(done, ICE_GATHER_TIMEOUT_MS);
      function done() {
        window.clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
      function check() {
        if (peer.iceGatheringState === "complete") done();
      }
      peer.addEventListener("icegatheringstatechange", check);
    });
  }

  private handleMessage(data: unknown, onStarted: (info: { sessionId: string }) => void) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = typeof event.type === "string" ? event.type : "";
    this.emit("server_event", event);

    switch (type) {
      case "session.started": {
        const session = event.session as { id?: string } | undefined;
        if (session?.id) this.sessionId = session.id;
        onStarted({ sessionId: this.sessionId ?? "" });
        return;
      }
      case "session.input_transcript.delta":
        this.emit("input_transcript", String(event.delta ?? ""), Number(event.start_ms ?? 0), Number(event.end_ms ?? 0));
        return;
      case "session.output_transcript.delta":
        this.emit("output_transcript", String(event.delta ?? ""), Number(event.start_ms ?? 0), Number(event.end_ms ?? 0));
        return;
      case "session.delegation.created": {
        const delegation = event.delegation as { target?: "client" | "responses" } | undefined;
        if (delegation?.target) this.emit("delegation", delegation.target);
        return;
      }
      case "error": {
        const error = event.error as { message?: string; code?: string } | undefined;
        const message = error?.message ?? "The voice session reported an error.";
        if (TOOL_PROTOCOL_ERROR.test(message)) {
          // The turn the backend is complaining about is already lost. Drop our
          // bookkeeping for it so the next turn starts clean, and keep the
          // recovered hiccup out of the learner's face.
          console.warn("Recovered from a Live tool-protocol error", message);
          this.tracker.reset();
          this.continuationQueued = false;
          return;
        }
        this.emit("error", message);
        return;
      }
      case "session.closed":
        this.finish(String(event.reason ?? "closed"));
        return;
      case "response.event": {
        const call = functionCallFromEvent(event);
        if (call) {
          void this.runTool(call);
          return;
        }
        const finished = responseFinishedFromEvent(event);
        if (finished && this.tracker.finish(finished.delegationId)) this.requestResponse();
        return;
      }
      default:
        return;
    }
  }

  private async runTool(call: LiveFunctionCall) {
    // A repeated event for a call we already answered must not run twice.
    if (!this.tracker.begin(call)) return;
    this.emit("tool_call", call);
    let output: unknown;
    let ok = true;
    const executor = this.options.tools[call.name];
    try {
      if (!executor) throw new Error(`Unknown tool: ${call.name}`);
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Tool arguments were not valid JSON.");
      }
      // Every call must produce an output, so a stalled tool fails loudly
      // instead of leaving the backend waiting on it forever.
      output = await withToolTimeout(
        Promise.resolve(executor(args, call)),
        call.name,
      );
    } catch (error) {
      ok = false;
      output = { error: error instanceof Error ? error.message : "Tool failed" };
    }
    this.emit("tool_result", call, ok);
    const submitted = this.addBackendItem({
      type: "function_call_output",
      call_id: call.callId,
      output: serializeToolOutput(output),
    });
    const continueNow = this.tracker.complete(call, submitted);
    if (continueNow || this.continuationQueued) this.requestResponse();
  }

  private finish(reason: string) {
    if (this.status === "closed") return;
    this.status = "closed";
    this.teardown();
    this.emit("disconnected", reason);
  }

  private teardown() {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.onclose = null;
      try {
        this.channel.close();
      } catch {
        /* already closed */
      }
      this.channel = null;
    }
    if (this.peer) {
      this.peer.onconnectionstatechange = null;
      this.peer.ontrack = null;
      try {
        this.peer.close();
      } catch {
        /* already closed */
      }
      this.peer = null;
    }
  }

  async close() {
    if (this.status === "closed") return;
    this.send({ type: "session.close" });
    this.status = "closed";
    this.teardown();
  }
}
