import { prisma } from "../lib/prisma.js";
import { getDefaultStudent, parseDate } from "./student.js";

/**
 * Handing the day's work in.
 *
 * Until now a learner's written answers never left the browser: they sat in
 * localStorage and nothing could read them but the same device. Work he had
 * finished was, as far as the record was concerned, not done. This is the path
 * that makes it real, for typed answers and for a page of paper held up to the
 * camera alike.
 *
 * It reuses the assignment the curriculum ingest already creates for each
 * lesson, so no schema change is needed: the answers ride in `Submission.content`
 * as JSON and photographs become portfolio artifacts beside them.
 */

export interface SubmittedAnswer {
  item_id: string;
  section: "guided_practice" | "independent_practice" | "exit_ticket";
  prompt: string;
  answer: string;
}

export interface SubmitLessonWorkInput {
  lessonId: string;
  mode: "platform" | "paper";
  answers: SubmittedAnswer[];
  photos: string[];
  note?: string;
}

/** What the browser and the tutor are told about a submission. */
export interface SubmissionView {
  id: string;
  lesson_id: string;
  mode: "platform" | "paper";
  submitted_at: string;
  answered: number;
  total: number;
  photos: number;
  note: string | null;
}

interface StoredSubmission {
  mode: "platform" | "paper";
  answers: SubmittedAnswer[];
  photo_ids: string[];
  note?: string;
}

function parseStored(content: string | null): StoredSubmission | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Partial<StoredSubmission>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      mode: parsed.mode === "paper" ? "paper" : "platform",
      answers: Array.isArray(parsed.answers) ? (parsed.answers as SubmittedAnswer[]) : [],
      photo_ids: Array.isArray(parsed.photo_ids) ? (parsed.photo_ids as string[]) : [],
      ...(typeof parsed.note === "string" ? { note: parsed.note } : {}),
    };
  } catch {
    return null;
  }
}

function toView(
  row: { id: string; content: string | null; submittedAt: Date | null; createdAt: Date },
  lessonId: string,
): SubmissionView {
  const stored = parseStored(row.content);
  const answers = stored?.answers ?? [];
  return {
    id: row.id,
    lesson_id: lessonId,
    mode: stored?.mode ?? "platform",
    submitted_at: (row.submittedAt ?? row.createdAt).toISOString(),
    answered: answers.filter((entry) => entry.answer.trim()).length,
    total: answers.length,
    photos: stored?.photo_ids.length ?? 0,
    note: stored?.note ?? null,
  };
}

/**
 * The assignment a lesson's work belongs to.
 *
 * Ingest creates one per lesson, but a lesson can reach here without having
 * been through that path, so this makes the missing one rather than refusing
 * to accept work that is genuinely finished.
 */
async function assignmentFor(lesson: {
  id: string;
  externalId: string;
  lessonTitle: string;
  date: Date;
}, studentId: string) {
  const externalId = `${lesson.externalId}-independent`;
  return prisma.assignment.upsert({
    where: { externalId },
    create: {
      externalId,
      lessonId: lesson.id,
      studentId,
      title: `${lesson.lessonTitle} - Independent Practice`,
      instructions: "",
      dueDate: lesson.date,
      completed: false,
    },
    update: {},
  });
}

export async function submitLessonWork(
  input: SubmitLessonWorkInput,
): Promise<SubmissionView | null> {
  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: input.lessonId }, { externalId: input.lessonId }] },
  });
  if (!lesson) return null;
  const student = await getDefaultStudent();
  const assignment = await assignmentFor(lesson, student.id);

  // Photographs are portfolio artifacts in their own right: they are the work,
  // not an attachment to it, and they outlive the submission record.
  const artifacts = await Promise.all(
    input.photos.map((dataUrl, index) =>
      prisma.portfolioArtifact.create({
        data: {
          studentId: student.id,
          title: `${lesson.lessonTitle} — page ${index + 1}`,
          description: `Photographed work handed in for ${lesson.subject} on ${lesson.date.toISOString().slice(0, 10)}.`,
          content: dataUrl,
          date: lesson.date,
        },
        select: { id: true },
      }),
    ),
  );

  const stored: StoredSubmission = {
    mode: input.mode,
    answers: input.answers,
    photo_ids: artifacts.map((artifact) => artifact.id),
    ...(input.note ? { note: input.note } : {}),
  };

  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      content: JSON.stringify(stored),
      submittedAt: new Date(),
    },
    select: { id: true, content: true, submittedAt: true, createdAt: true },
  });

  // Handing work in is not the same as finishing the lesson, so the assignment
  // is marked done while the lesson's own status is left to Atticus.
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { completed: true },
  });

  return toView(submission, lesson.id);
}

/** Everything handed in for a lesson, newest first. */
export async function getLessonSubmissions(lessonId: string): Promise<SubmissionView[] | null> {
  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ id: lessonId }, { externalId: lessonId }] },
    select: { id: true },
  });
  if (!lesson) return null;
  const rows = await prisma.submission.findMany({
    where: { assignment: { lessonId: lesson.id } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, content: true, submittedAt: true, createdAt: true },
  });
  return rows.map((row) => toView(row, lesson.id));
}

/** Parse a date the schedule uses, for callers that hold a day rather than a lesson. */
export function submissionDate(date: string): Date {
  return parseDate(date);
}
