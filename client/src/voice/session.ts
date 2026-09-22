import type { HistoryUsage, LiveFunctionCall } from "./liveEvents";

/**
 * The contract the lesson UI talks to. `LiveVoiceSession` is the GPT-Live
 * implementation.
 */

export type ToolExecutor = (
  args: Record<string, unknown>,
  call: LiveFunctionCall,
) => Promise<unknown>;

export interface TutorSessionEvents {
  connected: (info: { sessionId: string }) => void;
  disconnected: (reason: string) => void;
  error: (message: string) => void;
  input_transcript: (delta: string, startMs: number, endMs: number) => void;
  output_transcript: (delta: string, startMs: number, endMs: number) => void;
  tool_call: (call: LiveFunctionCall) => void;
  tool_result: (call: LiveFunctionCall, ok: boolean) => void;
  delegation: (target: "client" | "responses") => void;
  history_full: (usage: HistoryUsage) => void;
  server_event: (event: Record<string, unknown>) => void;
}

export type TutorSessionEventName = keyof TutorSessionEvents;

export type LiveStatus = "idle" | "connecting" | "connected" | "closed";

export interface TutorSession {
  readonly status: LiveStatus;
  readonly sessionId: string | null;
  /** Bytes an image may take in the session's history; 0 means skip capture. */
  readonly imageAllowance: number;
  readonly historyUsage: HistoryUsage;

  on<K extends TutorSessionEventName>(event: K, handler: TutorSessionEvents[K]): () => void;

  /** Standing behavior notes, such as the wake/standby state. */
  appendInstructions(content: string): boolean;
  /** Silent context the tutor should know but not speak about. */
  appendThinking(content: string): boolean;
  /** Speakable context, voiced at once — the wake greeting uses this. */
  appendCommentary(content: string): boolean;
  /** A developer-role note added to the reasoning context. */
  addDeveloperNote(text: string): boolean;

  setMuted(muted: boolean): Promise<void>;
  connect(timeoutMs?: number): Promise<{ sessionId: string }>;
  close(): Promise<void>;
}

/** The studio's standing note format for a developer-role context item. */
export function developerNote(text: string) {
  return {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text }],
  };
}
