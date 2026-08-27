import { z } from "zod";

export const SubjectEnum = z.enum([
  "mathematics",
  "literature",
  "writing",
  "science",
  "history_geography",
  "french",
  "computer_science",
  "pe",
  "art_design",
]);

export type Subject = z.infer<typeof SubjectEnum>;

export const LessonStatusEnum = z.enum([
  "scheduled",
  "started",
  "in_progress",
  "completed",
  "not_assessed",
]);

export const WorkedExampleSchema = z.object({
  title: z.string(),
  problem: z.string(),
  solution: z.string(),
  explanation: z.string(),
});

export const PracticeItemSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  hint: z.string().optional(),
  answer: z.string().optional(),
});

export const ExitTicketItemSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  answer: z.string(),
  rubric: z.string().optional(),
});

export const LessonSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  school_year: z.string(),
  grade_level: z.number().int().min(1).max(12),
  subject: SubjectEnum,
  course: z.string(),
  unit_id: z.string(),
  unit_title: z.string(),
  lesson_number: z.number().int().positive(),
  lesson_title: z.string(),
  standards: z.array(z.string()),
  previous_learning: z.string(),
  course_context: z.string(),
  learning_objectives: z.array(z.string()),
  why_it_matters: z.string(),
  vocabulary: z.array(z.object({ term: z.string(), definition: z.string() })),
  written_instruction: z.string(),
  worked_examples: z.array(WorkedExampleSchema),
  guided_practice: z.array(PracticeItemSchema),
  independent_practice: z.array(PracticeItemSchema),
  exit_ticket: z.array(ExitTicketItemSchema),
  mastery_threshold: z.number().min(0).max(100).default(75),
  materials: z.array(z.string()),
  estimated_minutes: z.number().int().positive(),
  voice_prompt: z.string(),
  teacher_notes: z.string().optional().default(""),
  answer_key: z.record(z.string()).optional().default({}),
  source_references: z.array(z.string()).default([]),
  status: LessonStatusEnum.default("scheduled"),
});

export type Lesson = z.infer<typeof LessonSchema>;

export const DailyScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  school_year: z.string(),
  grade_level: z.number().int(),
  day_number: z.number().int().positive(),
  school_day_label: z.string().optional(),
  todays_goal: z.string(),
  lessons: z.array(LessonSchema),
});

export type DailySchedule = z.infer<typeof DailyScheduleSchema>;

export const SUBJECT_LABELS: Record<Subject, string> = {
  mathematics: "Mathematics",
  literature: "English / Literature",
  writing: "Writing",
  science: "Science",
  history_geography: "History / Geography / Civics",
  french: "French",
  computer_science: "Computer Science / AI",
  pe: "PE",
  art_design: "Art / Design",
};

export const SUBJECT_ORDER: Subject[] = [
  "mathematics",
  "literature",
  "writing",
  "science",
  "history_geography",
  "french",
  "computer_science",
  "pe",
  "art_design",
];
