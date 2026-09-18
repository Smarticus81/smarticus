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

/**
 * A farewell is a short, deliberate thing to say. Matching the pattern anywhere
 * in any transcript is too eager: a noisy line that happens to carry "bye" used
 * to drop the session into standby, where the model is under orders to say
 * nothing at all, and the learner was left talking to a tutor that had been
 * told to ignore him. Requiring the farewell to be most of a short utterance
 * keeps the real goodbye working and leaves the accidental one alone.
 */
export const MAX_GOODBYE_WORDS = 8;

function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}']+/gu);
  return words ? words.length : 0;
}

export function containsWakeWord(text: string): boolean {
  return WAKE_PATTERN.test(text) || WAKE_VARIANTS.test(text);
}

export function containsGoodbye(text: string): boolean {
  if (!GOODBYE_PATTERN.test(text)) return false;
  const words = wordCount(text);
  return words > 0 && words <= MAX_GOODBYE_WORDS;
}

/**
 * How short an utterance has to be before it counts as a fragment rather than a
 * sentence. Two words or fewer, with no sentence-ending punctuation, is what a
 * breaking microphone produces; it is also what "yes" and "okay" look like, so
 * one of these means nothing on its own and only a run of them is a signal.
 */
const FRAGMENT_MAX_WORDS = 2;

/**
 * Short answers that are answers. A tutoring session is full of "yes", "no",
 * "twelve" and "not yet"; counting those as a broken microphone would have the
 * tutor interrupt a working conversation to ask him to check his hardware.
 */
const SHORT_BUT_WHOLE =
  /^(?:yes|yeah|yep|no|nope|nah|ok|okay|sure|right|correct|wrong|done|ready|maybe|stop|wait|pause|again|repeat|next|back|hi|hey|hello|bye|thanks|thank you|please|true|false|i think so|not yet|i don't know|dunno|got it|keep going|go on|move on|[\d][\d.,/%:-]*)$/i;

export function looksLikeFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/[.!?]$/.test(trimmed)) return false;
  if (SHORT_BUT_WHOLE.test(trimmed.replace(/[.,!?]+$/, ""))) return false;
  return wordCount(trimmed) <= FRAGMENT_MAX_WORDS;
}

/** Consecutive fragments before the studio tells the model the audio is broken. */
export const FRAGMENT_RUN_BEFORE_WARNING = 3;

/**
 * Silent context for a microphone that is breaking up.
 *
 * Without it the model has only scraps to go on, and a model with scraps and a
 * lesson in its prompt will reliably invent a question about that lesson. Said
 * plainly, "I am only catching pieces" is the honest move and the one that gets
 * the learner to fix his microphone.
 */
