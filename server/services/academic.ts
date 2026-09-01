import { prisma } from "../lib/prisma.js";
import {
  getDefaultStudent,
  getParentSettings,
  parseDate,
  formatDate,
} from "./student.js";
import type { Subject } from "@prisma/client";

export async function getTodaySchedule(dateStr?: string) {
  const student = await getDefaultStudent();
  const date = dateStr ? parseDate(dateStr) : parseDate(formatDate(new Date()));

  const lessons = await prisma.lesson.findMany({
    where: { date },
    orderBy: [{ lessonNumber: "asc" }],
    include: { unit: { include: { course: true } } },
  });

  const dayNumber = lessons[0]?.dayNumber ?? 1;
  const todaysGoal = lessons[0]?.todaysGoal ?? "Complete today's scheduled lessons with understanding.";

  return {
    date: formatDate(date),
    school_year: lessons[0]?.schoolYear ?? "2026-27",
    grade_level: student.gradeLevel,
    day_number: dayNumber,
    todays_goal: todaysGoal,
    lessons: lessons.map(serializeLesson),
    student: {
      id: student.id,
      preferredName: student.preferredName,
      gradeLevel: student.gradeLevel,
    },
  };
}

export async function getLessonById(lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: lessonId }, { externalId: lessonId }] },
    include: { unit: { include: { course: true } } },
  });
  if (!lesson) return null;
  return serializeLesson(lesson);
}

export async function selectCurrentLesson(lessonId: string) {
  const lesson = await getLessonById(lessonId);
  if (!lesson) return null;

  const settings = await getParentSettings();
  await prisma.parentSetting.update({
    where: { id: settings.id },
    data: { currentLessonId: lesson.id },
  });
  return lesson;
}

export async function getCurrentLesson(subject?: Subject) {
  const today = parseDate(formatDate(new Date()));
  const todayString = formatDate(today);
  const subjectFilter = subject ? { subject } : {};
  const include = { unit: { include: { course: true } } } as const;

  const settings = await prisma.parentSetting.findFirst();
  if (settings?.currentLessonId) {
    const lesson = await getLessonById(settings.currentLessonId);
    if (
      lesson &&
      lesson.date === todayString &&
      (!subject || lesson.subject === subject)
    ) {
      return lesson;
    }
  }

  const activeLesson = await prisma.lesson.findFirst({
    where: {
      ...subjectFilter,
      date: today,
      status: { in: ["started", "in_progress"] },
    },
    orderBy: [{ updatedAt: "desc" }],
    include,
  });
  if (activeLesson) return serializeLesson(activeLesson);

  const firstLessonToday = await prisma.lesson.findFirst({
    where: {
      ...subjectFilter,
      date: today,
    },
    orderBy: [{ lessonNumber: "asc" }],
    include,
  });
  if (firstLessonToday) return serializeLesson(firstLessonToday);

  const latestLesson = await prisma.lesson.findFirst({
    where: {
      ...subjectFilter,
      date: { lte: today },
    },
    orderBy: [{ date: "desc" }, { lessonNumber: "asc" }],
    include,
  });
  if (latestLesson) return serializeLesson(latestLesson);

  const upcomingLesson = await prisma.lesson.findFirst({
    where: {
      ...subjectFilter,
      date: { gt: today },
    },
    orderBy: [{ date: "asc" }, { lessonNumber: "asc" }],
    include,
  });
  return upcomingLesson ? serializeLesson(upcomingLesson) : null;
}

