import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type Subject } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getDefaultStudent } from "./student.js";

export type ParentSubjectGrade = {
  subject: string;
  score: number | null;
  display?: string;
  status: "reviewed" | "provisional" | "not_assessed" | "missing";
  note?: string;
};

export type ParentGradeDay = {
  date: string;
  day_number?: number;
  note?: string;
  subjects: ParentSubjectGrade[];
  source?: "backfill" | "database";
};

type GradebookSeed = {
  school_year: string;
  grading_note: string;
  ar?: {
    semester_goal: number;
    earned: number;
    current_book: string;
    current_book_points: number;
    status: string;
  };
  portfolio?: Array<{
    title: string;
    subject: string;
    status: string;
    description: string;
  }>;
  days: ParentGradeDay[];
};

const SUBJECT_ORDER = [
  "mathematics",
  "literature",
  "writing",
  "science",
  "history_geography",
  "french",
  "computer_science",
  "art_design",
  "pe",
] as const;

const SUBJECT_LABELS: Record<string, string> = {
  mathematics: "Mathematics 6",
  literature: "Literature 6",
  writing: "Writing 6",
  science: "Science 6",
  history_geography: "History, Geography & Civics 6",
  french: "French 6",
  computer_science: "Future Builder Lab",
  art_design: "Art & Design",
  pe: "PE / Wellness",
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function schoolToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function letterGrade(score: number | null): string {
  if (score === null) return "—";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}

async function readSeed(): Promise<GradebookSeed> {
  const file = path.join(process.cwd(), "curriculum", "2026-27", "records", "gradebook.json");
  return JSON.parse(await readFile(file, "utf-8")) as GradebookSeed;
}

function normalizeDay(value: unknown): ParentGradeDay | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.date !== "string" || !Array.isArray(record.subjects)) return null;
  const subjects = record.subjects
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      subject: String(item.subject ?? ""),
      score: typeof item.score === "number" ? item.score : null,
      ...(typeof item.display === "string" ? { display: item.display } : {}),
      status: ["reviewed", "provisional", "not_assessed", "missing"].includes(String(item.status))
        ? (String(item.status) as ParentSubjectGrade["status"])
        : "reviewed",
      ...(typeof item.note === "string" ? { note: item.note } : {}),
    }))
    .filter((item) => item.subject);
  return {
    date: record.date,
    ...(typeof record.day_number === "number" ? { day_number: record.day_number } : {}),
    ...(typeof record.note === "string" ? { note: record.note } : {}),
    subjects,
  };
}

export async function saveParentGradeDay(day: ParentGradeDay) {
  const normalized = normalizeDay(day);
  if (!normalized) throw new Error("Invalid grade day");
  const date = new Date(`${normalized.date}T00:00:00.000Z`);
  await prisma.dailyReview.upsert({
    where: { date },
    create: { date, content: normalized as unknown as Prisma.InputJsonValue },
    update: { content: normalized as unknown as Prisma.InputJsonValue },
  });
  return normalized;
}

