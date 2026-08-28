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

export const ClientSecretRequestSchema = z.object({
  lesson_id: IdSchema,
}).strict();

export const LessonActionSchema = ClientSecretRequestSchema;

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date");

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