export async function getStudentSnapshot() {
  const student = await getDefaultStudent();
  const settings = await prisma.parentSetting.findFirst();

  const [mastery, misconceptions, recentSessions, attendance] = await Promise.all([
    prisma.masteryRecord.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.misconception.findMany({
      where: { studentId: student.id, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.tutorSession.findMany({
      where: { studentId: student.id },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { lesson: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { studentId: student.id },
      orderBy: { date: "desc" },
      take: 14,
    }),
  ]);

  return {
    student: {
      id: student.id,
      preferredName: student.preferredName,
      gradeLevel: student.gradeLevel,
    },
    settings: settings ?? { retainTranscripts: true, masteryThresholdHigh: 90, masteryThresholdLow: 75 },
    mastery,
    unresolvedMisconceptions: misconceptions,
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      lessonTitle: s.lesson.lessonTitle,
      subject: s.lesson.subject,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      summary: s.summary,
    })),
    attendance,
  };
}

export async function getPreviousLessonFeedback(subject: Subject) {
  const student = await getDefaultStudent();
  const feedback = await prisma.teacherFeedback.findMany({
    where: { studentId: student.id, subject },
    orderBy: { date: "desc" },
    take: 3,
  });

  const tutorNotes = await prisma.tutorSession.findMany({
    where: {
      studentId: student.id,
      lesson: { subject },
      summary: { not: null },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
    include: { lesson: true },
  });

  return {
    teacherFeedback: feedback,
    tutorSummaries: tutorNotes.map((s) => ({
      date: s.startedAt,
      lessonTitle: s.lesson.lessonTitle,
      summary: s.summary,
    })),
  };
}

export async function getMasteryState(subject: Subject, standardOrUnit?: string) {
  const student = await getDefaultStudent();
  const where: { studentId: string; subject: Subject; standard?: string } = {
    studentId: student.id,
    subject,
  };
  if (standardOrUnit) where.standard = standardOrUnit;

  const records = await prisma.masteryRecord.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return { subject, standardOrUnit, records };
}

function stripAnswers(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const { answer: _answer, ...rest } = entry as Record<string, unknown>;
    return rest;
  });
}

function serializeLesson(lesson: {
  id: string;
  externalId: string;
  date: Date;
  schoolYear: string;
  gradeLevel: number;
  subject: string;
  course: string;
  unitId: string;
  unitTitle: string;
  lessonNumber: number;
  lessonTitle: string;
  standards: unknown;
  previousLearning: string;
  courseContext: string;
  learningObjectives: unknown;
  whyItMatters: string;
  vocabulary: unknown;
  writtenInstruction: string;
  workedExamples: unknown;
  guidedPractice: unknown;
  independentPractice: unknown;
  exitTicket: unknown;
  masteryThreshold: number;
  materials: unknown;
  estimatedMinutes: number;
  voicePrompt: string;
  teacherNotes: string;
  answerKey: unknown;
  sourceReferences: unknown;
  status: string;
  dayNumber: number | null;
  todaysGoal: string | null;
  unit?: { externalId?: string; course?: { title: string } };
}) {
  return {
    id: lesson.id,
    external_id: lesson.externalId,
    date: formatDate(lesson.date),
    school_year: lesson.schoolYear,
    grade_level: lesson.gradeLevel,
    subject: lesson.subject,
    course: lesson.course,
    unit_id: lesson.unit?.externalId ?? lesson.unitId,
    unit_title: lesson.unitTitle,
    lesson_number: lesson.lessonNumber,
    lesson_title: lesson.lessonTitle,
    standards: lesson.standards,
    previous_learning: lesson.previousLearning,
    course_context: lesson.courseContext,
    learning_objectives: lesson.learningObjectives,
    why_it_matters: lesson.whyItMatters,
    vocabulary: lesson.vocabulary,
    written_instruction: lesson.writtenInstruction,
    worked_examples: lesson.workedExamples,
    guided_practice: stripAnswers(lesson.guidedPractice),
    independent_practice: stripAnswers(lesson.independentPractice),
    exit_ticket: stripAnswers(lesson.exitTicket),
    mastery_threshold: lesson.masteryThreshold,
    materials: lesson.materials,
    estimated_minutes: lesson.estimatedMinutes,
    voice_prompt: lesson.voicePrompt,
    teacher_notes: "",
    answer_key: {},
    source_references: lesson.sourceReferences,
    status: lesson.status,
    day_number: lesson.dayNumber,
    todays_goal: lesson.todaysGoal,
  };
}

export { serializeLesson };