export async function getParentDashboard() {
  const [seed, student, lessons, dbReviews, attendance, artifacts, courses] = await Promise.all([
    readSeed(),
    getDefaultStudent(),
    prisma.lesson.findMany({
      orderBy: [{ date: "asc" }, { lessonNumber: "asc" }],
      select: {
        date: true,
        subject: true,
        course: true,
        unitTitle: true,
        lessonTitle: true,
        lessonNumber: true,
        status: true,
        standards: true,
        dayNumber: true,
      },
    }),
    prisma.dailyReview.findMany({ orderBy: { date: "asc" } }),
    prisma.attendanceRecord.findMany({ orderBy: { date: "asc" } }),
    prisma.portfolioArtifact.findMany({ orderBy: { date: "desc" } }),
    prisma.course.findMany({
      include: { units: { include: { lessons: { select: { date: true, lessonTitle: true } } } } },
    }),
  ]);

  const overrides = new Map<string, ParentGradeDay>();
  for (const review of dbReviews) {
    const normalized = normalizeDay(review.content);
    if (normalized) overrides.set(isoDate(review.date), { ...normalized, source: "database" });
  }

  const backfill = new Map(seed.days.map((day) => [day.date, { ...day, source: "backfill" as const }]));
  const byDate = new Map<string, typeof lessons>();
  for (const lesson of lessons) {
    const key = isoDate(lesson.date);
    const group = byDate.get(key) ?? [];
    group.push(lesson);
    byDate.set(key, group);
  }

  const allDates = new Set([...byDate.keys(), ...backfill.keys(), ...overrides.keys()]);
  const days = [...allDates]
    .sort()
    .map((date) => {
      const lessonRows = byDate.get(date) ?? [];
      const grade = overrides.get(date) ?? backfill.get(date);
      const numeric = grade?.subjects
        .filter((item) => item.score !== null && item.status !== "not_assessed")
        .map((item) => item.score as number) ?? [];
      return {
        date,
        day_number: grade?.day_number ?? lessonRows[0]?.dayNumber ?? undefined,
        overall: average(numeric),
        overall_letter: letterGrade(average(numeric)),
        note: grade?.note ?? null,
        subjects: grade?.subjects ?? [],
        lesson_count: lessonRows.length,
        lesson_titles: lessonRows.map((item) => ({
          subject: item.subject,
          title: item.lessonTitle,
          unit: item.unitTitle,
        })),
        source: grade?.source ?? null,
      };
    });

  const today = schoolToday();
  const subjectSummaries = SUBJECT_ORDER.map((subject) => {
    const rows = lessons.filter((lesson) => lesson.subject === subject);
    if (!rows.length) return null;
    const scores = days.flatMap((day) =>
      day.subjects
        .filter((item) => item.subject === subject && item.score !== null && item.status !== "not_assessed")
        .map((item) => item.score as number),
    );
    const current = [...rows].reverse().find((lesson) => isoDate(lesson.date) <= today) ?? rows[0];
    const next = rows.find((lesson) => isoDate(lesson.date) > today) ?? null;
    const covered = rows.filter((lesson) => isoDate(lesson.date) <= today).length;
    const avg = average(scores);
    return {
      subject,
      label: SUBJECT_LABELS[subject] ?? subject,
      average: avg,
      letter: letterGrade(avg),
      graded_records: scores.length,
      lessons_covered: covered,
      lessons_total: rows.length,
      progress_percent: rows.length ? Math.round((covered / rows.length) * 100) : 0,
      current: current
        ? { date: isoDate(current.date), unit: current.unitTitle, lesson: current.lessonTitle }
        : null,
      next: next
        ? { date: isoDate(next.date), unit: next.unitTitle, lesson: next.lessonTitle }
        : null,
    };
  }).filter(Boolean);

  const transcript = subjectSummaries
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map((item) => ({
      subject: item.subject,
      course: item.label,
      grade: item.average,
      letter: item.letter,
      graded_records: item.graded_records,
      status: "In Progress",
    }));

  const attendanceByDate = new Map(attendance.map((record) => [isoDate(record.date), record.status]));
  const instructionalDates = [...byDate.keys()].filter((date) => date <= today);
  const attendanceSummary = {
    instructional_days: instructionalDates.length,
    present: instructionalDates.filter((date) => (attendanceByDate.get(date) ?? "present") === "present").length,
    partial: instructionalDates.filter((date) => attendanceByDate.get(date) === "partial").length,
    absent: instructionalDates.filter((date) => attendanceByDate.get(date) === "absent").length,
  };

  const portfolio = [
    ...(seed.portfolio ?? []),
    ...artifacts.map((artifact) => ({
      title: artifact.title,
      subject: "portfolio",
      status: "completed",
      description: artifact.description ?? "",
      date: isoDate(artifact.date),
    })),
  ];

  const overallScores = transcript.flatMap((item) => item.grade === null ? [] : [item.grade]);
  const overallAverage = average(overallScores);

  return {
    generated_at: new Date().toISOString(),
    school_year: seed.school_year,
    grading_note: seed.grading_note,
    student: {
      preferred_name: student.preferredName,
      grade_level: student.gradeLevel,
    },
    summary: {
      overall_average: overallAverage,
      overall_letter: letterGrade(overallAverage),
      graded_days: days.filter((day) => day.subjects.some((subject) => subject.score !== null)).length,
      curriculum_days: byDate.size,
      today,
    },
    days,
    subjects: subjectSummaries,
    transcript,
    attendance: attendanceSummary,
    ar: seed.ar ?? null,
    portfolio,
    course_descriptions: courses.map((course) => ({
      subject: course.subject,
      title: course.title,
      description: course.description,
    })),
  };
}
