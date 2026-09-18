import { prisma } from "../lib/prisma.js";
import { serializeLesson } from "./academic.js";
import { getDefaultStudent, parseDate } from "./student.js";

/**
 * What the speaking half of the tutor knows before anyone says a word.
 *
 * The reasoning backend has always had the day's lessons, the records and the
 * question catalog. The voice model had a lesson title and a subject, which is
 * why a half-heard sentence could only ever be answered from the one lesson it
 * knew about: asked to interpret "move on" or "what about the other one", it had
 * nothing else to reach for. This gives it the same day the backend has, in
 * prose short enough to sit in a spoken-conversation prompt.
 */
export interface VoiceContextBrief {
  /** Prose for the frontend instructions. */
  brief: string;
  /** Text-only history seeded into the session before it starts. */
  initialItems: InitialHistoryItem[];
  /** Subjects scheduled for the day, in order. */
  subjects: string[];
}

export interface InitialHistoryItem {
  type: "message";
  role: "developer";
  content: Array<{ type: "input_text"; text: string }>;
}

/** The student-safe day, already read from the database. */
export interface VoiceContextInput {
  studentName: string;
  gradeLevel: number;
  date: string;
  selectedLessonId: string;
  lessons: Array<{
    id: string;
    external_id?: string | null;
    subject: string;
    lesson_title: string;
    unit_title?: string | null;
    todays_goal?: string | null;
    learning_objectives?: unknown;
  }>;
  feedback: Array<{ subject: string | null; content: string }>;
  misconceptions: Array<{ subject: string | null; concept: string }>;
  sessions: Array<{ subject: string | null; lessonTitle: string | null; summary: string | null }>;
}

/**
 * The Live session accepts at most 128 initial messages and 8,192 rendered
 * tokens. These are deliberately well inside that: a brief that crowds out the
 * instructions helps nobody.
 */
const MAX_ITEM_CHARS = 1_400;
const MAX_ITEMS = 8;
/** Below this a line is a stub rather than a fact, and reads as noise. */
const MIN_USEFUL_LINE = 12;

function developerItem(text: string): InitialHistoryItem {
  return {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text: text.slice(0, MAX_ITEM_CHARS) }],
  };
}

function oneLine(value: unknown, max = 160): string {
  if (typeof value !== "string") return "";
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function firstObjective(objectives: unknown): string {
  if (!Array.isArray(objectives)) return oneLine(objectives);
  for (const entry of objectives) {
    const text = oneLine(
      typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.text,
    );
    if (text) return text;
  }
  return "";
}

function titleCase(subject: string): string {
  return subject
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * Turn the day into the brief.
 *
 * Everything here is student-safe: titles, goals and objectives, never answers.
 * The reasoning backend remains the only holder of the question catalog, so a
 * richer brief for the voice model cannot become a leaked answer key.
 */
export function formatVoiceContext(input: VoiceContextInput): VoiceContextBrief {
  const subjects = [...new Set(input.lessons.map((lesson) => lesson.subject))];
  const selected = input.lessons.find(
    (lesson) =>
      lesson.id === input.selectedLessonId || lesson.external_id === input.selectedLessonId,
  );

  const scheduleLines = input.lessons.map((lesson) => {
    const goal = oneLine(lesson.todays_goal) || firstObjective(lesson.learning_objectives);
    const here = lesson === selected ? " [OPEN ON HIS SCREEN]" : "";
    const unit = lesson.unit_title ? ` (unit: ${lesson.unit_title})` : "";
    return `- ${titleCase(lesson.subject)}: "${lesson.lesson_title}"${unit}.${goal ? ` Goal: ${goal}` : ""}${here}`;
  });

  const useful = (line: string) => line.trim().length > MIN_USEFUL_LINE;
  const openLines = input.misconceptions
    .map((item) => `- ${titleCase(item.subject ?? "general")}: ${oneLine(item.concept, 90)}`)
    .filter(useful);
  const feedbackLines = input.feedback
    .map((item) => `- ${titleCase(item.subject ?? "general")}: ${oneLine(item.content, 150)}`)
    .filter(useful);
  const sessionLines = input.sessions
    .map(
      (item) =>
        `- ${titleCase(item.subject ?? "general")} ("${item.lessonTitle ?? "a lesson"}"): ${oneLine(item.summary, 150)}`,
    )
    .filter(useful);

  const brief = [
    `TODAY IS ${input.date}. ${input.studentName} is in Grade ${input.gradeLevel}.`,
    scheduleLines.length
      ? `EVERY SUBJECT SCHEDULED TODAY, in order. He may work on any of them and may switch whenever he likes:\n${scheduleLines.join("\n")}`
      : "Nothing is scheduled today, which is fine: help with whatever he raises.",
    selected
      ? `The lesson open on his screen is ${titleCase(selected.subject)}: "${selected.lesson_title}". That is where he is, not a fence around what he may ask.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const items: InitialHistoryItem[] = [developerItem(brief)];
  if (openLines.length) {
    items.push(
      developerItem(
        `STILL OPEN from earlier work — worth returning to, never worth reciting at him:\n${openLines.join("\n")}`,
      ),
    );
  }
  if (feedbackLines.length) {
    items.push(developerItem(`RECENT TEACHER FEEDBACK, newest first:\n${feedbackLines.join("\n")}`));
  }
  if (sessionLines.length) {
    items.push(developerItem(`WHAT THE LAST FEW SESSIONS COVERED:\n${sessionLines.join("\n")}`));
  }

  return { brief, initialItems: items.slice(0, MAX_ITEMS), subjects };
}

/** Read the day from the database, then format it. */
export async function buildVoiceContext(params: {
  date: string;
  selectedLessonId: string;
}): Promise<VoiceContextBrief> {
  const student = await getDefaultStudent();
  const [dayLessonRows, feedback, misconceptions, recentSessions] = await Promise.all([
    prisma.lesson.findMany({
      where: { date: parseDate(params.date) },
      orderBy: [{ lessonNumber: "asc" }],
      include: { unit: { include: { course: true } } },
    }),
    prisma.teacherFeedback.findMany({
      where: { studentId: student.id },
      orderBy: { date: "desc" },
      take: 6,
      select: { content: true, subject: true },
    }),
    prisma.misconception.findMany({
      where: { studentId: student.id, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { concept: true, lesson: { select: { subject: true } } },
    }),
    prisma.tutorSession.findMany({
      where: { studentId: student.id, summary: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 4,
      select: { summary: true, lesson: { select: { subject: true, lessonTitle: true } } },
    }),
  ]);

  return formatVoiceContext({
    studentName: student.preferredName,
    gradeLevel: student.gradeLevel,
    date: params.date,
    selectedLessonId: params.selectedLessonId,
    lessons: dayLessonRows.map(serializeLesson),
    feedback: feedback.map((item) => ({ subject: item.subject, content: item.content })),
    misconceptions: misconceptions.map((item) => ({
      subject: item.lesson?.subject ?? null,
      concept: item.concept,
    })),
    sessions: recentSessions.map((item) => ({
      subject: item.lesson?.subject ?? null,
      lessonTitle: item.lesson?.lessonTitle ?? null,
      summary: item.summary,
    })),
  });
}
