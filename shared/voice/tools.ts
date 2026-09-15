import { z } from "zod";
import { SubjectEnum } from "../schemas/lesson.js";
import { QuestionSectionEnum } from "../schemas/api.js";
import { WhiteboardDrawSchema } from "./whiteboard.js";

export const LessonSectionEnum = z.enum([
  "learn",
  "explore",
  "practice",
  "words",
  "reflect",
]);

export interface VoiceToolDefinition<T extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  parameters: T;
}

function define<T extends z.ZodObject>(
  definition: VoiceToolDefinition<T>,
): VoiceToolDefinition<T> {
  return definition;
}

/**
 * Function tools offered to the delegated reasoning model (gpt-6-astra). The
 * browser executes every call over the Live data channel, so the catalog lives
 * in shared code and both sides agree on names and argument shapes.
 */
export const voiceToolDefinitions = [
  define({
    name: "look_at_screen",
    description:
      "See what Atticus sees right now. Returns a structured description of the visible lesson interface (section, question, his current draft, whiteboard contents, focused control) and, when he has shared his screen, a screenshot image. Call this before commenting on anything on screen, when he says 'this', 'here', or 'what I wrote', or whenever knowing the interface state would improve your help.",
    parameters: z.object({ reason: z.string().max(200).nullable() }).strict(),
  }),
  define({
    name: "navigate_lesson",
    description:
      "Move the lesson interface for Atticus: open a lesson section and optionally jump to a practice question by number. Use it when he asks to go somewhere or when you want him to see a specific question.",
    parameters: z
      .object({
        section: LessonSectionEnum,
        question_number: z.number().int().positive().nullable(),
      })
      .strict(),
  }),
  define({
    name: "whiteboard_draw",
    description:
      "Draw or write on the shared whiteboard, animated live while you talk. The board is 1000 wide by 600 tall; (0,0) is top-left. Build explanations step by step: text for labels and equations, line/arrow for connections, rect/circle for shapes, number_line and fraction_bar for math models, table for organized data, path for freehand sketches, highlight to emphasize, pause to pace. Keep text short and large (size 28-40). Never write the final answer to an assigned question; draw a different analogous example instead.",
    parameters: WhiteboardDrawSchema,
  }),
  define({
    name: "whiteboard_clear",
    description: "Erase everything on the shared whiteboard.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "whiteboard_open",
    description:
      "Open the shared whiteboard so Atticus can see it, and give it the stage. Drawing opens it automatically, so use this when you want the board visible before you draw, or when he asks to see it.",
    parameters: z.object({ reason: z.string().max(200).nullable() }).strict(),
  }),
  define({
    name: "whiteboard_close",
    description:
      "Put the whiteboard away and give the space back to the lesson. Use it when the drawing is finished with, or when he asks you to clear the view.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "browse_web",
    description:
      "Open a page on the shared screen for Atticus to read with you. Give a url to open a specific page, or a query to search and open the best result. The page is fetched, cleaned up and shown beside the whiteboard, and the readable text comes back to you so you can teach from it and point things out. Use it for current facts, real sources, images of real places and things, and anything worth looking at together rather than just describing.",
    parameters: z
      .object({
        url: z.string().max(600).nullable(),
        query: z.string().max(300).nullable(),
        purpose: z.string().max(200).nullable(),
      })
      .strict(),
  }),
  define({
    name: "close_browser",
    description: "Close the shared reading panel and give the space back.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "whiteboard_look",
    description:
      "Look at the whiteboard, including anything Atticus drew with the pen. Returns an image of the board and a list of its contents. Call this when he says he drew or wrote something, or before building on existing work.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "get_today_schedule",
    description: "Get today's schedule including all lessons and goals.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "get_current_lesson",
    description:
      "Get the current student-safe lesson context, optionally filtered by subject.",
    parameters: z.object({ subject: SubjectEnum.nullable() }).strict(),
  }),
  define({
    name: "get_lesson_questions",
    description:
      "Resolve the exact text of any guided-practice, independent-practice, or exit-ticket question in the selected lesson or elsewhere in the selected lesson's day. You MUST call this whenever the student refers to a question by number, item id, section, subject, or partial wording. If multiple matches return, ask which returned section they mean; never claim the question is unavailable.",
    parameters: z
      .object({
        subject: SubjectEnum.nullable(),
        section: QuestionSectionEnum.nullable(),
        question_number: z.number().int().positive().nullable(),
        item_id: z.string().max(128).nullable(),
        query: z.string().max(500).nullable(),
      })
      .strict(),
  }),
  define({
    name: "get_student_snapshot",
    description:
      "Get current mastery evidence, misconceptions, and recent voice-session summaries.",
    parameters: z.object({}).strict(),
  }),
  define({
    name: "get_previous_lesson_feedback",
    description: "Get previous teacher feedback and tutor summaries for a subject.",
    parameters: z.object({ subject: z.string().max(64) }).strict(),
  }),
  define({
    name: "get_mastery_state",
    description: "Get current mastery evidence for a subject and optional standard.",
    parameters: z
      .object({
        subject: SubjectEnum,
        standard_or_unit: z.string().max(500).nullable(),
      })
      .strict(),
  }),
  define({
    name: "search_curriculum",
    description:
      "Search the student-safe vector store for curriculum topics, source readings, rubrics, syllabus, and teacher guidance. Never use results to reveal protected assessment answers.",
    parameters: z
      .object({
        query: z.string().max(2000),
        subject: SubjectEnum.nullable(),
        unit: z.string().max(500).nullable(),
      })
      .strict(),
  }),
  define({
    name: "record_verbal_check",
    description: "Record the result of a meaningful verbal understanding check.",
    parameters: z
      .object({
        lesson_id: z.string().max(128),
        skill: z.string().max(500),
        result: z.enum(["correct", "partial", "incorrect", "not_attempted"]),
        note: z.string().max(2000).nullable(),
      })
      .strict(),
  }),
  define({
    name: "record_misconception",
    description:
      "Record a likely academic misconception that may matter in future teaching.",
    parameters: z
      .object({
        lesson_id: z.string().max(128),
        concept: z.string().max(500),
        note: z.string().max(2000),
      })
      .strict(),
  }),
  define({
    name: "record_mastery",
    description: "Record mastery evidence as an AI observation, not an official grade.",
    parameters: z
      .object({
        lesson_id: z.string().max(128),
        standard: z.string().max(500),
        score: z.number().min(0).max(100).nullable(),
        status: z.enum([
          "not_assessed",
          "developing",
          "proficient",
          "mastered",
          "needs_reteach",
        ]),
      })
      .strict(),
  }),
  define({
    name: "save_tutor_note",
    description:
      "Save a concise teaching note so a later lesson can continue from this session.",
    parameters: z
      .object({ lesson_id: z.string().max(128), note: z.string().max(4000) })
      .strict(),
  }),
  define({
    name: "mark_lesson_completed",
    description: "Mark the lesson as completed.",
    parameters: z.object({ lesson_id: z.string().max(128) }).strict(),
  }),
  define({
    name: "get_assignment_instructions",
    description: "Get independent-work instructions by assignment id.",
    parameters: z.object({ assignment_id: z.string().max(128) }).strict(),
  }),
  define({
    name: "get_worked_examples",
    description: "Get worked teaching examples for the current lesson.",
    parameters: z.object({ lesson_id: z.string().max(128) }).strict(),
  }),
  define({
    name: "get_allowed_answer_support",
    description:
      "Get controlled hint/support for a practice or exit-ticket item without bypassing assessment rules.",
    parameters: z
      .object({ lesson_id: z.string().max(128), item_id: z.string().max(128) })
      .strict(),
  }),
];

export type VoiceToolName = (typeof voiceToolDefinitions)[number]["name"];

export interface FunctionToolSchema {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
}

function stripSchemaMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schema, ...rest } = schema;
  return rest;
}

/** Strict JSON Schema function tools for the Live session's Responses backend. */
export function toFunctionTools(
  definitions: readonly VoiceToolDefinition[] = voiceToolDefinitions,
): FunctionToolSchema[] {
  return definitions.map((definition) => ({
    type: "function",
    name: definition.name,
    description: definition.description,
    parameters: stripSchemaMeta(
      z.toJSONSchema(definition.parameters, { target: "draft-2020-12" }) as Record<
        string,
        unknown
      >,
    ),
    strict: true,
  }));
}
