import { api } from "../lib/api";
import { voiceToolDefinitions } from "../../../shared/voice/tools";
import type { ToolExecutor } from "./liveSession";
import { captureUiSnapshot } from "./uiSnapshot";
import type { ScreenShare } from "./screenShare";
import { lessonNavigator, whiteboard, type LessonSection } from "./whiteboardStore";

export interface ToolContext {
  lessonId: string;
  screenShare: ScreenShare;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Executors for every tool in the shared catalog. The delegated reasoning model
 * calls these over the Live data channel; results (and images) go straight back
 * into its conversation.
 */
export function createToolExecutors(context: ToolContext): Record<string, ToolExecutor> {
  const { lessonId, screenShare } = context;
  const lessonIdOr = (value: unknown) => text(value) || lessonId;

  const executors: Record<string, ToolExecutor> = {
    look_at_screen: async () => {
      const description = captureUiSnapshot({ extra: [whiteboard.summary()] });
      const frame = await screenShare.captureFrame();
      const images = frame ? [frame] : [];
      const boardImage = whiteboard.getSnapshot().open ? whiteboard.image() : null;
      if (boardImage) images.push(boardImage);
      return {
        output: {
          interface: description,
          screenshot: frame
            ? "A screenshot of the shared screen is attached."
            : "Screen share is off; the description above was read directly from the live interface. Ask Atticus to press “Share screen” if you need to see something the description does not cover.",
          whiteboard_image: boardImage ? "The current whiteboard is attached as an image." : "The whiteboard is closed.",
        },
        images,
      };
    },
    navigate_lesson: async (args) => {
      const section = text(args.section, "learn") as LessonSection;
      const questionNumber = typeof args.question_number === "number" ? args.question_number : null;
      return { result: lessonNavigator.navigate({ section, questionNumber }) };
    },
    whiteboard_draw: async (args) => {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      const result = whiteboard.draw(steps, {
        clearFirst: Boolean(args.clear_first),
        caption: nullableText(args.caption) ?? null,
      });
      return {
        drawn: result.accepted,
        rejected_steps: result.rejected,
        animation_seconds: Math.round(result.durationMs / 100) / 10,
        board: whiteboard.summary(),
        note: "The steps are animating on the shared whiteboard now. Narrate briefly while they appear; do not repeat every label aloud.",
      };
    },
    whiteboard_clear: async () => {
      whiteboard.clear();
      return { cleared: true };
    },
    whiteboard_look: async () => {
      const image = whiteboard.image();
      return {
        output: {
          board: whiteboard.summary(),
          image: image ? "The whiteboard image is attached." : "The whiteboard is not mounted, so only the list above is available.",
        },
        images: image ? [image] : [],
      };
    },
    get_today_schedule: async () => api.todaySchedule(),
    get_current_lesson: async (args) => api.currentLesson(nullableText(args.subject)),
    get_lesson_questions: async (args) =>
      api.tool.lessonQuestions({
        lesson_id: lessonId,
        subject: args.subject ?? null,
        section: args.section ?? null,
        question_number: typeof args.question_number === "number" ? args.question_number : null,
        item_id: args.item_id ?? null,
        query: args.query ?? null,
      }),
    get_student_snapshot: async () => api.studentSnapshot(),
    get_previous_lesson_feedback: async (args) => api.previousFeedback(text(args.subject)),
    get_mastery_state: async (args) => api.masteryState(text(args.subject), nullableText(args.standard_or_unit)),
    search_curriculum: async (args) =>
      api.tool.searchCurriculum({
        query: text(args.query),
        ...(nullableText(args.subject) ? { subject: args.subject } : {}),
        ...(nullableText(args.unit) ? { unit: args.unit } : {}),
      }),
    record_verbal_check: async (args) =>
      api.tool.verbalCheck({
        lesson_id: lessonIdOr(args.lesson_id),
        skill: text(args.skill),
        result: text(args.result, "not_attempted"),
        ...(nullableText(args.note) ? { note: args.note } : {}),
      }),
    record_misconception: async (args) =>
      api.tool.misconception({
        lesson_id: lessonIdOr(args.lesson_id),
        concept: text(args.concept),
        note: text(args.note),
      }),
    record_mastery: async (args) =>
      api.tool.mastery({
        lesson_id: lessonIdOr(args.lesson_id),
        standard: text(args.standard),
        score: typeof args.score === "number" ? args.score : null,
        status: text(args.status, "not_assessed"),
      }),
    save_tutor_note: async (args) =>
      api.tool.tutorNote({ lesson_id: lessonIdOr(args.lesson_id), note: text(args.note) }),
    mark_lesson_completed: async (args) => api.tool.lessonCompleted(lessonIdOr(args.lesson_id)),
    get_assignment_instructions: async (args) => api.tool.assignment(text(args.assignment_id)),
    get_worked_examples: async (args) => api.tool.workedExamples(lessonIdOr(args.lesson_id)),
    get_allowed_answer_support: async (args) =>
      api.tool.answerSupport(lessonIdOr(args.lesson_id), text(args.item_id)),
  };

  for (const definition of voiceToolDefinitions) {
    if (!executors[definition.name]) {
      throw new Error(`Tool ${definition.name} has no browser executor`);
    }
  }
  return executors;
}
