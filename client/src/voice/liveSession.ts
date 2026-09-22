import {
  developerNote,
  type LiveStatus,
  type ToolExecutor,
  type TutorSession,
  type TutorSessionEventName,
  type TutorSessionEvents,
} from "./session";
import {
  BackendHistoryBudget,
  DEFAULT_TOOL_OUTPUT_BYTES,
  functionCallFromEvent,
  HISTORY_MIN_USEFUL_BYTES,
  responseFinishedFromEvent,
  serializeToolOutput,
  ToolTurnTracker,
  utf8Bytes,
  withToolTimeout,
  type HistoryUsage,
  type LiveFunctionCall,
} from "./liveEvents";

export type {
  ToolExecutor,
  TutorSession,
  TutorSessionEvents as LiveSessionEvents,
  LiveStatus,
} from "./session";

type EventName = TutorSessionEventName;

export interface LiveSessionOptions {
  mediaStream: MediaStream;
  audioElement: HTMLAudioElement;
  /** Send the browser's SDP offer to the app server, which creates the OpenAI session. */
  negotiate: (sdp: string) => Promise<{ sdp: string; sessionId: string }>;
  tools: Record<string, ToolExecutor>;
}

const DATA_CHANNEL = "oai-events";
const ICE_GATHER_TIMEOUT_MS = 1_500;
/** Backend complaints that mean our tool bookkeeping and its own drifted apart. */
const TOOL_PROTOCOL_ERROR = /function call output|response\.create/i;
/** The delegated backend refusing more input history. */
const HISTORY_FULL_ERROR = /input history is limited|history is full/i;


/**
 * A GPT-Live WebRTC session driven from the browser. Audio flows over the peer
 * connection; Live events flow over the data channel. Function calls from the
 * delegated backend are executed here and answered on the same channel.
 */
export class LiveVoiceSession implements TutorSession {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private readonly tracker = new ToolTurnTracker();
  private readonly listeners = new Map<EventName, Set<(...args: never[]) => void>>();
  private eventCounter = 0;
  /** A continuation asked for while outputs were still owed. */
  private continuationQueued = false;
  private readonly history = new BackendHistoryBudget();
  status: LiveStatus = "idle";
  sessionId: string | null = null;

  constructor(private readonly options: LiveSessionOptions) {}

  on<K extends EventName>(event: K, handler: TutorSessionEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (...args: never[]) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler as (...args: never[]) => void);
    };
  }

  private emit<K extends EventName>(event: K, ...args: Parameters<TutorSessionEvents[K]>) {
    for (const handler of this.listeners.get(event) ?? []) {
      try {
        (handler as unknown as (...inner: Parameters<TutorSessionEvents[K]>) => void)(...args);
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

  /**
   * Add an item (developer note, user message, tool output) to the backend
   * conversation, if the session's bounded input history can still hold it.
   *
   * `required` marks an item the turn cannot proceed without — a function call
   * output — which may draw on the reserve that optional notes cannot touch.
   * Returns false when the item was not sent.
   */
  addBackendItem(item: Record<string, unknown>, options: { required?: boolean } = {}): boolean {
    const required = options.required ?? false;
    const event = { type: "response.item.create", item, event_id: this.nextEventId("item") };
    const size = utf8Bytes(JSON.stringify(event));
    if (size > this.history.allowance(required)) {
      this.emit("history_full", this.history.usage);
      return false;
    }
    if (!this.send(event)) return false;
    this.history.record(size);
    return true;
  }

  /** A developer-role note for the delegated backend's bounded history. */
  addDeveloperNote(text: string): boolean {
    return this.addBackendItem(developerNote(text));
  }

  /** Bytes an image could still use, so tools can skip pointless captures. */
  get imageAllowance(): number {
    return this.history.imageAllowance;
  }

  /** How much of the backend's bounded input history this session has spent. */
  get historyUsage(): HistoryUsage {
    return this.history.usage;
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
        if (HISTORY_FULL_ERROR.test(message)) {
          // Our accounting and the backend's disagree; believe the backend and
          // stop adding to the history so the rest of the session still works.
          console.warn("Backend input history is full", message, this.history.usage);
          this.history.markFull();
          this.emit("history_full", this.history.usage);
          return;
        }
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
    // Fit the answer to whatever history is left rather than dropping it: an
    // unanswered call stalls the turn, a shortened one does not.
    const allowance = this.history.allowance(true);
    const maxBytes = Math.min(
      DEFAULT_TOOL_OUTPUT_BYTES,
      Math.max(0, allowance - HISTORY_MIN_USEFUL_BYTES),
    );
    const submitted =
      allowance >= HISTORY_MIN_USEFUL_BYTES &&
      this.addBackendItem(
        {
          type: "function_call_output",
          call_id: call.callId,
          // The same allowance the tools consulted before capturing, so the two
          // never disagree about whether an image was worth producing.
          output: serializeToolOutput(output, {
            maxBytes,
            imageBytes: this.history.imageAllowance,
          }),
        },
        { required: true },
      );
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
