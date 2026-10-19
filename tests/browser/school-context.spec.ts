import { test, expect, type Page } from "@playwright/test";
import type { SchoolContext } from "../../shared/schoolContext";
import type { LessonView, SchoolPlanState } from "../../client/src/lib/types";

// Deliberately synthetic. No school account, student records, or live services.
const context: SchoolContext = {
  schemaVersion: 1, active: true, sourceName: "Example school reference", schoolYear: "2026-27",
  asOf: "2026-10-07T14:30:00Z", timeZone: null,
  timezoneNote: "The school time zone has not yet been confirmed. Do not convert the listed times.",
  summary: "Use this course snapshot to choose what to discuss with your tutor.",
  courses: [
    { id: "math-1", label: "Mathematics foundations", subject: "mathematics", focus: "Explain number relationships with examples.", units: ["Ratios", "Number sense"], instructions: ["Ask for the current assigned lesson first."], sourceUrl: "https://example.org/courses/math" },
    { id: "science-1", label: "Science inquiry", subject: "science", focus: "Practice observations and evidence.", units: ["Scientific investigations"], instructions: [] },
  ],
  schedule: [
    { label: "Math workshop", when: "Tuesday at 10:15 (as shown in the portal)", timeZone: null, verification: "reported", notes: "Confirm the meeting time in the official system." },
    { label: "Science meeting", when: "Wednesday 14:00", timeZone: "America/Chicago", verification: "verified", notes: "Source checked at the snapshot time.", sourceUrl: "https://example.org/schedule" },
  ],
  workload: [{ label: "Weekly planning", detail: "Check the official lesson queue before estimating workload.", verification: "unconfirmed" }],
  cautions: ["A tutoring session does not prove that an assignment is finished."],
  sources: [{ label: "Example course overview", url: "https://example.org/courses", checkedAt: "2026-10-07T14:20:00Z" }],
};

const builder: LessonView = {
  id: "test-builder", external_id: "supplementary-builder", date: "2026-09-01", school_year: "2026-27", grade_level: 6,
  subject: "computer_science", course: "Creative practice", unit_id: "creative-practice", unit_title: "Creative practice", lesson_number: 1,
  lesson_title: "Supplementary Builder project", standards: [], previous_learning: "", course_context: "Generic supplementary lesson",
  learning_objectives: ["Explain a design choice."], why_it_matters: "", vocabulary: [],
  written_instruction: "Describe a design in your own words.", worked_examples: [],
  guided_practice: [{ id: "practice-1", prompt: "Describe your design choice." }], independent_practice: [], exit_ticket: [],
  mastery_threshold: 80, materials: [], estimated_minutes: 15, voice_prompt: "", teacher_notes: "", answer_key: {}, status: "planned",
};
const state = (): SchoolPlanState => ({ context: structuredClone(context), revision: 3, updatedAt: "2026-10-07T14:40:00Z", lessons: [] });

async function mockApi(page: Page, options: { active?: boolean; empty?: boolean; failSchool?: boolean; failSchedule?: boolean; conflict?: boolean; authenticated?: boolean } = {}) {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  let saved = state();
  if (options.active === false) saved.context!.active = false;
  let failSchool = options.failSchool;
  let conflict = options.conflict;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = method === "GET" ? null : request.postDataJSON();
    calls.push({ path, method, body });
    const ok = (json: unknown) => route.fulfill({ json });
    if (path === "/api/parent/session") return ok({ authenticated: options.authenticated !== false, configured: true });
    if (path === "/api/parent/login") return ok({ authenticated: true });
    // School editing must still work if the historical dashboard is unavailable.
    if (path === "/api/parent/dashboard") return route.fulfill({ status: 503, json: { error: "Historical dashboard unavailable in this fixture." } });
    if (path === "/api/parent/school-context") {
      if (method === "PUT") {
        if (conflict) {
          conflict = false;
          saved = { ...saved, revision: 4, context: { ...saved.context!, summary: "A newer saved reference." } };
          return route.fulfill({ status: 409, json: { error: "Revision conflict" } });
        }
        saved = { ...saved, context: body.context, revision: saved.revision + 1, updatedAt: "2026-10-08T12:00:00Z" };
        return ok(saved);
      }
      if (failSchool) { failSchool = false; return route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }); }
      return ok(saved);
    }
    if (path === "/api/schedule/today") {
      if (options.failSchedule) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return ok({ date: url.searchParams.get("date"), school_year: "2026-27", grade_level: 6, lessons: options.empty ? [] : [builder], day_number: 1, todays_goal: "Supplementary practice" });
    }
    if (path === "/api/schedule/dates") return ok(["2026-09-01"]);
    if (path === "/api/student/snapshot") return ok({ student: { id: "test-student", preferredName: "Learner", gradeLevel: 6 }, mastery: [], recentSessions: [], attendance: [] });
    if (path === "/api/lessons/select") return ok([...saved.lessons, builder].find((lesson) => lesson.id === body.lesson_id));
    if (path.endsWith("/submissions")) return ok([]);
    return route.fulfill({ status: 503, json: { error: "No live service requests in this fixture." } });
  });
  return calls;
}
const schoolPanel = (page: Page) => page.getByRole("region", { name: "School plan", exact: true });
async function openParent(page: Page) {
  await page.goto("/tests/browser/school-context.html?fixture=parent");
  await page.getByRole("button", { name: "School plan", exact: true }).click();
  await expect(page.getByLabel("School context JSON", { exact: true })).toHaveValue(/Example school reference/);
}
const writes = (calls: Array<{ method: string; path: string }>) => calls.filter((call) => call.method === "PUT");

