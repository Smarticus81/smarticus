import { useSyncExternalStore } from "react";
import type { SubmissionView } from "../lib/api";

/**
 * The bridge between the lesson's answer boxes and handing work in.
 *
 * The answers live in the workspace's React state, but two other things need
 * them: the Submit control, and Virgil, who can hand work in when Atticus says
 * he is finished. Rather than thread that state through the tutor, the
 * workspace registers how to read and submit it, the way it already registers
 * how to navigate itself.
 */

export type QuestionSection =
  | "guided_practice"
  | "independent_practice"
  | "exit_ticket";

export interface WorkAnswer {
  item_id: string;
  section: QuestionSection;
  prompt: string;
  answer: string;
}

export interface SubmitRequest {
  mode: "platform" | "paper";
  note?: string;
  /** Photographs of paper work, already captured as JPEG data URLs. */
  photos?: string[];
}

export interface WorkHandlers {
  /** Every practice item and whatever Atticus has written in it so far. */
  collect: () => WorkAnswer[];
  submit: (request: SubmitRequest) => Promise<SubmissionView>;
}

export interface WorkState {
  /** The most recent submission for the open lesson, if any. */
  last: SubmissionView | null;
  submitting: boolean;
  error: string | null;
  version: number;
}

const empty: WorkState = { last: null, submitting: false, error: null, version: 0 };

class LessonWork {
  private handlers: WorkHandlers | null = null;
  private state: WorkState = empty;
  private readonly listeners = new Set<() => void>();

  register(handlers: WorkHandlers | null) {
    this.handlers = handlers;
    if (!handlers) this.setState({ ...empty, version: this.state.version + 1 });
  }

  get ready(): boolean {
    return this.handlers !== null;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WorkState => this.state;

  private setState(next: WorkState) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Reset when a different lesson opens, so one lesson's receipt is not shown on another. */
  reset() {
    this.setState({ ...empty, version: this.state.version + 1 });
  }

  collect(): WorkAnswer[] {
    return this.handlers?.collect() ?? [];
  }

  /** How much of the written work has something in it. */
  progress(): { answered: number; total: number } {
    const answers = this.collect();
    return {
      answered: answers.filter((entry) => entry.answer.trim()).length,
      total: answers.length,
    };
  }

  async submit(request: SubmitRequest): Promise<SubmissionView> {
    if (!this.handlers) throw new Error("No lesson is open to hand in.");
    this.setState({ ...this.state, submitting: true, error: null });
    try {
      const view = await this.handlers.submit(request);
      this.setState({
        last: view,
        submitting: false,
        error: null,
        version: this.state.version + 1,
      });
      return view;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "That could not be handed in.";
      this.setState({ ...this.state, submitting: false, error: message });
      throw error;
    }
  }

  /**
   * One line for the tutor's view of the interface, kept terse: it rides in
   * every look_at_screen answer, and that answer is charged against a bounded
   * session history.
   */
  summary(): string {
    if (!this.handlers) return "No lesson work open.";
    const { answered, total } = this.progress();
    const last = this.state.last;
    const handed = last
      ? `handed in (${last.mode}) ${new Date(last.submitted_at).toLocaleTimeString()}`
      : "not handed in";
    return `Written work: ${answered}/${total} answered, ${handed}.`;
  }
}

export const lessonWork = new LessonWork();

export function useLessonWork(): WorkState {
  return useSyncExternalStore(lessonWork.subscribe, lessonWork.getSnapshot);
}
