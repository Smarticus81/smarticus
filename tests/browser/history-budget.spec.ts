import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";
import { DEFAULT_TOOL_OUTPUT_BYTES } from "../../client/src/voice/liveEvents";

const day: ScheduleView = JSON.parse(readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"));
const lesson: LessonView = {
  ...day.lessons.find((entry) => entry.subject === "mathematics")!,
  status: "planned",
  answer_key: {},
  teacher_notes: "",
};

async function openLesson(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schedule/today") return route.fulfill({ json: { ...day, lessons: [lesson] } });
    if (url.pathname === "/api/schedule/dates") return route.fulfill({ json: [day.date] });
    if (url.pathname === "/api/student/snapshot")
      return route.fulfill({
        json: { student: { id: "t", preferredName: "Atticus", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] },
      });
    if (url.pathname === "/api/lessons/select") return route.fulfill({ json: lesson });
    return route.fulfill({ status: 503, json: { error: "No live AI or database calls in browser checks." } });
  });
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
}

/**
 * The delegated backend holds 32768 bytes of input history per session, so a
 * look_at_screen answer has to stay small while keeping what matters: the
 * question, the learner's own writing, and the whiteboard.
 */
test("look_at_screen stays inside the per-output budget and keeps what matters", async ({ page }) => {
  await openLesson(page);
  await page.evaluate(() =>
    window.__smarticus!.runTool("navigate_lesson", { section: "practice", question_number: 2 }),
  );
  await expect(page.locator(".focused-question")).toHaveCount(1);

  const seen = await page.evaluate(async () => {
    const result = (await window.__smarticus!.runTool("look_at_screen", { reason: null })) as {
      output: { interface: string; screenshot: string; whiteboard_image: string };
      images: string[];
    };
    return { result, bytes: new TextEncoder().encode(JSON.stringify(result.output)).length };
  });

  expect(seen.bytes).toBeLessThanOrEqual(DEFAULT_TOOL_OUTPUT_BYTES);
  // The lines worth paying for survive the trim, including the trailing extras.
  expect(seen.result.output.interface).toContain("Selected practice item: Question 2");
  expect(seen.result.output.interface).toContain("Question prompt:");
  expect(seen.result.output.interface).toContain("The whiteboard is empty.");
  // Images never ride along without a granted budget; the fixture grants none.
  expect(seen.result.images).toEqual([]);
});

test("the compact snapshot keeps written work and sheds empty fields", async ({ page }) => {
  await openLesson(page);
  const lines = await page.evaluate(() => {
    // A synthetic root keeps this about the trimming rule itself, independent of
    // how the live lesson page happens to be laid out.
    const root = document.createElement("div");
    document.body.append(root);
    for (let i = 0; i < 6; i++) {
      const label = document.createElement("label");
      label.htmlFor = `probe-${i}`;
      label.textContent = `Field ${i}`;
      const area = document.createElement("textarea");
      area.id = `probe-${i}`;
      // Only the last two carry the learner's writing.
      area.value = i >= 4 ? `answer number ${i}` : "";
      root.append(label, area);
    }
    const compact = window.__smarticus!.captureUiSnapshot({ root, compact: true });
    root.remove();
    return compact.split("\n").filter((line) => line.startsWith('Field "'));
  });

  const written = lines.filter((line) => line.includes("answer number"));
  expect(written).toHaveLength(2);
  expect(lines.length).toBeLessThanOrEqual(4);
  expect(lines[0]).toContain("answer number");
});
