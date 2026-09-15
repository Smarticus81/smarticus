import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const day: ScheduleView = JSON.parse(
  readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"),
);
const lesson: LessonView = {
  ...day.lessons.find((entry) => entry.subject === "mathematics")!,
  status: "planned",
  answer_key: {},
  teacher_notes: "",
};

async function mockApi(page: Page) {
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
}

async function openLesson(page: Page) {
  await mockApi(page);
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
}

function canvasInk(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='whiteboard-canvas']")!;
    const context = canvas.getContext("2d")!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) {
      // Ink of any pen color; the off-white background and faint grid dots are excluded.
      if (data[index] < 200 && data[index + 1] < 200) dark += 1;
    }
    return dark;
  });
}

test("Virgil draws on the whiteboard live and can look at what was drawn", async ({ page }) => {
  await openLesson(page);
  await expect(page.getByTestId("whiteboard")).toHaveCount(0);
  const result = await page.evaluate(() =>
    window.__smarticus!.runTool("whiteboard_draw", {
      clear_first: true,
      caption: "Three quarters, shaded.",
      steps: [
        { kind: "text", x: 60, y: 70, text: "3/4 of the bar", size: 36, color: null },
        { kind: "fraction_bar", x: 60, y: 140, w: 700, h: 80, parts: 4, shaded: 3, label: "3/4", color: "#2f6fd6" },
        { kind: "number_line", x: 60, y: 360, w: 800, min: 0, max: 1, step: 0.25, marks: [0.75], color: null },
        { kind: "line", x1: 60, y1: 480, x2: 500, y2: 480, arrow: true, width: 4, color: "#c2452b" },
        { kind: "table", x: 560, y: 440, rows: [["Part", "Whole"], ["3", "4"]], cell_width: 120, color: null },
        { kind: "pause", ms: 10 },
      ],
    }),
  );
  expect((result as { drawn: number; rejected_steps: number }).drawn).toBe(6);
  expect((result as { rejected_steps: number }).rejected_steps).toBe(0);
  // The tool opens the board for the learner automatically.
  await expect(page.getByTestId("whiteboard")).toBeVisible();
  await expect(page.getByText("Three quarters, shaded.")).toBeVisible();
  const early = await canvasInk(page);
  await expect.poll(() => canvasInk(page), { timeout: 15_000 }).toBeGreaterThan(early + 500);
  await expect
    .poll(() => page.evaluate(() => window.__smarticus!.whiteboard.busy), { timeout: 20_000 })
    .toBe(false);
  const look = (await page.evaluate(() => window.__smarticus!.runTool("whiteboard_look", {}))) as {
    output: { board: string };
    images: string[];
  };
  expect(look.output.board).toContain("fraction bar 3/4");
  expect(look.output.board).toContain("number line 0 to 1 marking 0.75");
  // Images ride only on a granted budget; the board's listed contents are what
  // the tutor normally works from, because a data URL does not fit the backend's
  // 32768-byte session history.
  expect(look.images).toEqual([]);
  const withBudget = (await page.evaluate(() =>
    window.__smarticus!.runTool("whiteboard_look", {}, 64_000),
  )) as { images: string[] };
  expect(withBudget.images[0]).toMatch(/^data:image\/png;base64,/);
});

test("the learner can draw back with the pen and the tutor sees the strokes", async ({ page }) => {
  await openLesson(page);
  await page.getByRole("button", { name: "Whiteboard" }).first().click();
  const canvas = page.getByTestId("whiteboard-canvas");
  await expect(canvas).toBeVisible();
  const before = await canvasInk(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 160, { steps: 12 });
  await page.mouse.move(box.x + 300, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("aria-label", /1 by you/);
  expect(await canvasInk(page)).toBeGreaterThan(before + 50);
  const summary = await page.evaluate(() => window.__smarticus!.whiteboard.summary());
  expect(summary).toMatch(/Atticus drew freehand path/);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /0 drawings/);
  await page.getByRole("button", { name: "Close whiteboard" }).click();
  await expect(page.getByTestId("whiteboard")).toHaveCount(0);
});

test("look_at_screen describes the real interface and navigate_lesson moves it", async ({ page }) => {
  await openLesson(page);
  const moved = await page.evaluate(() =>
    window.__smarticus!.runTool("navigate_lesson", { section: "practice", question_number: 2 }),
  );
  expect((moved as { result: string }).result).toContain("Showing practice question 2");
  await expect(page.locator(".journey-nav button[aria-current='step']")).toHaveText(/Practice/);
  await expect(page.locator(".question-map button[aria-current='step']")).toHaveAttribute(
    "aria-label",
    /Question 2/,
  );
  // Section transitions animate; wait until only the selected question card remains.
  await expect(page.locator(".focused-question")).toHaveCount(1);
  const prompt = (await page.locator(".focused-question h3").textContent())!.trim();
  await page.getByRole("textbox", { name: prompt }).fill("I think the first step is to compare parts.");
  const seen = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }))) as {
    output: { interface: string; screenshot: string };
    images: string[];
  };
  expect(seen.output.interface).toContain("Open section: 03Practice");
  expect(seen.output.interface).toContain("Selected practice item: Question 2");
  expect(seen.output.interface).toContain("I think the first step is to compare parts.");
  expect(seen.output.interface).toContain("Question prompt:");
  expect(seen.output.interface).toContain("The whiteboard is empty.");
  expect(seen.output.screenshot).toMatch(/Screen share is off/);
  expect(seen.images).toEqual([]);
  const bad = await page.evaluate(() =>
    window.__smarticus!.runTool("navigate_lesson", { section: "practice", question_number: 99 }),
  );
  expect((bad as { result: string }).result).toMatch(/does not exist/);
});
