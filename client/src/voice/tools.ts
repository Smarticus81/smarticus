import { api } from "../lib/api";
import { voiceToolDefinitions } from "../../../shared/voice/tools";
import type { ToolExecutor } from "./liveSession";
import { captureUiSnapshot } from "./uiSnapshot";
import type { ScreenShare } from "./screenShare";
import { lessonNavigator, whiteboard, type LessonSection } from "./whiteboardStore";
import { reader } from "./readerStore";

export interface ToolContext {
  lessonId: string;
  screenShare: ScreenShare;
  /**
   * Bytes an image may take in the backend's bounded input history. Captures are
   * skipped when this is 0, so we do not spend time building a 200KB data URL
   * that cannot be sent.
   */
  imageAllowance?: () => number;
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
  const canSendImage = () => (context.imageAllowance?.() ?? 0) > 0;

  const executors: Record<string, ToolExecutor> = {
    look_at_screen: async () => {
      // Compact rather than truncated: this is the most-called tool and every
      // call is charged against a 32768-byte session history, but the learner's
      // draft and the whiteboard summary must survive the trim.
      const description = captureUiSnapshot({
        compact: true,
        extra: [whiteboard.summary(), reader.summary()],
      });
      const withImages = canSendImage();
      // Both captures at once: this tool holds the turn open, and the learner
      // hears nothing while it runs, so the two waits should overlap.
      const [frame, boardImage] = await Promise.all([
        withImages ? screenShare.captureFrame() : Promise.resolve(null),
        withImages && whiteboard.getSnapshot().open
          ? Promise.resolve(whiteboard.image())
          : Promise.resolve(null),
      ]);
      const images = frame ? [frame] : [];
      if (boardImage) images.push(boardImage);
      return {
        output: {
          interface: description,
          screenshot: frame
            ? "A screenshot of the shared screen is attached."
            : screenShare.active
              ? "Atticus is sharing his screen, but the picture does not fit this session's backend history, so the description above is what you have. It is read from the live interface and includes his drafts, so trust it."
              : "Screen share is off; the description above was read directly from the live interface. Ask Atticus to press “Share screen” if you need to see something the description does not cover.",
          whiteboard_image: boardImage
            ? "The current whiteboard is attached as an image."
            : whiteboard.getSnapshot().open
              ? "The whiteboard is open; the listed contents above describe it."
              : "The whiteboard is closed.",
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
    whiteboard_open: async () => {
      whiteboard.setOpen(true);
      return { open: true, board: whiteboard.summary() };
    },
    whiteboard_close: async () => {
      whiteboard.setOpen(false);
      return { open: false };
    },
    browse_web: async (args) => {
      const url = nullableText(args.url) ?? null;
      const query = nullableText(args.query) ?? null;
      const purpose = nullableText(args.purpose) ?? null;
      if (!url && !query) {
        return { error: "Give a url to open or a query to search for." };
      }
      reader.beginLoad(purpose ?? query);
      try {
        const found = await api.tool.readPage({ url, query });
        reader.show(found.page);
        return {
          opened: found.page.url,
          site: found.page.site,
          title: found.page.title,
          // The learner can see the panel; this is what it says, so Virgil can
          // teach from the same words rather than guessing at them.
          page_text: found.summary,
          pictures: found.page.images.length,
          note: "The page is on screen beside the whiteboard. Talk him through it; point at a heading or a picture rather than reading it out word for word.",
          ...(found.searchNote ? { search_note: found.searchNote } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "That page could not be opened.";
        reader.fail(message);
        return { error: message };
      }
    },
    close_browser: async () => {
      reader.close();
      return { closed: true };
    },
    whiteboard_look: async () => {
      const image = canSendImage() ? whiteboard.image() : null;
      return {
        output: {
          board: whiteboard.summary(),
          image: image
            ? "The whiteboard image is attached."
            : "No image this time, so work from the listed contents above; they include anything Atticus drew with the pen.",
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
