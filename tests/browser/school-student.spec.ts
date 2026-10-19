import { test, expect, type Page } from "@playwright/test";
import type { SchoolContext } from "../../shared/schoolContext";

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, permissions: ["microphone", "camera"] });

// All school information is synthetic and all API calls are intercepted.
const school: SchoolContext = {
  schemaVersion: 1, active: true, sourceName: "Example Learning School", schoolYear: "2026-27",
  asOf: "2026-10-10T15:30:00Z", timeZone: "America/Chicago", timezoneNote: "Meeting times are listed in school time.",
  summary: "Practice one idea at a time.",
  courses: [
    { id: "math", label: "Mathematics", subject: "mathematics", focus: "Explore ratios and number relationships.", units: ["Ratios"], instructions: [], sourceUrl: "https://example.org/math" },
    { id: "science", label: "Science", subject: "science", focus: "Explain evidence.", units: [], instructions: [], sourceUrl: "https://example.org/science" },
  ],
  assignments: [
    { id: "ratios-next", courseId: "math", title: "Compare two recipes", unit: "Unit 2 · Ratios", kind: "practice", status: "next", instructions: ["Compare the ratio of flour to water in each recipe."], tutoringFocus: "Use equivalent ratios.", sequence: 2, timingNote: "After introducing ratios" },
    { id: "ratios-now", courseId: "math", title: "Introducing ratios", unit: "Unit 2 · Ratios", kind: "lesson", status: "current", instructions: ["Read the examples on pages 4–5.", "Draw two groups and explain the ratio in your own words."], tutoringFocus: "Explain both quantities before calculating.", sequence: 1, timingNote: "Begin with this lesson" },
    { id: "science-later", courseId: "science", title: "Plan an investigation", unit: "Unit 1 · Evidence", kind: "activity", status: "later", instructions: ["Identify the variable you will change."], tutoringFocus: "Distinguish a question from a prediction.", sequence: 3, timingNote: "" },
  ],
  schedule: [{ label: "Math live lesson", when: "Wednesday, 10:15–11:00", timeZone: "America/Chicago", verification: "verified", notes: "Bring your questions.", sourceUrl: "https://example.org/schedule" }, { label: "Optional check-in", when: "Friday afternoon", timeZone: null, verification: "unconfirmed", notes: "Check your school calendar first." }],
  workload: [], cautions: ["A live lesson is separate from the assignment sequence."], sources: [{ label: "Course guide", url: "https://example.org/guide", checkedAt: "2026-10-10T15:00:00Z" }],
};

async function fixture(page: Page, options: { locked?: boolean; rejectCookie?: boolean; unavailable?: boolean } = {}) {
  let authenticated = !options.locked;
  let revision = 4;
  let context: SchoolContext | null = structuredClone(school);
  let unavailable = !!options.unavailable;
  const calls: Array<{ path: string; method: string; body: any }> = [];
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = method === "GET" ? null : request.postDataJSON();
    calls.push({ path, method, body });
    if (path === "/api/parent/login") { authenticated = !options.rejectCookie; return route.fulfill({ json: { authenticated: true } }); }
    if (path === "/api/parent/logout") { authenticated = false; return route.fulfill({ status: 204 }); }
    if (path === "/api/parent/session") return route.fulfill({ json: { authenticated, configured: true } });
    if (path === "/api/parent/school-context") {
      if (!authenticated) return route.fulfill({ status: 401, json: { error: "Parent code required." } });
      if (unavailable) return route.fulfill({ status: 503, json: { error: "Unavailable." } });
      return route.fulfill({ json: { revision, context, updatedAt: "2026-10-10T15:30:00Z", lessons: [] } });
    }
    if (path === "/api/parent/school-tutor/live") return route.fulfill({ status: 503, json: { error: "Synthetic voice is unavailable." } });
    if (path === "/api/schedule/today") return route.fulfill({ json: { lessons: [], school_year: "2026-27", grade_level: 6, date: "2026-09-01", day_number: 1 } });
    if (path === "/api/schedule/dates") return route.fulfill({ json: ["2026-09-01"] });
    if (path === "/api/student/snapshot") return route.fulfill({ json: { student: { preferredName: "Learner", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] } });
    return route.fulfill({ status: 503, json: { error: "No live API in this test." } });
  });
  return { calls, expire: () => { authenticated = false; }, revise: () => { revision += 1; context!.assignments[1].instructions[0] = "Read the updated example."; }, empty: () => { context = null; revision++; }, recover: () => { unavailable = false; } };
}
const homeUrl = "/tests/browser/school-context.html";
const openMath = async (page: Page) => page.getByRole("region", { name: "Start here", exact: true }).getByRole("button", { name: "Open assignment" }).click();

