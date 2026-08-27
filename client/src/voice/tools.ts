import { tool } from "@openai/agents";
import { z } from "zod";
import { api } from "../lib/api";

export function createTutorTools(lessonId: string) {
  return [
    tool({
      name: "get_today_schedule",
      description: "Get today's schedule including all lessons and goals.",
      parameters: z.object({}),
      execute: async () => api.todaySchedule(),
    }),
    tool({
      name: "get_current_lesson",
      description: "Get the current student-safe lesson context, optionally filtered by subject.",
      parameters: z.object({ subject: z.string().optional() }),
      execute: async ({ subject }) => fetch(`/api/lessons/current/${subject ?? ""}`, { credentials: "include" }).then((r) => r.json()),
    }),
    tool({
      name: "get_student_snapshot",
      description: "Get current mastery evidence, misconceptions, and recent voice-session summaries.",
      parameters: z.object({}),
      execute: async () => fetch("/api/student/snapshot", { credentials: "include" }).then((r) => r.json()),
    }),
    tool({
      name: "get_previous_lesson_feedback",
      description: "Get previous teacher feedback and tutor summaries for a subject.",
      parameters: z.object({ subject: z.string() }),
      execute: async ({ subject }) => fetch(`/api/feedback/previous/${subject}`, { credentials: "include" }).then((r) => r.json()),
    }),
    tool({
      name: "get_mastery_state",
      description: "Get current mastery evidence for a subject and optional standard.",
      parameters: z.object({ subject: z.string(), standard_or_unit: z.string().optional() }),
      execute: async ({ subject, standard_or_unit }) =>
        fetch(`/api/mastery/${subject}${standard_or_unit ? `?standard=${encodeURIComponent(standard_or_unit)}` : ""}`, {
          credentials: "include",
        }).then((r) => r.json()),
    }),
    tool({
      name: "search_curriculum",
      description: "Search the student-safe curriculum, source readings, rubrics, syllabus, and teacher guidance.",
      parameters: z.object({ query: z.string(), subject: z.string().optional(), unit: z.string().optional() }),
      execute: async (body) => api.tool.searchCurriculum(body),
    }),
    tool({
      name: "record_verbal_check",
      description: "Record the result of a meaningful verbal understanding check.",
      parameters: z.object({
        lesson_id: z.string(),
        skill: z.string(),
        result: z.enum(["correct", "partial", "incorrect", "not_attempted"]),
        note: z.string().optional(),
      }),
      execute: async (body) => api.tool.verbalCheck({ ...body, lesson_id: body.lesson_id || lessonId }),
    }),
    tool({
      name: "record_misconception",
      description: "Record a likely academic misconception that may matter in future teaching.",
      parameters: z.object({ lesson_id: z.string(), concept: z.string(), note: z.string() }),
      execute: async (body) => api.tool.misconception({ ...body, lesson_id: body.lesson_id || lessonId }),
    }),
    tool({
      name: "record_mastery",
      description: "Record mastery evidence as an AI observation, not an official grade.",
      parameters: z.object({
        lesson_id: z.string(),
        standard: z.string(),
        score: z.number().nullable(),
        status: z.enum(["not_assessed", "developing", "proficient", "mastered", "needs_reteach"]),
      }),
      execute: async (body) => api.tool.mastery({ ...body, lesson_id: body.lesson_id || lessonId }),
    }),
    tool({
      name: "save_tutor_note",
      description: "Save a concise teaching note so a later lesson can continue from this session.",
      parameters: z.object({ lesson_id: z.string(), note: z.string() }),
      execute: async (body) => api.tool.tutorNote({ ...body, lesson_id: body.lesson_id || lessonId }),
    }),
    tool({
      name: "mark_lesson_started",
      description: "Mark the lesson as started and open a tutor session.",
      parameters: z.object({ lesson_id: z.string() }),
      execute: async (body) => api.tool.lessonStarted(body.lesson_id || lessonId),
    }),
    tool({
      name: "mark_lesson_completed",
      description: "Mark the lesson as completed.",
      parameters: z.object({ lesson_id: z.string() }),
      execute: async (body) => api.tool.lessonCompleted(body.lesson_id || lessonId),
    }),
    tool({
      name: "get_assignment_instructions",
      description: "Get independent-work instructions by assignment id.",
      parameters: z.object({ assignment_id: z.string() }),
      execute: async ({ assignment_id }) => api.tool.assignment(assignment_id),
    }),
    tool({
      name: "get_worked_examples",
      description: "Get worked teaching examples for the current lesson.",
      parameters: z.object({ lesson_id: z.string() }),
      execute: async (body) => api.tool.workedExamples(body.lesson_id || lessonId),
    }),
    tool({
      name: "get_allowed_answer_support",
      description: "Get controlled hint/support for a practice or exit-ticket item without bypassing assessment rules.",
      parameters: z.object({ lesson_id: z.string(), item_id: z.string() }),
      execute: async (body) => api.tool.answerSupport(body.lesson_id || lessonId, body.item_id),
    }),
  ];
}
