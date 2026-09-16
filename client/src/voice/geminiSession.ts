import {
  BRIDGE_PATH,
  type ClientFrame,
  type ServerFrame,
} from "../../../shared/voice/geminiBridge";
import { PcmPlayer, PcmRecorder } from "./geminiAudio";
import {
  clipToBytes,
  utf8Bytes,
  withToolTimeout,
  type HistoryUsage,
  type LiveFunctionCall,
  type ToolResult,
} from "./liveEvents";
import type {
  LiveStatus,
  ToolExecutor,
  TutorSession,
  TutorSessionEventName,
  TutorSessionEvents,
} from "./session";

export interface GeminiSessionOptions {
  mediaStream: MediaStream;
  audioElement: HTMLAudioElement;
  lessonId: string;
  tools: Record<string, ToolExecutor>;
  /** Lets the studio verify the fallback got the selected lesson, as the paid path does. */
  onReady?: (info: { model: string; voice: string; lessonMarker: string; lessonId: string }) => void;
}

/**
 * Gemini keeps its own long context and compresses it server-side, so the
 * 32768-byte ceiling the GPT-Live backend imposes does not apply. Tool output is
 * still capped, generously, so one runaway result cannot fill a turn.
 */
const MAX_TOOL_OUTPUT_BYTES = 24_576;
/**
 * Images ride as realtime video frames rather than inside the tool result, so
 * the only real limit is the bridge's frame cap. A screenshot data URL measures
 * ~200KB, well inside it.
 */
const IMAGE_ALLOWANCE_BYTES = 1_000_000;

const UNBOUNDED_HISTORY: HistoryUsage = {
  items: 0,
  bytes: 0,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxBytes: Number.MAX_SAFE_INTEGER,
  full: false,
};

/** Split a data URL into the parts Gemini's inline image input needs. */
function splitDataUrl(dataUrl: string): { mime: "image/jpeg" | "image/png"; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1] as "image/jpeg" | "image/png", data: match[2] };
}

/**
 * The free fallback tutor: one Gemini Live model doing both the talking and the
 * reasoning, reached through the app server so the API key stays there.
 *
 * It implements the same interface as the paid GPT-Live session and runs the
 * identical browser-side tool executors, so the lesson UI, whiteboard, wake word
 * and saved transcript behave the same. What it does not have is a separate
 * reasoning backend, so there is no delegation and no bounded input history.
 */
export class GeminiVoiceSession implements TutorSession {
  readonly provider = "gemini" as const;
  private socket: WebSocket | null = null;
  private recorder: PcmRecorder | null = null;
  private readonly player = new PcmPlayer();
  private readonly listeners = new Map<TutorSessionEventName, Set<(...args: never[]) => void>>();
  private readonly inFlight = new Set<string>();
  private muted = false;
  status: LiveStatus = "idle";
  sessionId: string | null = null;

  constructor(private readonly options: GeminiSessionOptions) {}