test("school day is home and reuses an existing parent session without public lesson reads", async ({ page }) => {
  const mock = await fixture(page);
  await page.goto(homeUrl);
  await expect(page.getByRole("button", { name: "School day", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Your schoolwork", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start here", exact: true })).toContainText("Introducing ratios");
  await expect(page.getByRole("region", { name: "Up next", exact: true })).toContainText("Compare two recipes");
  await expect(page.getByRole("complementary", { name: "School schedule" })).toContainText("Wednesday, 10:15–11:00");
  await expect(page.getByRole("complementary", { name: "School schedule" })).toContainText("Time zone not confirmed");
  await expect(page.getByRole("link", { name: "School source" }).first()).toHaveAttribute("href", "https://example.org/math");
  expect(mock.calls.every(call => call.path === "/api/parent/school-context")).toBe(true);
  await page.screenshot({ path: "test-results/school-student-desktop.png", fullPage: true });
});

test("existing parent code unlocks schoolwork inline and is verified with another read", async ({ page }) => {
  const mock = await fixture(page, { locked: true });
  await page.goto(homeUrl);
  await expect(page.getByRole("heading", { name: "Let’s open your school day." })).toBeVisible();
  await expect(page.getByText("Introducing ratios", { exact: true })).toHaveCount(0);
  await page.getByLabel("Parent access code").fill("1234");
  await page.getByRole("button", { name: "Unlock schoolwork" }).click();
  await expect(page.getByRole("heading", { name: "Your schoolwork", exact: true })).toBeVisible();
  expect(mock.calls.filter(call => call.path === "/api/parent/login")).toHaveLength(1);
  expect(mock.calls.filter(call => call.path === "/api/parent/school-context")).toHaveLength(2);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("an accepted code without a retained session does not expose the school plan", async ({ page }) => {
  await fixture(page, { locked: true, rejectCookie: true });
  await page.goto(homeUrl);
  await page.getByLabel("Parent access code").fill("1234");
  await page.getByRole("button", { name: "Unlock schoolwork" }).click();
  await expect(page.getByRole("status")).toContainText("could not stay signed in");
  await expect(page.getByText("Introducing ratios", { exact: true })).toHaveCount(0);
});

test("assignment workspace contains exact instructions and clears private notes when leaving", async ({ page }) => {
  const mock = await fixture(page);
  await page.goto(homeUrl);
  await openMath(page);
  await expect(page.getByRole("heading", { level: 1, name: "Introducing ratios" })).toBeVisible();
  await expect(page.getByText("Read the examples on pages 4–5.", { exact: true })).toBeVisible();
  await expect(page.getByText("Draw two groups and explain the ratio in your own words.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in your school portal" })).toHaveAttribute("href", "https://example.org/math");
  await page.getByRole("textbox", { name: /Try it out/ }).fill("A private practice thought");
  await page.getByRole("button", { name: "Open whiteboard" }).click();
  await expect(page.locator(".school-whiteboard")).toBeVisible();
  await page.screenshot({ path: "test-results/school-assignment-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Back to school day" }).click();
  await openMath(page);
  await expect(page.getByRole("textbox", { name: /Try it out/ })).toHaveValue("");
  await expect(page.locator(".school-whiteboard")).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(mock.calls.filter(call => call.method !== "GET")).toHaveLength(0);
});

test("a private 401 clears assignment, notes, and school context", async ({ page }) => {
  const mock = await fixture(page);
  await page.goto(homeUrl); await openMath(page);
  await page.getByRole("textbox", { name: /Try it out/ }).fill("This should disappear");
  mock.expire();
  await page.getByRole("button", { name: "Refresh plan" }).click();
  await expect(page.getByRole("button", { name: "Unlock schoolwork" })).toBeVisible();
  await expect(page.getByRole("region", { name: "School assignment workspace" })).toHaveCount(0);
  await expect(page.getByText("Example Learning School", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("lock clears private data and invokes only the existing logout endpoint", async ({ page }) => {
  const mock = await fixture(page);
  await page.goto(homeUrl); await openMath(page);
  await page.getByRole("button", { name: "Lock schoolwork" }).click();
  await expect(page.getByRole("button", { name: "Unlock schoolwork" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Introducing ratios" })).toHaveCount(0);
  expect(mock.calls.filter(call => call.method !== "GET")).toEqual([{ path: "/api/parent/logout", method: "POST", body: null }]);
});

test("plan revision changes close the old workspace before tutoring continues", async ({ page }) => {
  const mock = await fixture(page);
  await page.goto(homeUrl); await openMath(page);
  mock.revise();
  await page.getByRole("button", { name: "Refresh plan" }).click();
  await expect(page.getByRole("status")).toContainText("school plan was updated");
  await expect(page.getByRole("region", { name: "School assignment workspace" })).toHaveCount(0);
  await openMath(page);
  await expect(page.getByText("Read the updated example.", { exact: true })).toBeVisible();
});

test("empty plans and read failures have useful recovery states", async ({ page }) => {
  const mock = await fixture(page, { unavailable: true });
  await page.goto(homeUrl);
  await expect(page.getByRole("alert")).toContainText("couldn’t refresh");
  mock.recover(); mock.empty();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Your school plan hasn’t been added yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open parent records" })).toHaveAttribute("href", "/parent");
});

test("schoolwork, schedule, workspace and locked state fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto(homeUrl);
  await expect(page.getByRole("heading", { name: "Your schoolwork", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/school-student-mobile.png", fullPage: true });
  await openMath(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/school-assignment-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Lock schoolwork" }).click();
  await expect(page.getByRole("button", { name: "Unlock schoolwork" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("school camera is preview-only and stops when the assignment closes", async ({ page }) => {
  const mock = await fixture(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const streams: MediaStream[] = [];
    (window as any).__schoolStreams = streams;
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints); streams.push(stream); return stream;
    };
  });
  await page.goto(homeUrl); await openMath(page);
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("region", { name: "Schoolwork camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Hand in/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to school day" }).click();
  await expect(page.getByRole("region", { name: "Schoolwork camera" })).toHaveCount(0);
  const states = await page.evaluate(() => (window as any).__schoolStreams.flatMap((stream: MediaStream) => stream.getTracks().map(track => track.readyState)));
  expect(states.length).toBeGreaterThan(0);
  expect(states.every((state: string) => state === "ended")).toBe(true);
  expect(mock.calls.filter(call => call.method !== "GET")).toHaveLength(0);
});

test.describe("private voice routing", () => {
  test("selected school assignment reaches only private voice and cannot fall back to archive services", async ({ page }) => {
    const mock = await fixture(page);
    await page.goto(homeUrl); await openMath(page);
    await page.getByRole("button", { name: "Talk with Virgil" }).click();
    await expect.poll(() => mock.calls.some(call => call.path === "/api/parent/school-tutor/live")).toBe(true);
    const request = mock.calls.find(call => call.path === "/api/parent/school-tutor/live")!;
    expect(request.body).toMatchObject({ assignmentId: "ratios-now", expectedRevision: 4 });
    expect(request.body.context).toBeUndefined();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(mock.calls.every(call => call.path.startsWith("/api/parent/"))).toBe(true);
    await page.getByRole("button", { name: "Lock schoolwork" }).click();
    await expect(page.getByRole("region", { name: "Virgil voice tutor" })).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
});
