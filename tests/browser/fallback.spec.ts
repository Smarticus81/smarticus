import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const day: ScheduleView = JSON.parse(readFileSync("curriculum/2026-27/daily/2026-09-08.json", "utf8"));
const lesson: LessonView = {
  ...day.lessons.find((e) => e.subject === "mathematics")!,
  status: "planned", answer_key: {}, teacher_notes: "",
};

// A fake microphone, so the fallback's recorder has real frames to capture.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

/** A relay that answers `start` the way a provider does: ready, or refused and closed. */
function relay(ws: WebSocketRoute, outcome: { ready: boolean; provider: "gemini" | "grok" | "elevenlabs"; refusal?: string }) {
  ws.onMessage((raw) => {
    const frame = JSON.parse(String(raw)) as { t: string };
    if (frame.t !== "start") return;
    if (outcome.ready) {
      ws.send(JSON.stringify({
        t: "ready", sessionId: `${outcome.provider}-test`, provider: outcome.provider,
        model: `${outcome.provider}-model`, voice: "test-voice", images: outcome.provider === "gemini",
        lessonId: lesson.id, lessonMarker: `[SELECTED_LESSON:${lesson.id}]`,
      }));
      return;
    }
    ws.send(JSON.stringify({ t: "error", message: outcome.refusal }));
    ws.send(JSON.stringify({ t: "closed", reason: "upstream_closed_1011" }));
    void ws.close();
  });
}

async function openLesson(page: Page, fallbacks: string[]) {
  // Keep every microphone stream the app opens, to check it is still live later.
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as unknown as { __micStreams: MediaStream[] }).__micStreams = streams;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schedule/today") return route.fulfill({ json: { ...day, lessons: [lesson] } });
    if (url.pathname === "/api/schedule/dates") return route.fulfill({ json: [day.date] });
    if (url.pathname === "/api/student/snapshot") return route.fulfill({ json: { student: { id: "t", preferredName: "Atticus", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] } });
    if (url.pathname === "/api/lessons/select") return route.fulfill({ json: lesson });
    // The OpenAI budget is spent: the server offers its fallbacks, in order.
    if (url.pathname === "/api/realtime/live")
      return route.fulfill({ status: 402, json: { error: "The OpenAI voice budget is used up", fallbacks } });
    if (url.pathname === "/api/tools/lesson-started") return route.fulfill({ json: { sessionId: "tutor-session" } });
    return route.fulfill({ status: 503, json: { error: "no" } });
  });
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page.getByRole("button").filter({ hasText: lesson.lesson_title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: lesson.lesson_title })).toBeVisible();
  // One button: it loads the tutor and reaches for the microphone together.
  await page.getByRole("button", { name: "Talk with Virgil" }).click();
}

test("when Gemini's quota is spent too, the lesson carries on with Grok", async ({ page }) => {
  await page.routeWebSocket("**/api/realtime/gemini", (ws) =>
    relay(ws, { ready: false, provider: "gemini", refusal: "Gemini refused the fallback session (code 1011): You exceeded your current quota" }),
  );
  await page.routeWebSocket("**/api/realtime/grok", (ws) => relay(ws, { ready: true, provider: "grok" }));
  await openLesson(page, ["gemini", "grok"]);

  // Connected, not merely trying: the connect button is gone and stays gone.
  await expect(page.getByRole("button", { name: "Connect microphone" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
  // The failed Gemini attempt must not have stopped the microphone Grok uses.
  const tracks = await page.evaluate(() =>
    (window as unknown as { __micStreams: MediaStream[] }).__micStreams.flatMap((stream) =>
      stream.getAudioTracks().map((track) => track.readyState),
    ),
  );
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every((state) => state === "live")).toBe(true);
  const notice = page.locator(".voice-fallback-notice");
  await expect(notice).toContainText("xAI’s Grok");
  await expect(notice).not.toContainText("Google");
  // Gemini's refusal was recoverable, so it must not linger once Grok is up.
  await expect(page.getByText(/exceeded your current quota/)).toHaveCount(0);
});

test("when no fallback can start, the learner is told why each one failed", async ({ page }) => {
  await page.routeWebSocket("**/api/realtime/gemini", (ws) =>
    relay(ws, { ready: false, provider: "gemini", refusal: "quota spent" }),
  );
  await page.routeWebSocket("**/api/realtime/grok", (ws) =>
    relay(ws, { ready: false, provider: "grok", refusal: "key rejected" }),
  );
  await openLesson(page, ["gemini", "grok"]);

  const failure = page.getByText(/No backup tutor could start/);
  await expect(failure).toContainText("Gemini: quota spent");
  await expect(failure).toContainText("Grok: key rejected");
  await expect(page.locator(".voice-fallback-notice")).toHaveCount(0);
});

test("when Gemini and Grok both refuse, the lesson carries on with ElevenLabs", async ({ page }) => {
  await page.routeWebSocket("**/api/realtime/gemini", (ws) =>
    relay(ws, { ready: false, provider: "gemini", refusal: "quota spent" }),
  );
  await page.routeWebSocket("**/api/realtime/grok", (ws) =>
    relay(ws, { ready: false, provider: "grok", refusal: "key rejected" }),
  );
  await page.routeWebSocket("**/api/realtime/elevenlabs", (ws) =>
    relay(ws, { ready: true, provider: "elevenlabs" }),
  );
  await openLesson(page, ["gemini", "grok", "elevenlabs"]);

  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
  const notice = page.locator(".voice-fallback-notice");
  await expect(notice).toContainText("ElevenLabs");
  await expect(notice).not.toContainText("Grok");
  // The earlier refusals were recoverable, so neither lingers once ElevenLabs is up.
  await expect(page.getByText(/No backup tutor could start/)).toHaveCount(0);
});