test("private school reference shows source dates, literal times, and verification only in parent records", async ({ page }) => {
  await mockApi(page);
  await openParent(page);
  await page.getByText("View saved school reference", { exact: true }).click();
  const panel = schoolPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Example school reference");
  await expect(panel.locator("time").first()).toHaveText("2026-10-07T14:30:00Z");
  await expect(panel).toContainText("School time zone Not confirmed");
  await expect(panel).toContainText("No automatic school sync");
  await panel.getByText("Schedule, workload & sources", { exact: false }).click();
  await expect(panel).toContainText("Tuesday at 10:15 (as shown in the portal)");
  await expect(panel).toContainText("Time zone: America/Chicago");
  await expect(panel.locator(".school-verification")).toHaveText(["reported", "verified", "unconfirmed"]);
  await expect(panel.getByRole("link", { name: "Example course overview" })).toHaveAttribute("href", "https://example.org/courses");
  await expect(page.getByText("It is not sent to the student workspace or voice tutor.", { exact: false })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Open tutor/ })).toHaveCount(0);
  await panel.screenshot({ path: "test-results/school-plan-parent-desktop.png" });
});

test("student workspace does not request or display any private school context", async ({ page }) => {
  const calls = await mockApi(page, { empty: true });
  await page.goto("/tests/browser/school-context.html");
  await expect(page.getByRole("heading", { name: "Your learning path" })).toBeVisible();
  await expect(schoolPanel(page)).toHaveCount(0);
  await expect(page.getByText("Example school reference")).toHaveCount(0);
  await page.getByLabel("Learning day").fill("2026-09-01");
  await expect(page.getByRole("heading", { name: "Your learning path" })).toBeVisible();
  expect(calls.filter((call) => call.path.includes("school-context"))).toHaveLength(0);
});

test("private parent reference and editor fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openParent(page);
  await page.getByText("View saved school reference", { exact: true }).click();
  await schoolPanel(page).getByText("Schedule, workload & sources", { exact: false }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await schoolPanel(page).screenshot({ path: "test-results/school-plan-parent-mobile.png" });
});

test("parent JSON imports validate locally and require explicit review and confirmation", async ({ page }) => {
  const calls = await mockApi(page);
  await openParent(page);
  const input = page.getByLabel("School context JSON", { exact: true });
  await input.fill("{ broken }");
  await page.getByRole("button", { name: "Validate & review" }).click();
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  await input.fill(JSON.stringify({ ...context, timeZone: "not-a-zone" }));
  await page.getByRole("button", { name: "Validate & review" }).click();
  await expect(page.getByRole("alert")).toContainText("timeZone");
  expect(writes(calls)).toHaveLength(0);
  const updated = { ...context, summary: "Updated generic course focus." };
  await page.getByLabel("Import JSON from this device").setInputFiles({ name: "generic-context.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(updated)) });
  await expect(input).toHaveValue(/Updated generic course focus/);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "School plan", exact: true }).click();
  await expect(input).toHaveValue(/Updated generic course focus/);
  await page.getByRole("button", { name: "Validate & review" }).click();
  await expect(page.getByRole("group", { name: "Confirm school reference save" })).toBeVisible();
  expect(writes(calls)).toHaveLength(0);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Validate & review" }).click();
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved as revision 4");
  expect(writes(calls)).toHaveLength(1);
  expect(writes(calls)[0]).toMatchObject({ path: "/api/parent/school-context", body: { expectedRevision: 3, context: updated } });
  await expect(page.getByRole("button", { name: "Validate & review" })).toBeDisabled();
});

