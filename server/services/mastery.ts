import { prisma } from "../lib/prisma.js";
import { getDefaultStudent, getParentSettings } from "./student.js";
import type { MasteryStatus, RecordType } from "@prisma/client";

export function calculateMasteryStatus(
  score: number | null,
  thresholds: { high: number; low: number },
): MasteryStatus {
  if (score === null) return "not_assessed";
  if (score >= thresholds.high) return "mastered";
  if (score >= thresholds.low) return "proficient";
  return "needs_reteach";
}

export async function recordVerbalCheck(params: {
  lesson_id: string;
  skill: string;
  result: string;
  note?: string;
}) {
  const student = await getDefaultStudent();
  const session = await prisma.tutorSession.findFirst({
    where: { studentId: student.id, lessonId: params.lesson_id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (session) {
    await prisma.tutorSessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: "verbal_check",
        payload: params,
      },
    });
  }

  return { recorded: true, recordType: "AI_OBSERVATION" as RecordType, ...params };
}

export async function recordMisconception(params: {
  lesson_id: string;
  concept: string;
  note: string;
}) {
  const student = await getDefaultStudent();
  const record = await prisma.misconception.create({
    data: {
      studentId: student.id,
      lessonId: params.lesson_id,
      concept: params.concept,
      note: params.note,
    },
  });
  return record;
}

export async function recordMastery(params: {
  lesson_id: string;
  standard: string;
  score: number | null;
  status?: MasteryStatus;
}) {
  const student = await getDefaultStudent();
  const settings = await getParentSettings();
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: params.lesson_id } });

  const status =
    params.status ??
    calculateMasteryStatus(params.score, {
      high: settings.masteryThresholdHigh,
      low: settings.masteryThresholdLow,
    });

  const record = await prisma.masteryRecord.create({
    data: {
      studentId: student.id,
      lessonId: params.lesson_id,
      subject: lesson.subject,
      standard: params.standard,
      score: params.score,
      status,
      recordType: "AI_OBSERVATION",
      evidence: `Verbal/session evidence recorded at ${new Date().toISOString()}`,
    },
  });

  return { ...record, note: "AI observation only. Official grade requires parent approval or defined scoring rules." };
}

export async function saveTutorNote(params: { lesson_id: string; note: string }) {
  const student = await getDefaultStudent();
  const session = await prisma.tutorSession.findFirst({
    where: { studentId: student.id, lessonId: params.lesson_id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (session) {
    await prisma.tutorSessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: "tutor_note",
        payload: { note: params.note },
      },
    });
    const existing = session.summary ?? "";
    await prisma.tutorSession.update({
      where: { id: session.id },
      data: { summary: existing ? `${existing}\n${params.note}` : params.note },
    });
  }

  return { saved: true, lessonId: params.lesson_id };
}

export async function markLessonStarted(lessonId: string) {
  const student = await getDefaultStudent();
  const lesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: "started" },
  });

  const settings = await getParentSettings();
  await prisma.parentSetting.update({
    where: { id: settings.id },
    data: { currentLessonId: lessonId },
  });

  const session = await prisma.tutorSession.create({
    data: {
      studentId: student.id,
      lessonId,
      retainTranscript: settings.retainTranscripts,
    },
  });

  return { lesson, sessionId: session.id };
}

export async function markLessonCompleted(lessonId: string) {
  const lesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: "completed" },
  });
  return lesson;
}

export async function getAllowedAnswerSupport(lessonId: string, itemId: string) {
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  const exitTicket = lesson.exitTicket as Array<{ id: string; prompt: string; answer: string; rubric?: string }>;
  const guided = lesson.guidedPractice as Array<{ id: string; prompt: string; hint?: string }>;
  const independent = lesson.independentPractice as Array<{ id: string; prompt: string; hint?: string }>;

  const exitItem = exitTicket.find((i) => i.id === itemId);
  if (exitItem) {
    const attempt = await prisma.assessmentItem.findFirst({
      where: { externalId: itemId, attemptRecorded: true },
    });
    if (!attempt) {
      return {
        itemId,
        supportType: "hint_only",
        hint: "Focus on the key steps you learned in the worked examples. Explain your thinking before asking for the final answer.",
        answerWithheld: true,
        reason: "Exit ticket answers are protected until a genuine attempt is recorded.",
      };
    }
    return {
      itemId,
      supportType: "full_after_attempt",
      hint: exitItem.rubric ?? "Compare your answer to the method we practiced.",
      answer: exitItem.answer,
      answerWithheld: false,
    };
  }

  const practiceItem = [...guided, ...independent].find((i) => i.id === itemId);
  if (practiceItem?.hint) {
    return { itemId, supportType: "hint", hint: practiceItem.hint, answerWithheld: true };
  }

  return { itemId, supportType: "general", hint: "Review the worked examples and try one step at a time.", answerWithheld: true };
}

export async function getWorkedExamples(lessonId: string) {
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  return lesson.workedExamples;
}

export async function getAssignmentInstructions(assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { OR: [{ id: assignmentId }, { externalId: assignmentId }] },
    include: { lesson: true },
  });
  if (!assignment) return null;
  return {
    id: assignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    dueDate: assignment.dueDate,
    completed: assignment.completed,
    lessonTitle: assignment.lesson.lessonTitle,
  };
}
