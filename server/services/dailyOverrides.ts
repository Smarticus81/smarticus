import { readFile } from "node:fs/promises";
import path from "node:path";

/** Keep removed lessons in the database for their work history, but out of the revised day. */
export async function deferredLessonIds(date: string): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  try {
    const day = JSON.parse(await readFile(path.join(process.cwd(), "curriculum", "2026-27", "daily", `${date}.json`), "utf8"));
    return Array.isArray(day.deferred_lesson_ids)
      ? day.deferred_lesson_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
  } catch { return []; }
}

export async function omitDeferredLessons<T extends { date: Date; externalId: string }>(rows: T[]): Promise<T[]> {
  const dates = [...new Set(rows.map(row => row.date.toISOString().slice(0, 10)))];
  const excluded = new Set((await Promise.all(dates.map(deferredLessonIds))).flat());
  return rows.filter(row => !excluded.has(row.externalId));
}

export async function orderDailyLessons<T extends { externalId: string }>(date: string, rows: T[]): Promise<T[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return rows;
  try {
    const day = JSON.parse(await readFile(path.join(process.cwd(), "curriculum", "2026-27", "daily", `${date}.json`), "utf8"));
    if (!Array.isArray(day.lessons)) return rows;
    const order = new Map<string, number>(day.lessons.map((lesson: { id: string }, index: number) => [lesson.id, index]));
    return [...rows].sort((a, b) => (order.get(a.externalId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.externalId) ?? Number.MAX_SAFE_INTEGER));
  } catch { return rows; }
}