test("revision conflict preserves draft and requires latest revision before a new save", async ({ page }) => {
  const calls = await mockApi(page, { conflict: true });
  await openParent(page);
  const input = page.getByLabel("School context JSON", { exact: true });
  await input.fill(JSON.stringify({ ...context, summary: "My unsaved change." }));
  await page.getByRole("button", { name: "Validate & review" }).click();
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("newer revision");
  await expect(input).toHaveValue(/My unsaved change/);
  await expect(page.getByRole("button", { name: "Validate & review" })).toBeDisabled();
  await page.getByRole("button", { name: "Load latest saved version" }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(input).toHaveValue(/My unsaved change/);
  await page.getByRole("button", { name: "Load latest saved version" }).click();
  await page.getByRole("button", { name: "Replace draft with saved version" }).click();
  await expect(input).toHaveValue(/A newer saved reference/);
  await input.fill(JSON.stringify({ ...context, summary: "Merged change." }));
  await page.getByRole("button", { name: "Validate & review" }).click();
  await page.getByRole("button", { name: "Confirm save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved as revision 5");
  expect(writes(calls)).toHaveLength(2);
  expect(writes(calls)[1]).toMatchObject({ body: { expectedRevision: 4 } });
});

test("parent authentication remains required before reading school context", async ({ page }) => {
  const calls = await mockApi(page, { authenticated: false });
  await page.goto("/tests/browser/school-context.html?fixture=parent");
  await expect(page.getByRole("button", { name: "Open parent dashboard" })).toBeVisible();
  expect(calls.some((call) => call.path === "/api/parent/school-context")).toBe(false);
  await page.getByLabel("Parent access code").fill("1234");
  await page.getByRole("button", { name: "Open parent dashboard" }).click();
  await page.getByRole("button", { name: "School plan", exact: true }).click();
  await expect(page.getByLabel("School context JSON", { exact: true })).toHaveValue(/Example school reference/);
  expect(writes(calls)).toHaveLength(0);
});

test("a failed initial read cannot save or silently replace a local draft", async ({ page }) => {
  const calls = await mockApi(page, { failSchool: true });
  await page.goto("/tests/browser/school-context.html?fixture=parent");
  await page.getByRole("button", { name: "School plan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not load");
  const input = page.getByLabel("School context JSON", { exact: true });
  await input.fill(JSON.stringify(context));
  await expect(page.getByRole("button", { name: "Validate & review" })).toBeDisabled();
  await page.getByRole("button", { name: "Reload saved version" }).click();
  await expect(page.getByRole("group", { name: "Replace unsaved draft" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(input).toHaveValue(JSON.stringify(context));
  await page.getByRole("button", { name: "Reload saved version" }).click();
  await page.getByRole("button", { name: "Replace draft with saved version" }).click();
  await expect(page.getByText("Saved revision 3", { exact: false })).toBeVisible();
  expect(writes(calls)).toHaveLength(0);
});

test("repeated confirmation creates only one write and reloading dismisses review", async ({ page }) => {
  const calls = await mockApi(page);
  await openParent(page);
  const input = page.getByLabel("School context JSON", { exact: true });
  await input.fill(JSON.stringify({ ...context, summary: "A generic update." }));
  await page.getByRole("button", { name: "Validate & review" }).click();
  await page.getByRole("button", { name: "Reload saved version" }).click();
  await expect(page.getByRole("button", { name: "Confirm save", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("button", { name: "Validate & review" }).click();
  await page.getByRole("button", { name: "Confirm save", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("status")).toContainText("saved as revision 4");
  expect(writes(calls)).toHaveLength(1);
});
