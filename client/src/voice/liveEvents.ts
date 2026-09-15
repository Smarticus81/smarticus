/**
 * Pure helpers for the GPT-Live event stream. No DOM or WebRTC here so the
 * behavior can be unit tested.
 */

export const WAKE_WORD = "virgil";
export const GOODBYE_PATTERN =
  /\b(?:good\s*bye|bye(?:-bye)?|see you(?: later)?|talk to you later|that(?:'s| is) all)\b/i;

const WAKE_PATTERN = new RegExp(`\\b${WAKE_WORD}\\b`, "i");
/** Transcripts occasionally spell the name phonetically. */
const WAKE_VARIANTS = /\b(?:virgil|vergil|virgile|virgel|burgle)\b/i;

export function containsWakeWord(text: string): boolean {
  return WAKE_PATTERN.test(text) || WAKE_VARIANTS.test(text);
}

export function containsGoodbye(text: string): boolean {
  return GOODBYE_PATTERN.test(text);
}

export interface LiveFunctionCall {
  callId: string;
  name: string;
  arguments: string;
  delegationId: string | null;
  responseId: string | null;
}

interface NestedResponseEvent {
  type?: string;
  item?: {
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
  };
  response?: { id?: string; status?: string };
}

function nested(event: unknown): NestedResponseEvent | null {
  if (!event || typeof event !== "object") return null;
  const outer = event as { type?: string; event?: unknown };
  if (outer.type !== "response.event" || !outer.event || typeof outer.event !== "object")
    return null;
  return outer.event as NestedResponseEvent;
}

/** A completed function_call output item from a delegated Responses stream. */
export function functionCallFromEvent(event: unknown): LiveFunctionCall | null {
  const inner = nested(event);
  if (!inner || inner.type !== "response.output_item.done") return null;
  const item = inner.item;
  if (!item || item.type !== "function_call" || !item.call_id || !item.name) return null;
  const outer = event as { delegation_id?: string | null };
  return {
    callId: item.call_id,
    name: item.name,
    arguments: item.arguments ?? "{}",
    delegationId: outer.delegation_id ?? null,
    responseId: inner.response?.id ?? null,
  };
}

/** The nested response lifecycle end, if this event is one. */
export function responseFinishedFromEvent(
  event: unknown,
): { delegationId: string | null; status: string } | null {
  const inner = nested(event);
  if (!inner) return null;
  if (
    !["response.completed", "response.done", "response.incomplete", "response.failed"].includes(
      inner.type ?? "",
    )
  )
    return null;
  const outer = event as { delegation_id?: string | null };
  return {
    delegationId: outer.delegation_id ?? null,
    status: inner.response?.status ?? inner.type?.replace("response.", "") ?? "completed",
  };
}

/** How long a tool may run before its output is answered with an error. */
export const TOOL_TIMEOUT_MS = 20_000;

/** Resolve with the promise, or reject once `ms` has passed. */
export function withToolTimeout<T>(
  promise: Promise<T>,
  name: string,
  ms = TOOL_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool ${name} did not finish within ${Math.round(ms / 1000)}s.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface TurnState {
  /** Calls whose output has not been put on the wire yet. */
  pending: Set<string>;
  /** Outputs successfully sent for this turn. */
  answered: number;
  /** The delegated response stream has ended. */
  ended: boolean;
  /** An output could not be sent, so the turn must not be continued. */
  broken: boolean;
}

/** Remembered answered call ids, so a repeated event never runs a tool twice. */
const HANDLED_CALL_MEMORY = 200;

/**
 * Tracks which delegated responses are waiting on tool outputs so that
 * `response.create` is sent exactly once per turn, and never before every call
 * in that turn has its output on the wire.
 *
 * The backend rejects a `response.create` that arrives while an output is still
 * owed ("Submit the pending function call outputs before response.create",
 * "Missing function call outputs for: ..."), so a turn continues only when its
 * stream has ended AND nothing is pending. Calls can still arrive after an
 * earlier call in the same turn was answered, which is why the pending set —
 * not a one-shot flag — decides.
 */
export class ToolTurnTracker {
  private readonly turns = new Map<string, TurnState>();
  private readonly handled = new Set<string>();

  private key(delegationId: string | null) {
    return delegationId ?? "__none__";
  }

  private state(key: string): TurnState {
    const existing = this.turns.get(key);
    if (existing) return existing;
    const created: TurnState = { pending: new Set(), answered: 0, ended: false, broken: false };
    this.turns.set(key, created);
    return created;
  }

  private remember(callId: string) {
    this.handled.add(callId);
    while (this.handled.size > HANDLED_CALL_MEMORY) {
      const oldest = this.handled.values().next().value;
      if (oldest === undefined) break;
      this.handled.delete(oldest);
    }
  }

  /** Settle a turn: true when the response should be continued right now. */
  private settle(key: string, turn: TurnState): boolean {
    if (turn.pending.size > 0) return false;
    // The stream may still emit more calls; continue when it ends.
    if (!turn.ended) return false;
    this.turns.delete(key);
    return turn.answered > 0 && !turn.broken;
  }

  /** Register a call. Returns false when the call was already seen. */
  begin(call: LiveFunctionCall): boolean {
    if (this.handled.has(call.callId)) return false;
    const turn = this.state(this.key(call.delegationId));
    if (turn.pending.has(call.callId)) return false;
    // A fresh call means this delegation is streaming again.
    turn.ended = false;
    turn.pending.add(call.callId);
    this.remember(call.callId);
    return true;
  }

  /**
   * Mark a call answered. Pass `submitted: false` when the output could not be
   * sent, which keeps the turn from being continued without it. Returns true
   * when the response should continue now.
   */
  complete(call: LiveFunctionCall, submitted = true): boolean {
    const key = this.key(call.delegationId);
    const turn = this.turns.get(key);
    if (!turn || !turn.pending.delete(call.callId)) return false;
    if (submitted) turn.answered += 1;
    else turn.broken = true;
    return this.settle(key, turn);
  }

  /** Response stream ended. Returns true when all its calls were already answered. */
  finish(delegationId: string | null): boolean {
    const key = this.key(delegationId);
    const turn = this.turns.get(key);
    if (!turn) return false;
    turn.ended = true;
    return this.settle(key, turn);
  }

  /** Drop turn state after a protocol error so the session cannot wedge. */
  reset() {
    this.turns.clear();
  }

  /** True while any tool output is still owed to the backend. */
  get busy(): boolean {
    for (const turn of this.turns.values()) {
      if (turn.pending.size > 0) return true;
    }
    return false;
  }
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Live transcripts arrive as timed fragments with no turn boundaries. Group
 * fragments into utterances separated by silence gaps.
 */
export class TranscriptAccumulator {
  private current: TranscriptSegment | null = null;

  constructor(private readonly gapMs = 1_100) {}

  get text(): string {
    return this.current?.text ?? "";
  }

  /** Add a fragment. Returns the previous utterance when a gap closed it. */
  push(delta: string, startMs: number, endMs: number): TranscriptSegment | null {
    let closed: TranscriptSegment | null = null;
    if (this.current && startMs - this.current.endMs > this.gapMs) {
      closed = this.flush();
    }
    if (!this.current) {
      this.current = { text: "", startMs, endMs };
    }
    const needsSpace =
      this.current.text.length > 0 &&
      !/\s$/.test(this.current.text) &&
      !/^[\s.,!?;:'’)]/.test(delta);
    this.current.text = `${this.current.text}${needsSpace ? " " : ""}${delta}`.slice(-10_000);
    this.current.endMs = Math.max(this.current.endMs, endMs);
    return closed;
  }

  flush(): TranscriptSegment | null {
    const segment = this.current;
    this.current = null;
    if (!segment || !segment.text.trim()) return null;
    return { ...segment, text: segment.text.trim() };
  }
}

/** Text the Live model should speak the instant the wake word lands. */
export function wakeGreetingCommentary(studentName: string): string {
  return `${studentName} just said your wake word. Greet him right now in one short, warm sentence (vary the wording) and ask what he wants to work on. If his sentence already contained a request, greet in three words or fewer and handle the request immediately.`;
}

export function stateNote(awake: boolean): string {
  return awake
    ? "[STATE: awake] Respond normally until Atticus says goodbye."
    : "[STATE: standby] Stay completely silent until you hear the wake word \"Virgil\".";
}

/** Function outputs may carry text plus images for the vision-capable backend. */
export interface ToolResult {
  output: unknown;
  images?: string[];
}

export function serializeToolOutput(result: unknown, maxChars = 24_000) {
  const normalized: ToolResult =
    result && typeof result === "object" && "output" in (result as ToolResult)
      ? (result as ToolResult)
      : { output: result };
  const text =
    typeof normalized.output === "string"
      ? normalized.output
      : JSON.stringify(normalized.output ?? null);
  const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}…[truncated]` : text;
  if (!normalized.images?.length) return clipped;
  return [
    { type: "input_text" as const, text: clipped },
    ...normalized.images.map((image_url) => ({
      type: "input_image" as const,
      image_url,
      detail: "auto" as const,
    })),
  ];
}
