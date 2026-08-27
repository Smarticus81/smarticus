import { z } from "zod";
import { SubjectEnum } from "./lesson.js";

export const MasteryStatusEnum = z.enum([
  "not_assessed",
  "developing",
  "proficient",
  "mastered",
  "needs_reteach",
]);

export const VerbalCheckSchema = z.object({
  lesson_id: z.string(),
  skill: z.string(),
  result: z.enum(["correct", "partial", "incorrect", "not_attempted"]),
  note: z.string().optional(),
});

export const MisconceptionSchema = z.object({
  lesson_id: z.string(),
  concept: z.string(),
  note: z.string(),
});

export const MasteryRecordSchema = z.object({
  lesson_id: z.string(),
  standard: z.string(),
  score: z.number().min(0).max(100).nullable(),
  status: MasteryStatusEnum,
});

export const TutorNoteSchema = z.object({
  lesson_id: z.string(),
  note: z.string(),
});

export const SearchCurriculumSchema = z.object({
  query: z.string().min(1),
  subject: SubjectEnum.optional(),
  unit: z.string().optional(),
});

export const ClientSecretRequestSchema = z.object({
  lesson_id: z.string(),
});

export const EndSessionSchema = z.object({
  session_id: z.string(),
  summary: z.string().optional(),
  transcript: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    text: z.string(),
    timestamp: z.string().optional(),
  })).optional(),
});
