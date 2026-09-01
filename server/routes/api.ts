import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import {
  getTodaySchedule,
  getCurrentLesson,
  getStudentSnapshot,
  getPreviousLessonFeedback,
  getMasteryState,
  getLessonQuestionCatalog,
  selectCurrentLesson,
} from "../services/academic.js";
import {
  recordVerbalCheck,
  recordMisconception,
  recordMastery,
  saveTutorNote,
  markLessonStarted,
  markLessonCompleted,
  getAllowedAnswerSupport,
  getWorkedExamples,
  getAssignmentInstructions,
} from "../services/mastery.js";
import { getDefaultStudent } from "../services/student.js";
import {
  VerbalCheckSchema,
  MisconceptionSchema,
  MasteryRecordSchema,
  TutorNoteSchema,
  SearchCurriculumSchema,
  WebSearchSchema,
  LessonActionSchema,
  TodayScheduleQuerySchema,
  SubjectParamsSchema,
  OptionalSubjectParamsSchema,
  MasteryQuerySchema,
  LessonQuestionLookupSchema,
} from "../../shared/schemas/api.js";
import { searchVectorStore, searchWeb } from "../lib/openai.js";
import { log } from "../lib/logger.js";
import type { Subject } from "@prisma/client";

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function studentSearchFilter(subject?: string) {
  if (!subject) return { type: "eq", key: "access", value: "student" };
  return {
    type: "and",
    filters: [
      { type: "eq", key: "access", value: "student" },
      {
        type: "or",
        filters: [
          { type: "eq", key: "subject", value: subject },
          { type: "eq", key: "subject", value: "multi" },
          { type: "eq", key: "subject", value: "all" },
        ],
      },
    ],
  };
}

export const apiRouter = Router();

apiRouter.get(
  "/schedule/today",
  asyncHandler(async (req, res) => {
    const { date } = TodayScheduleQuerySchema.parse(req.query);
    res.json(await getTodaySchedule(date));
  }),
);

apiRouter.get(
  "/lessons/current/:subject?",
  asyncHandler(async (req, res) => {
    const { subject } = OptionalSubjectParamsSchema.parse(req.params);
    res.json(await getCurrentLesson(subject as Subject | undefined));
  }),
);

apiRouter.post(
  "/lessons/select",
  asyncHandler(async (req, res) => {
    const { lesson_id } = LessonActionSchema.parse(req.body);
    const lesson = await selectCurrentLesson(lesson_id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    res.json(lesson);
  }),
);

apiRouter.post(
  "/lessons/questions",
  asyncHandler(async (req, res) => {
    const lookup = LessonQuestionLookupSchema.parse(req.body);
    const result = await getLessonQuestionCatalog(lookup);
    if (!result) return res.status(404).json({ error: "Lesson not found" });
    log({
      message: "Lesson question lookup",
      requestId: req.ctx.requestId,
      lessonId: lookup.lesson_id,
      resultCount: result.count,
    });
    res.json(result);
  }),
);

apiRouter.get(
  "/student/snapshot",
  asyncHandler(async (req, res) => {
    const student = await getDefaultStudent();
    req.session.studentId = student.id;
    res.json(await getStudentSnapshot());
  }),
);

apiRouter.get(
  "/feedback/previous/:subject",
  asyncHandler(async (req, res) => {
    const { subject } = SubjectParamsSchema.parse(req.params);
    res.json(await getPreviousLessonFeedback(subject as Subject));
  }),
);

apiRouter.get(
  "/mastery/:subject",
  asyncHandler(async (req, res) => {
    const { subject } = SubjectParamsSchema.parse(req.params);
    const { standard } = MasteryQuerySchema.parse(req.query);
    res.json(await getMasteryState(subject as Subject, standard));
  }),
);

apiRouter.post(
  "/tools/verbal-check",
  asyncHandler(async (req, res) => {
    const body = VerbalCheckSchema.parse(req.body);
    log({ message: "Tool call", toolName: "record_verbal_check", requestId: req.ctx.requestId, lessonId: body.lesson_id });
    res.json(await recordVerbalCheck(body));
  }),
);

apiRouter.post(
  "/tools/misconception",
  asyncHandler(async (req, res) => {
    const body = MisconceptionSchema.parse(req.body);
    log({ message: "Tool call", toolName: "record_misconception", requestId: req.ctx.requestId, lessonId: body.lesson_id });
    res.json(await recordMisconception(body));
  }),
);

apiRouter.post(
  "/tools/mastery",
  asyncHandler(async (req, res) => {
    const body = MasteryRecordSchema.parse(req.body);
    log({ message: "Tool call", toolName: "record_mastery", requestId: req.ctx.requestId, lessonId: body.lesson_id });
    res.json(await recordMastery(body));
  }),
);

apiRouter.post(
  "/tools/tutor-note",
  asyncHandler(async (req, res) => {
    const body = TutorNoteSchema.parse(req.body);
    log({ message: "Tool call", toolName: "save_tutor_note", requestId: req.ctx.requestId, lessonId: body.lesson_id });
    res.json(await saveTutorNote(body));
  }),
);

apiRouter.post(
  "/tools/lesson-started",
  asyncHandler(async (req, res) => {
    const { lesson_id } = LessonActionSchema.parse(req.body);
    log({ message: "Tool call", toolName: "mark_lesson_started", requestId: req.ctx.requestId, lessonId: lesson_id });
    const result = await markLessonStarted(lesson_id);
    req.session.tutorSessionId = result.sessionId;
    res.json(result);
  }),
);

apiRouter.post(
  "/tools/lesson-completed",
  asyncHandler(async (req, res) => {
    const { lesson_id } = LessonActionSchema.parse(req.body);
    log({ message: "Tool call", toolName: "mark_lesson_completed", requestId: req.ctx.requestId, lessonId: lesson_id });
    res.json(await markLessonCompleted(lesson_id));
  }),
);

apiRouter.get(
  "/tools/worked-examples/:lessonId",
  asyncHandler(async (req, res) => {
    res.json(await getWorkedExamples(param(req.params.lessonId)));
  }),
);

apiRouter.get(
  "/tools/assignment/:assignmentId",
  asyncHandler(async (req, res) => {
    const assignment = await getAssignmentInstructions(param(req.params.assignmentId));
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  }),
);

apiRouter.get(
  "/tools/answer-support/:lessonId/:itemId",
  asyncHandler(async (req, res) => {
    res.json(await getAllowedAnswerSupport(param(req.params.lessonId), param(req.params.itemId)));
  }),
);

apiRouter.post(
  "/search/curriculum",
  asyncHandler(async (req, res) => {
    const body = SearchCurriculumSchema.parse(req.body);
    log({ message: "Tool call", toolName: "search_curriculum", requestId: req.ctx.requestId });
    const query = body.unit ? `${body.query}\nUnit context: ${body.unit}` : body.query;
    const results = await searchVectorStore({
      query,
      filters: studentSearchFilter(body.subject),
    });
    res.json(results);
  }),
);

apiRouter.post(
  "/search/web",
  asyncHandler(async (req, res) => {
    const { query } = WebSearchSchema.parse(req.body);
    log({ message: "Tool call", toolName: "search_web", requestId: req.ctx.requestId });
    res.json(await searchWeb(query));
  }),
);