  on<K extends TutorSessionEventName>(event: K, handler: TutorSessionEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (...args: never[]) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler as (...args: never[]) => void);
    };
  }

  private emit<K extends TutorSessionEventName>(
    event: K,
    ...args: Parameters<TutorSessionEvents[K]>
  ) {
    for (const handler of this.listeners.get(event) ?? []) {
      try {
        (handler as unknown as (...inner: Parameters<TutorSessionEvents[K]>) => void)(...args);
      } catch (error) {
        console.error(`Fallback listener for ${event} failed`, error);
      }
    }
  }

  private send(frame: ClientFrame): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      this.emit("error", error instanceof Error ? error.message : "Failed to send to the tutor");
      return false;
    }
  }

  /**
   * Add context without asking for speech.
   *
   * Gemini Live has no separate instruction channel, so a note is an ordinary
   * user-role turn left open (`turnComplete: false`): the model takes it into
   * account on its next reply but does not answer it out loud.
   */
  private note(content: string, turnComplete = false): boolean {
    const text = content.trim();
    if (!text) return false;
    // Every text frame this class sends comes from the studio, never from the
    // learner's mouth — his speech arrives as audio. The marker is what stops
    // the model reading a stage direction like the wake greeting out loud; the
    // system instruction explains it.
    return this.send({
      t: "text",
      text: `[APP NOTE] ${text.slice(0, 7_900)} [/APP NOTE]`,
      turnComplete,
    });
  }

  appendInstructions(content: string): boolean {
    return this.note(content);
  }

  appendThinking(content: string): boolean {
    return this.note(content);
  }

  appendCommentary(content: string): boolean {
    // The wake greeting must be spoken at once, so this one closes the turn.
    return this.note(content, true);
  }

  addDeveloperNote(text: string): boolean {
    return this.note(text);
  }

  get imageAllowance(): number {
    return this.status === "connected" ? IMAGE_ALLOWANCE_BYTES : 0;
  }

  get historyUsage(): HistoryUsage {
    return UNBOUNDED_HISTORY;
  }

  async setMuted(muted: boolean) {
    this.muted = muted;
    this.options.mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    // Belt and braces: stop the frames as well as the track, so nothing can be
    // captured while the learner believes the microphone is off.
    this.recorder?.setEnabled(!muted);
  }

  async connect(timeoutMs = 30_000): Promise<{ sessionId: string }> {
    if (this.status !== "idle") throw new Error("This voice session was already started.");
    this.status = "connecting";

    const playback = await this.player.start();
    this.options.audioElement.srcObject = playback;
    void this.options.audioElement.play().catch(() => undefined);

    const url = new URL(BRIDGE_PATH, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.socket = socket;

    let settleTimer = 0;
    const ready = new Promise<{ sessionId: string }>((resolve, reject) => {
      settleTimer = window.setTimeout(
        () => reject(new Error("Connecting took too long. Check your connection and try again.")),
        timeoutMs,
      );
      socket.onopen = () => this.send({ t: "start", lessonId: this.options.lessonId });
      socket.onmessage = (event) => this.handleFrame(String(event.data), resolve, reject);
      socket.onerror = () => reject(new Error("The fallback tutor's connection failed."));
      socket.onclose = () => {
        reject(new Error("The fallback tutor's connection closed."));
        if (this.status !== "closed") this.finish("socket_closed");
      };
    });
    ready.catch(() => undefined);

    try {
      const info = await ready;
      this.status = "connected";
      const recorder = new PcmRecorder(this.options.mediaStream, (frame) => {
        if (!this.muted) this.send({ t: "audio", d: frame });
      });
      await recorder.start();
      recorder.setEnabled(!this.muted);
      this.recorder = recorder;
      this.emit("connected", info);
      return info;
    } finally {
      window.clearTimeout(settleTimer);
    }
  }

  private handleFrame(
    raw: string,
    onReady: (info: { sessionId: string }) => void,
    onFailed: (error: Error) => void,
  ) {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw) as ServerFrame;
    } catch {
      return;
    }
    this.emit("server_event", frame as unknown as Record<string, unknown>);

    switch (frame.t) {
      case "ready":
        this.sessionId = frame.sessionId;
        this.options.onReady?.({
          model: frame.model,
          voice: frame.voice,
          lessonMarker: frame.lessonMarker,
          lessonId: frame.lessonId,
        });
        onReady({ sessionId: frame.sessionId });
        return;
      case "audio":
        this.player.play(frame.d);
        return;
      case "input_transcript":
        this.emit("input_transcript", frame.text, 0, 0);
        return;
      case "output_transcript":
        this.emit("output_transcript", frame.text, 0, 0);
        return;
      case "interrupted":
        this.player.stopAll();
        return;
      case "turn_complete":
        return;
      case "tool_call":
        for (const call of frame.calls) {
          void this.runTool({
            callId: call.id,
            name: call.name,
            arguments: call.args,
            delegationId: null,
            responseId: null,
          });
        }
        return;
      case "error":
        this.emit("error", frame.message);
        return;
      case "closed":
        onFailed(new Error("The fallback tutor's connection closed."));
        this.finish(frame.reason);
        return;
    }
  }

  private async runTool(call: LiveFunctionCall) {
    const key = call.callId || `${call.name}:${call.arguments}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.emit("tool_call", call);

    let result: unknown;
    let ok = true;
    try {
      const executor = this.options.tools[call.name];
      if (!executor) throw new Error(`Unknown tool: ${call.name}`);
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Tool arguments were not valid JSON.");
      }
      result = await withToolTimeout(Promise.resolve(executor(args, call)), call.name);
    } catch (error) {
      ok = false;
      result = { error: error instanceof Error ? error.message : "Tool failed" };
    }
    this.emit("tool_result", call, ok);
    this.inFlight.delete(key);

    const normalized: ToolResult =
      result && typeof result === "object" && "output" in (result as ToolResult)
        ? (result as ToolResult)
        : { output: result };

    // Gemini takes pictures as realtime input, not inside a function response,
    // so images go first and the text result names them.
    let sentImages = 0;
    for (const image of normalized.images ?? []) {
      const parsed = splitDataUrl(image);
      if (!parsed) continue;
      if (this.send({ t: "image", d: parsed.data, mime: parsed.mime })) sentImages += 1;
    }

    const text =
      typeof normalized.output === "string"
        ? normalized.output
        : JSON.stringify(normalized.output ?? null);
    const body =
      utf8Bytes(text) > MAX_TOOL_OUTPUT_BYTES
        ? `${clipToBytes(text, MAX_TOOL_OUTPUT_BYTES - 16)}…[truncated]`
        : text;

    this.send({
      t: "tool",
      id: call.callId,
      name: call.name,
      response: JSON.stringify({
        result: body,
        ...(sentImages
          ? {
              images: `${sentImages} image${sentImages > 1 ? "s" : ""} from this tool were just sent to you as live video frames. Look at them before you answer.`,
            }
          : {}),
      }),
    });
  }

  private finish(reason: string) {
    if (this.status === "closed") return;
    this.status = "closed";
    void this.teardown();
    this.emit("disconnected", reason);
  }

  private async teardown() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    }
    await this.recorder?.stop();
    this.recorder = null;
    await this.player.stop();
  }

  async close() {
    if (this.status === "closed") return;
    this.send({ t: "bye" });
    this.status = "closed";
    await this.teardown();
  }
}
