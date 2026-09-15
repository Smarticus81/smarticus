import { useSyncExternalStore } from "react";
import {
  WhiteboardStepSchema,
  type WhiteboardStep,
} from "../../../shared/voice/whiteboard";
import {
  advanceQueue,
  opProgress,
  stepDuration,
  summarizeBoard,
  type BoardAuthor,
  type BoardOp,
} from "./whiteboardEngine";

export interface WhiteboardState {
  ops: BoardOp[];
  open: boolean;
  caption: string | null;
  /** Bumps whenever ops or caption change. */
  version: number;
}

type Listener = () => void;

/**
 * A tiny external store shared by the tutor's tools and the canvas component.
 * The voice session pushes animated steps here; the whiteboard renders them and
 * lets the student draw back.
 */
class WhiteboardStore {
  private state: WhiteboardState = { ops: [], open: false, caption: null, version: 0 };
  private listeners = new Set<Listener>();
  private nextId = 1;
  private canvas: HTMLCanvasElement | null = null;
  private instant = false;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private commit(patch: Partial<WhiteboardState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const listener of this.listeners) listener();
  }

  /** Reduced-motion preference renders every step at once. */
  setInstant(instant: boolean) {
    this.instant = instant;
  }

  registerCanvas(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
  }

  setOpen(open: boolean) {
    if (this.state.open !== open) this.commit({ open });
  }

  /** Queue tutor steps. Returns the expected animation time in ms. */
  draw(
    rawSteps: unknown[],
    options: { clearFirst?: boolean; caption?: string | null; author?: BoardAuthor } = {},
  ): { accepted: number; rejected: number; durationMs: number } {
    const author = options.author ?? "virgil";
    const accepted: WhiteboardStep[] = [];
    let rejected = 0;
    for (const raw of rawSteps) {
      const parsed = WhiteboardStepSchema.safeParse(raw);
      if (parsed.success) accepted.push(parsed.data);
      else rejected += 1;
    }
    const ops: BoardOp[] = accepted.map((step) => ({
      id: this.nextId++,
      author,
      step,
      startedAt: null,
      duration: this.instant ? 0 : stepDuration(step),
    }));
    const base = options.clearFirst ? [] : this.state.ops;
    this.commit({
      ops: [...base, ...ops].slice(-400),
      open: true,
      caption: options.caption ?? (options.clearFirst ? null : this.state.caption),
    });
    return {
      accepted: ops.length,
      rejected,
      durationMs: ops.reduce((total, op) => total + op.duration, 0),
    };
  }

  /** A freehand stroke by the student in board units. */
  addStroke(points: number[], color: string, width: number) {
    if (points.length < 4) return;
    const op: BoardOp = {
      id: this.nextId++,
      author: "student",
      step: { kind: "path", points, closed: false, width, color },
      startedAt: 0,
      duration: 0,
    };
    this.commit({ ops: [...this.state.ops, op].slice(-400) });
  }

  clear(caption: string | null = null) {
    this.commit({ ops: [], caption });
  }

  /** Animation tick: start queued ops when their turn comes. */
  tick(now: number): { animating: boolean } {
    const ops = this.state.ops;
    if (advanceQueue(ops, now)) {
      // Mutated in place; notify without changing identity semantics for React.
      this.commit({ ops: [...ops] });
    }
    return {
      animating: ops.some((op) => op.startedAt === null || opProgress(op, now) < 1),
    };
  }

  get busy(): boolean {
    const now = performance.now();
    return this.state.ops.some((op) => op.startedAt === null || opProgress(op, now) < 1);
  }

  summary(): string {
    return summarizeBoard(this.state.ops);
  }

  /** PNG data URL of the rendered board, if a canvas is mounted. */
  image(): string | null {
    const canvas = this.canvas;
    if (!canvas || !canvas.width) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
}

export const whiteboard = new WhiteboardStore();

export function useWhiteboard(): WhiteboardState {
  return useSyncExternalStore(whiteboard.subscribe, whiteboard.getSnapshot, whiteboard.getSnapshot);
}

/** Lesson navigation requested by the tutor; the workspace registers a handler. */
export type LessonSection = "learn" | "explore" | "practice" | "words" | "reflect";
export interface LessonNavigationRequest {
  section: LessonSection;
  questionNumber: number | null;
}
type NavigationHandler = (request: LessonNavigationRequest) => string;

class LessonNavigator {
  private handler: NavigationHandler | null = null;
  register(handler: NavigationHandler | null) {
    this.handler = handler;
  }
  navigate(request: LessonNavigationRequest): string {
    if (!this.handler) return "The lesson workspace is not open, so navigation is unavailable.";
    return this.handler(request);
  }
}

export const lessonNavigator = new LessonNavigator();