export function brokenAudioNote(studentName: string, samples: string[]): string {
  const heard = samples
    .slice(-FRAGMENT_RUN_BEFORE_WARNING)
    .map((sample) => JSON.stringify(sample.slice(0, 40)))
    .join(", ");
  return `[AUDIO] The last ${FRAGMENT_RUN_BEFORE_WARNING} things ${studentName} said arrived as fragments (${heard}), so his microphone or connection is breaking up. Tell him plainly, in one sentence, that you are only catching pieces and ask him to repeat it or check his microphone. Do not guess what he meant, do not answer the fragment, and do not fall back to the current lesson for something to talk about.`;
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
/** A tool that only touches the interface, the board or the reader panel. */
export const FAST_TOOL_TIMEOUT_MS = 5_000;
/** A tool that calls the studio's own API. */
export const LESSON_TOOL_TIMEOUT_MS = 10_000;

const FAST_TOOLS = new Set([
  "navigate_lesson",
  "whiteboard_draw",
  "whiteboard_clear",
  "whiteboard_open",
  "whiteboard_close",
  "whiteboard_look",
  "close_browser",
]);

/**
 * The deadline for one tool.
 *
 * A turn stays open until every call in it is answered, so the learner hears
 * nothing while a call hangs. Only `browse_web` fetches a page from the open
 * internet and deserves the full twenty seconds; a local one that has not
 * answered in five is broken, and waiting out the difference is dead air.
 */
export function toolTimeoutMs(name: string): number {
  if (FAST_TOOLS.has(name)) return FAST_TOOL_TIMEOUT_MS;
  if (name === "browse_web") return TOOL_TIMEOUT_MS;
  return LESSON_TOOL_TIMEOUT_MS;
}

/** Resolve with the promise, or reject once `ms` has passed. */
export function withToolTimeout<T>(
  promise: Promise<T>,
  name: string,
  ms = toolTimeoutMs(name),
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
 * Silence that ends an utterance rather than punctuating one.
 *
 * At 1.1s an ordinary thinking pause split one sentence into several, which is
 * how "Virgil, what does equivalent mean" reached the wake and farewell checks
 * as three unrelated scraps.
 */
export const INPUT_UTTERANCE_GAP_MS = 1_800;

/**
 * Live transcripts arrive as timed fragments with no turn boundaries. Group
 * fragments into utterances separated by silence gaps.
 */
export class TranscriptAccumulator {
  private current: TranscriptSegment | null = null;

  constructor(private readonly gapMs = INPUT_UTTERANCE_GAP_MS) {}

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

/**
 * A silent reminder sent when background work starts.
 *
 * Instruction-following drifts over a long session, and the drift that shows
 * up first is the stall phrase: "checking", "one second", "let me look". The
 * studio already puts a status line on screen, so the spoken version buys the
 * learner nothing and costs him the wait. This goes on the thinking channel,
 * which is context rather than speech, so it never becomes a turn of its own.
 */
export function backgroundWorkNote(activity: string | null): string {
  const doing = activity ? activity.toLowerCase() : "working on that";
  return `[BACKGROUND] You are ${doing} in the background, and Atticus can see that on screen. Do not announce it: no "checking", no "one second", no "let me look at that". Keep talking about the subject itself, or say nothing until the answer lands, then carry on the thought you started.`;
}

/**
 * The session's wake state, written so the newest one wins.
 *
 * `session.instructions.append` is append-only: every toggle leaves its text in
 * the session for good, so after a few of them the model is holding both "stay
 * completely silent" and "respond normally" with nothing to say which is
 * current. Numbering them and saying outright that the highest number governs
 * turns a contradictory pile back into one readable state.
 */
export function stateNote(awake: boolean, sequence: number): string {
  const head = `[STATE #${sequence}: ${awake ? "awake" : "standby"}] This replaces every earlier [STATE] line; only the highest-numbered one is in force.`;
  return awake
    ? `${head} Atticus is talking with you now. Respond normally until he clearly says goodbye.`
    : `${head} Stay completely silent until you hear the wake word "Virgil" again.`;
}

/**
 * The delegated backend keeps a bounded input history: at most 128 items and
 * 32768 UTF-8 bytes per session. Going over it fails the turn with "Backend
 * response input history is limited to ...", so everything the browser adds is
 * measured against this budget before it is sent.
 */
export const HISTORY_MAX_ITEMS = 128;
export const HISTORY_MAX_BYTES = 32_768;
/** Held back so a function call can always be answered, however chatty the UI was. */
export const HISTORY_RESERVED_ITEMS = 24;
export const HISTORY_RESERVED_BYTES = 12_288;
/**
 * Default ceiling for a single tool output. A session's whole history is 32768
 * bytes, so this number decides how many tool calls a session affords. A
 * measured look_at_screen payload is ~1000 bytes on a practice question, so this
 * leaves headroom for a long written draft while still affording roughly twenty
 * calls per session.
 */
export const DEFAULT_TOOL_OUTPUT_BYTES = 1_536;
/**
 * Most an image may take from the history. Measured data URLs: a 1280px
 * screenshot is ~200KB, even a 384px one ~22KB, and a whiteboard PNG ~29KB —
 * all beyond a 32768-byte session, so in practice the tutor's eyes are the text
 * snapshot, which already carries the learner's drafts and the question. Raise
 * this if the backend's history limit ever grows.
 */
export const MAX_IMAGE_HISTORY_BYTES = 8_192;
/** Below this there is not enough room left for an answer worth sending. */
export const HISTORY_MIN_USEFUL_BYTES = 256;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Truncate to a UTF-8 byte budget without splitting a character or surrogate pair. */
export function clipToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (utf8Bytes(text) <= maxBytes) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8Bytes(text.slice(0, mid)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  const code = low > 0 ? text.charCodeAt(low - 1) : 0;
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? low - 1 : low);
}

export interface HistoryUsage {
  items: number;
  bytes: number;
  maxItems: number;
  maxBytes: number;
  full: boolean;
}

/**
 * Tracks what the browser has added to the delegated backend's input history.
 *
 * Items are append-only from here, so the budget cannot be reclaimed: the job
 * is to spend it well. Optional context (what the learner is looking at) yields
 * to required items (function call outputs), because an unanswered call stalls
 * the turn while a missing UI note only costs the model a tool call.
 */
export class BackendHistoryBudget {
  private items = 0;
  private bytes = 0;
  private declaredFull = false;

  constructor(
    private readonly maxItems = HISTORY_MAX_ITEMS,
    private readonly maxBytes = HISTORY_MAX_BYTES,
    private readonly reservedItems = HISTORY_RESERVED_ITEMS,
    private readonly reservedBytes = HISTORY_RESERVED_BYTES,
  ) {}

  /** Bytes an item of this kind may still use; 0 means it cannot be sent. */
  allowance(required: boolean): number {
    if (this.declaredFull) return 0;
    const itemsLeft = this.maxItems - this.items - (required ? 0 : this.reservedItems);
    if (itemsLeft <= 0) return 0;
    return Math.max(0, this.maxBytes - this.bytes - (required ? 0 : this.reservedBytes));
  }

  /** Bytes images may use right now, which is 0 unless one would genuinely fit. */
  get imageAllowance(): number {
    return Math.min(MAX_IMAGE_HISTORY_BYTES, this.allowance(false));
  }

  /** Record an item that was actually sent. */
  record(byteSize: number) {
    this.items += 1;
    this.bytes += byteSize;
  }

  /** The backend reported the history is full; stop adding to it. */
  markFull() {
    this.declaredFull = true;
  }

  /** True once nothing worth sending would still fit. */
  get full(): boolean {
    return this.declaredFull || this.allowance(true) < HISTORY_MIN_USEFUL_BYTES;
  }

  get usage(): HistoryUsage {
    return {
      items: this.items,
      bytes: this.bytes,
      maxItems: this.maxItems,
      maxBytes: this.maxBytes,
      full: this.full,
    };
  }
}

/** Function outputs may carry text plus images for the vision-capable backend. */
export interface ToolResult {
  output: unknown;
  images?: string[];
}

export interface ToolOutputLimits {
  /** UTF-8 bytes the text may occupy. */
  maxBytes?: number;
  /** UTF-8 bytes images may occupy. Images are dropped when they do not fit. */
  imageBytes?: number;
}

/**
 * Turn a tool result into a backend item payload that fits the given budget.
 *
 * Images are data URLs measured in the hundreds of kilobytes, far more than a
 * whole session's history allows, so they ride only when the caller grants
 * enough image budget; otherwise the model is told the description is all it
 * gets, rather than being left to wonder where the picture went.
 */
export function serializeToolOutput(result: unknown, limits: ToolOutputLimits | number = {}) {
  const { maxBytes = DEFAULT_TOOL_OUTPUT_BYTES, imageBytes = 0 } =
    typeof limits === "number" ? { maxBytes: limits, imageBytes: 0 } : limits;
  const normalized: ToolResult =
    result && typeof result === "object" && "output" in (result as ToolResult)
      ? (result as ToolResult)
      : { output: result };
  const text =
    typeof normalized.output === "string"
      ? normalized.output
      : JSON.stringify(normalized.output ?? null);

  const images: string[] = [];
  let imagesLeft = imageBytes;
  let dropped = 0;
  for (const image of normalized.images ?? []) {
    const cost = utf8Bytes(image);
    if (cost <= imagesLeft) {
      images.push(image);
      imagesLeft -= cost;
    } else {
      dropped += 1;
    }
  }

  const note = dropped
    ? `\n[${dropped} image${dropped > 1 ? "s" : ""} could not be attached: the backend history has no room for them. The description above is what you have to work with — call the tool again after the learner changes something rather than guessing at pixels.]`
    : "";
  const room = Math.max(0, maxBytes - utf8Bytes(note));
  const clipped =
    utf8Bytes(text) > room ? `${clipToBytes(text, Math.max(0, room - 16))}…[truncated]` : text;
  const body = `${clipped}${note}`;

  if (!images.length) return body;
  return [
    { type: "input_text" as const, text: body },
    ...images.map((image_url) => ({
      type: "input_image" as const,
      image_url,
      detail: "auto" as const,
    })),
  ];
}
