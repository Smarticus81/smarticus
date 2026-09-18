import { z } from "zod";
import { SubjectEnum } from "./lesson.js";

const IdSchema = z.string().trim().min(1).max(128);
const ShortTextSchema = z.string().trim().min(1).max(500);

export const MasteryStatusEnum = z.enum([
  "not_assessed",
  "developing",
  "proficient",
  "mastered",
  "needs_reteach",
]);

export const VerbalCheckSchema = z.object({
  lesson_id: IdSchema,
  skill: ShortTextSchema,
  result: z.enum(["correct", "partial", "incorrect", "not_attempted"]),
  note: z.string().trim().max(2_000).optional(),
}).strict();

export const MisconceptionSchema = z.object({
  lesson_id: IdSchema,
  concept: ShortTextSchema,
  note: z.string().trim().min(1).max(2_000),
}).strict();

export const MasteryRecordSchema = z.object({
  lesson_id: IdSchema,
  standard: ShortTextSchema,
  score: z.number().min(0).max(100).nullable(),
  status: MasteryStatusEnum,
}).strict();

export const TutorNoteSchema = z.object({
  lesson_id: IdSchema,
  note: z.string().trim().min(1).max(4_000),
}).strict();

export const SearchCurriculumSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  subject: SubjectEnum.optional(),
  unit: z.string().trim().max(500).optional(),
}).strict();

export const WebSearchSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
}).strict();

export const ReadPageSchema = z
  .object({
    url: z.string().max(600).nullable(),
    query: z.string().max(300).nullable(),
  })
  .refine((value) => Boolean(value.url?.trim() || value.query?.trim()), {
    message: "Provide a url or a query",
  });

export const LessonActionSchema = z.object({
  lesson_id: IdSchema,
}).strict();

export const LiveSessionRequestSchema = z.object({
  lesson_id: IdSchema,
  /** The browser's WebRTC SDP offer. */
  sdp: z.string().min(20).max(64_000).regex(/^v=0/, "Expected an SDP offer"),
}).strict();

export const QuestionSectionEnum = z.enum([
  "guided_practice",
  "independent_practice",
  "exit_ticket",
]);

export const LessonQuestionLookupSchema = z.object({
  lesson_id: IdSchema,
  subject: SubjectEnum.nullable(),
  section: QuestionSectionEnum.nullable(),
  question_number: z.number().int().positive().nullable(),
  item_id: IdSchema.nullable(),
  query: z.string().trim().min(1).max(500).nullable(),
}).strict();

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date");

/**
 * Handing work in.
 *
 * Two routes to the same place: typed on the platform, or done on paper and
 * photographed. A submission always records which, because a page of working
 * that only exists as a photograph is graded differently from a typed answer.
 */
export const SubmissionModeEnum = z.enum(["platform", "paper"]);

const DataUrlSchema = z
  .string()
  .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, "Expected an image data URL")
  // A downscaled JPEG of a page of handwriting lands well under this.
  .max(4_000_000);

export const SubmitLessonWorkSchema = z
  .object({
    lesson_id: IdSchema,
    mode: SubmissionModeEnum,
    answers: z
      .array(
        z.object({
          item_id: IdSchema,
          section: QuestionSectionEnum,
          prompt: z.string().trim().max(2_000),
          answer: z.string().max(20_000),
        }).strict(),
      )
      .max(100),
    /** Photographs of work done away from the keyboard. */
    photos: z.array(DataUrlSchema).max(6).default([]),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine(
    (value) => value.answers.some((entry) => entry.answer.trim()) || value.photos.length > 0,
    { message: "Nothing to hand in yet" },
  );

export const TodayScheduleQuerySchema = z.object({
  date: DateStringSchema.optional(),
}).strict();

export const SubjectParamsSchema = z.object({ subject: SubjectEnum });

export const OptionalSubjectParamsSchema = z.object({ subject: SubjectEnum.optional() });

export const MasteryQuerySchema = z.object({
  standard: z.string().trim().min(1).max(500).optional(),
}).strict();

export const EndSessionSchema = z.object({
  session_id: IdSchema,
  summary: z.string().trim().max(4_000).optional(),
  transcript: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    text: z.string().max(10_000),
    timestamp: z.string().datetime().optional(),
  }).strict()).max(500).optional(),
}).strict();
