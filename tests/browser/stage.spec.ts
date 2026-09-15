import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const day: ScheduleView = JSON.parse(readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"));
const lesson: LessonView = {
  ...day.lessons.find((e) => e.subject === "mathematics")!,
  status: "planned", answer_key: {}, teacher_notes: "",
};

async function openLesson(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schedule/today") return route.fulfill({ json: { ...day, lessons: [lesson] } });
    if (url.pathname === "/api/schedule/dates") return route.fulfill({ json: [day.date] });
    if (url.pathname === "/api/student/snapshot") return route.fulfill({ json: { student: { id: "t", preferredName: "Atticus", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] } });
    if (url.pathname === "/api/lessons/select") return route.fulfill({ json: lesson });
    if (url.pathname === "/api/read/page")
      return route.fulfill({
        json: {
          page: {
            url: "https://example.org/greece", site: "example.org", title: "Ancient Greek city states",
            byline: null, truncated: false, images: [],
            blocks: [{ type: "heading", text: "City states" }, { type: "paragraph", text: "A polis was a city and the land around it." }],
          },
          summary: "Ancient Greek city states — example.org. A polis was a city and the land around it.",
          searchNote: null,
        },
      });
    return route.fulfill({ status: 503, json: { error: "no" } });
  });
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
}

test("Virgil can open the board and a page, and the stage shows both", async ({ page }) => {
  await openLesson(page);

  const opened = await page.evaluate(() => window.__smarticus!.runTool("whiteboard_open", { reason: null }));
  expect((opened as { open: boolean }).open).toBe(true);
  await expect(page.getByTestId("whiteboard")).toBeVisible();

  const browsed = (await page.evaluate(() =>
    window.__smarticus!.runTool("browse_web", { url: "https://example.org/greece", query: null, purpose: "city states" }),
  )) as { title: string; page_text: string };
  expect(browsed.title).toContain("Ancient Greek");
  const reader = page.getByTestId("reader");
  await expect(reader).toBeVisible();
  await expect(reader.getByText("A polis was a city and the land around it.")).toBeVisible();
  await expect(reader.getByRole("link", { name: "Open the real page" })).toHaveAttribute("href", "https://example.org/greece");

  // look_at_screen must describe both surfaces so she can teach from them.
  const seen = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }))) as {
    output: { interface: string };
  };
  expect(seen.output.interface).toContain("Reading panel open");

  await page.evaluate(() => window.__smarticus!.runTool("close_browser", {}));
  await expect(page.getByTestId("reader")).toHaveCount(0);
  await page.evaluate(() => window.__smarticus!.runTool("whiteboard_close", {}));
  await expect(page.getByTestId("whiteboard")).toHaveCount(0);
});
