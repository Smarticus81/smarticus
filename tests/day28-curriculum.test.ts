import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import { DailyScheduleSchema } from "../shared/schemas/lesson.js";

it("Day 28 restores deferred core lessons with a bounded visual teach-first plan", async () => {
  const day = DailyScheduleSchema.parse(JSON.parse(await readFile("curriculum/2026-27/daily/2026-10-02.json", "utf8")));
  assert.equal(day.day_number, 28);
  assert.equal(day.date, "2026-10-02");
  assert.deepEqual(day.lessons.map(l => l.subject), ["mathematics", "writing", "french", "science", "history_geography", "computer_science", "literature"]);
  assert.equal(day.lessons.reduce((sum, l) => sum + l.estimated_minutes, 0), 240);
  assert.match(day.todays_goal, /10:30 AM to 3:30 PM/);
  for (const l of day.lessons) {
    assert.ok(l.worked_examples.length >= 2);
    assert.ok(l.vocabulary.every(v => v.definition.length > 0));
    assert.match(l.written_instruction, /^TIME CAP:/);
    assert.ok(l.independent_practice.every(p => p.answer));
    assert.ok(l.exit_ticket.every(p => p.answer));
    await readFile(`client/public/lesson-visuals/2026-10-02/${l.subject}.svg`);
  }
  assert.match(day.lessons.find(l => l.subject === "writing")!.written_instruction, /ONE SHORT FRAME/);
  assert.match(day.lessons.find(l => l.subject === "science")!.written_instruction, /normal.*turns too/);
  assert.match(day.lessons.find(l => l.subject === "computer_science")!.written_instruction, /LAPTOP ONLY/);
  assert.match(day.lessons.find(l => l.subject === "literature")!.written_instruction, /bookmark.*page\s*80/i);
});

it("Day 27 review distinguishes written evidence, missing proof, and deferred subjects", async () => {
  const book = JSON.parse(await readFile("curriculum/2026-27/records/gradebook.json", "utf8"));
  const review = book.days.find((d: {date: string}) => d.date === "2026-10-01");
  const grades = new Map(review.subjects.map((g: {subject: string; score: number | null; display: string}) => [g.subject, g]));
  for (const subject of ["mathematics", "writing", "computer_science"]) assert.equal((grades.get(subject) as {score: number | null}).score, null);
  assert.equal((grades.get("french") as {score: number}).score, 100);
  assert.equal((grades.get("science") as {score: number}).score, 80);
  assert.equal(book.ar.earned, 0);
});
