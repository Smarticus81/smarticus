import { api, ApiError } from "../lib/api";
import { schoolVoiceToolDefinitions, isSchoolVoiceTool } from "../../../shared/voice/schoolTools";
import type { ToolExecutor } from "./session";
import { utf8Bytes } from "./liveEvents";
import { ScreenShare } from "./screenShare";
import { whiteboard } from "./whiteboardStore";
import { reader } from "./readerStore";
import { camera } from "./camera";
import { selectedSchoolAssignment, type SchoolTutorSession } from "./schoolSession";

interface SchoolToolContext extends SchoolTutorSession {
  screenShare: ScreenShare;
  imageAllowance?: () => number;
  /** A late tool cannot act after the workspace was closed or access expired. */
  isActive?: () => boolean;
  onAccessLost?: () => void;
}

const optionalText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const NOT_SAVED = "This is tutoring only. It does not save a school submission, mark work complete, or change grades.";

/**
 * Deliberately independent from public lesson executors. No public curriculum,
 * account snapshot, search, submission, progress or tutor-note path is reachable.
 */
export function createSchoolToolExecutors(context: SchoolToolContext): Record<string, ToolExecutor> {
  const assignment = selectedSchoolAssignment(context);
  const course = context.context.courses.find(item => item.id === assignment.courseId);
  const allowance = () => Math.max(0, context.imageAllowance?.() ?? 0);
  const active = () => context.isActive?.() ?? true;
  const selection = () => ({
    assignment_id: assignment.id,
    lesson_id: `school:${assignment.id}`,
    title: assignment.title,
    course: course?.label,
    unit: assignment.unit,
    kind: assignment.kind,
    status: assignment.status,
    instructions: assignment.instructions,
    tutoring_focus: assignment.tutoringFocus,
    timing_note: assignment.timingNote,
    source_url: assignment.sourceUrl ?? course?.sourceUrl ?? null,
  });

  async function describeImage(image: string, question: string | null, surface: "monitor" | "window" | "browser" | "unknown") {
    if (!active()) return null;
    try {
      const result = await api.describeSchoolScreen({
        assignmentId: assignment.id,
        expectedRevision: context.revision,
        image,
        surface,
        question,
      });
      return active() ? result.description : null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) context.onAccessLost?.();
      return null;
    }
  }

  const executors: Record<string, ToolExecutor> = {
    get_today_schedule: async () => ({
      source: context.context.sourceName,
      as_of: context.context.asOf,
      time_zone: context.context.timeZone,
      timezone_note: context.context.timezoneNote,
      schedule: context.context.schedule,
      workload: context.context.workload,
      cautions: context.context.cautions,
      selected_assignment: selection(),
      note: "These are the saved school schedule notes, not a live school-portal check. Preserve reported/unconfirmed labels; do not invent dates or convert unspecified time zones.",
    }),
    get_current_lesson: async () => ({ selected_assignment: selection(), note: NOT_SAVED }),
    get_assignment_instructions: async () => ({ selected_assignment: selection(), course_instructions: course?.instructions ?? [], note: NOT_SAVED }),
    get_worked_examples: async () => ({
      selected_assignment: selection(),
      examples: [],
      guidance: "No official worked examples were imported. For permitted practice, explain the selected assignment using a clearly labeled tutor-created parallel example and work through the reasoning. Do not solve, hint at or confirm answers to an active school assessment, benchmark, quiz, test or graded independent-work item. Do not pretend an example is an official school answer key.",
    }),
    get_allowed_answer_support: async () => ({
      selected_assignment: selection(),
      guidance: "Give clear explanations and full parallel worked examples for permitted practice. Use the actual school instructions. Active school assessments, benchmarks, quizzes, tests and graded independent-work items must stay independent: explain non-content directions only, with no answers, hints, choice elimination or correctness feedback. Ask to see missing directions instead of inventing them. No official answer key was imported.",
      note: NOT_SAVED,
    }),
    navigate_lesson: async () => {
      // The public lessonNavigator is intentionally not used in School.
      if (typeof document !== "undefined") {
        document.querySelector<HTMLElement>("[data-school-assignment]")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      }
      return { selected_assignment: selection(), note: "The selected school assignment is open. Choose a different assignment in School to change it." };
    },
    close_browser: async () => {
      reader.close();
      return { closed: true };
    },
    whiteboard_draw: async args => {
      const result = whiteboard.draw(Array.isArray(args.steps) ? args.steps : [], {
        clearFirst: Boolean(args.clear_first), caption: optionalText(args.caption),
      });
      return { drawn: result.accepted, rejected_steps: result.rejected, board: whiteboard.summary(), note: NOT_SAVED };
    },
    whiteboard_clear: async () => { whiteboard.clear(); return { cleared: true }; },
    whiteboard_open: async () => { whiteboard.setOpen(true); return { open: true, board: whiteboard.summary() }; },
    whiteboard_close: async () => { whiteboard.setOpen(false); return { open: false }; },
    whiteboard_look: async () => {
      const image = allowance() ? whiteboard.image() : null;
      return { output: { board: whiteboard.summary() }, images: image && utf8Bytes(image) <= allowance() ? [image] : [] };
    },
    look_at_screen: async args => {
      // Read only the school workspace, never the parent access form or public
      // work store. Nothing in this tool is put in local/session storage.
      const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-school-workspace]");
      const notes = root ? [...root.querySelectorAll<HTMLTextAreaElement>("textarea")]
        .map(field => field.value.trim()).filter(Boolean).slice(0, 4).map(value => value.slice(0, 2000)) : [];
      const visibleText = root?.innerText?.slice(0, 2400) ?? "";
      const captured = context.screenShare.active ? await context.screenShare.captureFrame() : null;
      const frame = captured && utf8Bytes(captured) <= allowance() ? captured : null;
      const description = captured && !frame
        ? await describeImage(captured, optionalText(args.reason), context.screenShare.surface) : null;
      return {
        output: {
          selected_assignment: selection(),
          workspace: visibleText,
          learner_notes: notes,
          whiteboard: whiteboard.summary(),
          shared_screen: description ?? (frame ? "The shared screen image is attached." : context.screenShare.active ? "The shared picture could not be read. Ask the learner to show or read the relevant question." : "Screen sharing is off. The saved school assignment and workspace above are available."),
          note: NOT_SAVED,
        },
        images: frame ? [frame] : [],
      };
    },
    look_through_camera: async () => {
      if (!camera.active) return { error: "The camera is off. Ask the learner to turn it on before reading the page." };
      const captured = await camera.captureFrame();
      const frame = captured && utf8Bytes(captured) <= allowance() ? captured : null;
      const description = captured && !frame
        ? await describeImage(captured, "Read the schoolwork visible on the learner's page. Say if it is blurred or cut off.", "unknown") : null;
      return {
        output: { camera: description ?? (frame ? "The learner's page is attached. Read only what is visible." : "The page could not be read. Ask the learner to read the relevant question."), note: NOT_SAVED },
        images: frame ? [frame] : [],
      };
    },
  };

  // Return only the explicit safe catalog, even if public tools are added later.
  const safe: Record<string, ToolExecutor> = Object.create(null);
  for (const definition of schoolVoiceToolDefinitions) {
    const executor = executors[definition.name];
    if (!isSchoolVoiceTool(definition.name) || !executor) throw new Error("The school tutor tool setup is incomplete.");
    safe[definition.name] = async (args, call) => {
      if (!active()) return { error: "The school session is closed. Reopen School to continue." };
      try {
        const result = await executor(args, call);
        return active() ? result : { error: "The school session is closed. Reopen School to continue." };
      } catch {
        return { error: "The school tutor could not complete that action. Try again." };
      }
    };
  }
  return safe;
}
