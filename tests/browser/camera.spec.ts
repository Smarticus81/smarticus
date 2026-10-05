import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const day: ScheduleView = JSON.parse(readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"));
const lesson: LessonView = {
  ...day.lessons.find((e) => e.subject === "mathematics")!,
  status: "planned", answer_key: {}, teacher_notes: "",
};

// A fake camera, so the Camera button has a real stream to open.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

async function openLesson(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schedule/today") return route.fulfill({ json: { ...day, lessons: [lesson] } });
    if (url.pathname === "/api/schedule/dates") return route.fulfill({ json: [day.date] });
    if (url.pathname === "/api/student/snapshot") return route.fulfill({ json: { student: { id: "t", preferredName: "Atticus", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] } });
    if (url.pathname === "/api/lessons/select") return route.fulfill({ json: lesson });
    return route.fulfill({ status: 503, json: { error: "no" } });
  });
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
}

/** Replace getUserMedia so a scripted answer stands in for the browser's. */
async function scriptCamera(page: Page, script: string) {
  await page.addInitScript(`
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__cameraRequests = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__cameraRequests.push(constraints);
      ${script}
    };
  `);
}

test("the Camera button opens the camera panel and Virgil can look through it", async ({ page }) => {
  await openLesson(page);
  const cameraButton = page.getByRole("button", { name: "Camera", exact: true });
  await cameraButton.click();

  const panel = page.getByTestId("camera");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "Close camera" }).first()).toBeVisible();
  await expect(page.getByTestId("camera-error")).toHaveCount(0);

  // The preview is really playing the stream, not a black box.
  const frame = page.getByTestId("camera-frame");
  await expect.poll(() => frame.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);

  const seen = (await page.evaluate(() =>
    window.__smarticus!.runTool("look_through_camera", { reason: null }, 1_000_000),
  )) as { output: { camera: string }; image?: string };
  expect(seen.output.camera).toContain("attached");

  await page.getByRole("button", { name: "Close camera" }).first().click();
  await expect(panel).toHaveCount(0);
  await expect(cameraButton).toBeVisible();
});

test("a blocked camera says so, and the button works again once it is allowed", async ({ page }) => {
  await scriptCamera(page, `
    if (window.__cameraRequests.length === 1) {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      throw error;
    }
    return original(constraints);
  `);
  await openLesson(page);
  await page.getByRole("button", { name: "Camera", exact: true }).click();

  const error = page.getByTestId("camera-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("address bar");
  await expect(page.getByTestId("camera")).toHaveCount(0);
  // A refusal of permission is not retried with other constraints.
  expect(await page.evaluate(() => window.__cameraRequests.length)).toBe(1);

  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByTestId("camera")).toBeVisible();
  await expect(error).toHaveCount(0);
});

test("a camera that refuses the preferred picture size is opened plainly instead", async ({ page }) => {
  await scriptCamera(page, `
    if (constraints.video !== true) {
      const error = new Error("Could not start video source");
      error.name = "NotReadableError";
      throw error;
    }
    return original(constraints);
  `);
  await openLesson(page);
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByTestId("camera")).toBeVisible();
  await expect(page.getByTestId("camera-error")).toHaveCount(0);
  expect(await page.evaluate(() => window.__cameraRequests.length)).toBe(2);
});

declare global {
  interface Window {
    __cameraRequests: MediaStreamConstraints[];
  }
}
