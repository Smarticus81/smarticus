import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const day: ScheduleView = JSON.parse(readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"));
const lesson: LessonView = {
  ...day.lessons.find((e) => e.subject === "mathematics")!,
  status: "planned", answer_key: {}, teacher_notes: "",
};

/**
 * A pretend screen picker. The browser's real one needs a person to choose, so
 * getDisplayMedia is replaced with a drawing canvas whose stream reports the
 * surface a test names, the way Chrome reports "monitor" for a whole screen.
 */
async function fakeDisplayMedia(page: Page, surface: "monitor" | "browser") {
  await page.addInitScript(`
    window.__displayRequests = [];
    navigator.mediaDevices.getDisplayMedia = async (constraints) => {
      window.__displayRequests.push(constraints);
      const canvas = document.createElement("canvas");
      canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext("2d");
      // A real screen is full of detail and never compresses to a few
      // kilobytes; a flat canvas would, and then it would fit a budget no
      // real frame fits. Noise keeps the fake frame honest.
      const noise = context.createImageData(1280, 720);
      for (let i = 0; i < noise.data.length; i += 4) {
        noise.data[i] = Math.random() * 255; noise.data[i + 1] = Math.random() * 255;
        noise.data[i + 2] = Math.random() * 255; noise.data[i + 3] = 255;
      }
      context.putImageData(noise, 0, 0);
      context.fillStyle = "#fff"; context.font = "28px sans-serif";
      context.fillText("Blender - Object Mode", 20, 60);
      // Keep drawing so the capture stream has fresh frames.
      setInterval(() => { context.fillRect(600, 330, 10, 10); }, 100);
      const stream = canvas.captureStream(5);
      for (const track of stream.getVideoTracks()) {
        const original = track.getSettings.bind(track);
        track.getSettings = () => ({ ...original(), displaySurface: ${JSON.stringify(surface)} });
      }
      return stream;
    };
  `);
}

async function openLesson(page: Page, describe: (body: { image: string; surface: string; question: string | null }) => unknown) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schedule/today") return route.fulfill({ json: { ...day, lessons: [lesson] } });
    if (url.pathname === "/api/schedule/dates") return route.fulfill({ json: [day.date] });
    if (url.pathname === "/api/student/snapshot") return route.fulfill({ json: { student: { id: "t", preferredName: "Atticus", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] } });
    if (url.pathname === "/api/lessons/select") return route.fulfill({ json: lesson });
    if (url.pathname === "/api/vision/screen") {
      const body = route.request().postDataJSON() as { image: string; surface: string; question: string | null };
      const answer = describe(body);
      return typeof answer === "number" ? route.fulfill({ status: answer, json: { error: "no" } }) : route.fulfill({ json: answer });
    }
    return route.fulfill({ status: 503, json: { error: "no" } });
  });
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
}

type Seen = { output: { shared_screen?: string; interface: string; screenshot: string }; images: string[] };

test("the picker may offer the whole screen, and look_at_screen describes it in words when no image fits", async ({ page }) => {
  await fakeDisplayMedia(page, "monitor");
  const described: Array<{ surface: string; question: string | null; imageBytes: number }> = [];
  await openLesson(page, (body) => {
    described.push({ surface: body.surface, question: body.question, imageBytes: body.image.length });
    return { description: "Blender is open in Object Mode. The selected object is Body; Dimensions X 3, Y 4.4, Z 0.6." };
  });

  await page.evaluate(() => window.__smarticus!.screenShare.start());
  const request = (await page.evaluate(() => window.__displayRequests[0])) as Record<string, unknown>;
  expect(request).not.toHaveProperty("preferCurrentTab");
  expect(request.selfBrowserSurface).toBe("include");

  // The main voice tier reports a small allowance whenever its history has
  // room, never enough for a frame: the words stand in for the picture.
  const seen = (await page.evaluate(() =>
    window.__smarticus!.runTool("look_at_screen", { reason: "Which object is selected?" }, 8_192),
  )) as Seen;
  expect(seen.images).toEqual([]);
  expect(seen.output.shared_screen).toContain("Object Mode");
  expect(seen.output.screenshot).toContain("his whole screen");
  expect(seen.output.screenshot).toContain("Blender");
  expect(seen.output.screenshot).not.toContain("choose Entire screen");
  expect(described).toHaveLength(1);
  expect(described[0].surface).toBe("monitor");
  expect(described[0].question).toBe("Which object is selected?");
  // Far more than the main tier's 8KB image allowance, like any real screen.
  expect(described[0].imageBytes).toBeGreaterThan(8_192);
  // The picture itself was a real JPEG frame of the shared canvas.
  const keys = Object.keys(seen.output);
  expect(keys[0]).toBe("shared_screen");

  // A backend that takes pictures gets the frame instead, with no vision call.
  const withImage = (await page.evaluate(() =>
    window.__smarticus!.runTool("look_at_screen", { reason: null }, 1_000_000),
  )) as Seen;
  expect(withImage.images).toHaveLength(1);
  expect(withImage.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  expect(withImage.output.shared_screen).toBeUndefined();
  expect(withImage.output.screenshot).toContain("screenshot of the shared screen is attached");
  expect(described).toHaveLength(1);

  // A provider with no image input at all takes the same path.
  const none = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }, 0))) as Seen;
  expect(none.images).toEqual([]);
  expect(none.output.shared_screen).toContain("Object Mode");
  expect(described).toHaveLength(2);

  await page.evaluate(() => window.__smarticus!.screenShare.stop());
  const off = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }, 0))) as Seen;
  expect(off.output.screenshot).toMatch(/Screen share is off/);
  expect(off.output.screenshot).toContain("Entire screen");
});

test("a tab-only share says Blender is not in the picture and how to change that", async ({ page }) => {
  await fakeDisplayMedia(page, "browser");
  await openLesson(page, () => ({ description: "The lesson page in the browser." }));
  await page.evaluate(() => window.__smarticus!.screenShare.start());
  const seen = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }, 8_192))) as Seen;
  expect(seen.output.shared_screen).toBe("The lesson page in the browser.");
  expect(seen.output.screenshot).toContain("only this browser tab");
  expect(seen.output.screenshot).toContain("choose Entire screen");
});

test("a failed description still returns the interface, and says the picture could not be described", async ({ page }) => {
  await fakeDisplayMedia(page, "monitor");
  await openLesson(page, () => 502);
  await page.evaluate(() => window.__smarticus!.screenShare.start());
  const seen = (await page.evaluate(() => window.__smarticus!.runTool("look_at_screen", { reason: null }, 8_192))) as Seen;
  expect(seen.output.shared_screen).toBeUndefined();
  expect(seen.images).toEqual([]);
  expect(seen.output.interface).toContain("Open section");
  expect(seen.output.screenshot).toContain("could not be described");
});

declare global {
  interface Window {
    __displayRequests: unknown[];
  }
}
