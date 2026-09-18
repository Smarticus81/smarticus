import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import type { LessonView, ScheduleView } from "../../client/src/lib/types";

const days: ScheduleView[] = readdirSync("curriculum/2026-27/daily")
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    const day = JSON.parse(
      readFileSync(`curriculum/2026-27/daily/${file}`, "utf8"),
    );
    return {
      ...day,
      lessons: day.lessons.map((lesson: LessonView) => ({
        ...lesson,
        status: "planned",
        answer_key: {},
        teacher_notes: "",
        guided_practice: lesson.guided_practice.map(({ id, prompt, hint }) => ({
          id,
          prompt,
          hint,
        })),
        independent_practice: lesson.independent_practice.map(
          ({ id, prompt, hint }) => ({ id, prompt, hint }),
        ),
        exit_ticket: lesson.exit_ticket.map(({ id, prompt }) => ({
          id,
          prompt,
        })),
      })),
    };
  });
const all = days.flatMap((day) => day.lessons);
const latest = days.find((day) => day.date === "2026-09-08")!;
/**
 * Serve the mocked API.
 *
 * `only` pins a single curriculum file as the day. Several files share a date —
 * a combined day plus per-topic additions, some carrying the same lesson id — so
 * resolving a date across all of them serves one file's lessons to every test
 * for that date. The rest then waited the full timeout for a lesson button that
 * was never going to render, which is most of the suite's running time.
 */
async function mockApi(page: Page, only?: ScheduleView) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === "/api/schedule/today") {
      const date = url.searchParams.get("date");
      data = (only?.date === date ? only : days.find((day) => day.date === date)) ?? {
        ...latest,
        lessons: [],
      };
    }
    else if (url.pathname === "/api/schedule/dates")
      data = days.map((day) => day.date);
    else if (url.pathname === "/api/student/snapshot")
      data = {
        student: {
          id: "test-atticus",
          preferredName: "Atticus",
          gradeLevel: 6,
        },
        mastery: [],
        recentSessions: [],
        attendance: [],
      };
    else if (url.pathname === "/api/lessons/select") {
      const id = route.request().postDataJSON().lesson_id;
      // The pinned file wins: ids repeat across files that share a date.
      data = only?.lessons.find((lesson) => lesson.id === id) ?? all.find((lesson) => lesson.id === id);
    }
    else if (url.pathname.includes("answer-support"))
      data = {
        hint: "Label the known quantities and decide what you need to find.",
        answerWithheld: true,
      };
    else if (url.pathname === "/api/tools/lesson-completed")
      data = { completed: true };
    else
      return route.fulfill({
        status: 503,
        json: { error: "No live AI or database calls in browser checks." },
      });
    await route.fulfill({ json: data });
  });
}
async function openLesson(page: Page, lesson: LessonView) {
  await page.goto(`/tests/browser/index.html?date=${lesson.date}&view=today`);
  await page
    .getByRole("button")
    .filter({ hasText: lesson.lesson_title })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: lesson.lesson_title, exact: true }),
  ).toBeVisible();
  // The studio opens on Virgil and the board. The lesson text, its sections and
  // the practice questions are behind the Lesson menu, so these checks open it.
  await openLessonMenu(page);
}
async function openLessonMenu(page: Page) {
  const toggle = page.getByRole("button", { name: "Lesson", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator("#lesson-menu")).toBeVisible();
}
async function section(page: Page, name: string) {
  await openLessonMenu(page);
  await page.getByRole("button", { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

for (const [dayIndex, day] of days.entries()) {
  // Several curriculum files can share a date, so include the position to keep titles unique.
  test(`all sections preserve the ${day.date} curriculum (file ${dayIndex + 1})`, async ({ page }) => {
    // A later route wins in Playwright, so this pins the day for this test only.
    await mockApi(page, day);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const lesson of day.lessons) {
      await openLesson(page, lesson);
      await expect(
        page.getByText(lesson.learning_objectives[0], { exact: true }).first(),
      ).toBeVisible();
      await section(page, "02 Explore");
      await expect(
        page.getByRole("heading", { name: "What happens if…", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".model-card, .experiment").first(),
      ).toBeVisible();
      await section(page, "03 Practice");
      const first =
        lesson.guided_practice[0] ??
        lesson.independent_practice[0] ??
        lesson.exit_ticket[0];
      if (first)
        await expect(
          page.getByRole("heading", { name: first.prompt, exact: true }),
        ).toBeVisible();
      await section(page, "04 Words");
      if (lesson.vocabulary[0])
        await expect(page.locator(".recall-card strong")).toHaveText(
          lesson.vocabulary[0].term,
        );
      await section(page, "05 Reflect");
      await expect(
        page.getByRole("heading", { name: "What makes sense now?" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Mark lesson complete", exact: true }),
      ).toBeEnabled();
    }
    expect(errors).toEqual([]);
  });
}

test("percent controls and generated check calculate the current relationship", async ({
  page,
}) => {
  await openLesson(
    page,
    latest.lessons.find((l) => l.subject === "mathematics")!,
  );
  await section(page, "02 Explore");
  await page.getByRole("slider", { name: "Whole", exact: true }).press("Home");
  await page.getByRole("slider", { name: "Percent", exact: true }).press("End");
  await expect(
    page.getByRole("img", {
      name: "100 of 100 tiles selected; 100% of 20 is 20",
    }),
  ).toBeVisible();
  await page.getByText("Try finding a missing number", { exact: true }).click();
  await page.getByRole("textbox", { name: "Your missing number" }).fill("20");
  await page.getByRole("button", { name: "Check my thinking" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "That fits the relationship" }),
  ).toBeVisible();
});
test("color model rejects unavailable wavelengths and explains the result", async ({
  page,
}) => {
  await openLesson(
    page,
    latest.lessons.find((l) => l.subject === "science")!,
  );
  await section(page, "02 Explore");
  await page
    .getByRole("group", { name: "Light source", exact: true })
    .getByRole("button", { name: "Blue", exact: true })
    .click();
  await page
    .getByRole("group", { name: "I predict the object will look…" })
    .getByRole("button", { name: "Dark", exact: true })
    .click();
  await page.getByRole("button", { name: "Send the light" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your prediction fits. The object appears dark." }),
  ).toBeVisible();
});
test("French tiles can be built, checked, returned, and reset", async ({
  page,
}) => {
  await openLesson(
    page,
    latest.lessons.find((l) => l.subject === "french")!,
  );
  await section(page, "02 Explore");
  for (const word of ["J’", "ai", "un", "livre."])
    await page.getByRole("button", { name: word, exact: true }).click();
  await page.getByRole("button", { name: "Check the sentence" }).click();
  await expect(page.locator(".assembled-sentence")).toHaveText(
    "J’ai un livre.",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "That’s it." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove ai", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check the sentence" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(page.locator(".sentence-tray")).toContainText(
    "Your sentence grows here",
  );
});
test("practice drafts and journal survive navigation and reload, with lesson-specific keys", async ({
  page,
}) => {
  const math = latest.lessons.find((l) => l.subject === "mathematics")!;
  await openLesson(page, math);
  await section(page, "03 Practice");
  const first = page.locator(".focused-question textarea");
  await first.fill("I will identify the whole first.");
  await page
    .getByRole("button", { name: "Next question →", exact: true })
    .click();
  await expect(page.locator(".focused-question textarea")).toHaveValue("");
  await page.getByRole("button", { name: "← Previous", exact: true }).click();
  await expect(first).toHaveValue("I will identify the whole first.");
  await page
    .getByRole("button", { name: "A little nudge", exact: true })
    .click();
  await expect(
    page.getByText(
      "Label the known quantities and decide what you need to find.",
    ),
  ).toBeVisible();
  await section(page, "05 Reflect");
  await page
    .getByRole("textbox", { name: "What are you still wondering?" })
    .fill("Does changing the whole change 1%?");
  await openLesson(page, math);
  await section(page, "03 Practice");
  await expect(first).toHaveValue("I will identify the whole first.");
  await section(page, "05 Reflect");
  await expect(
    page.getByRole("textbox", { name: "What are you still wondering?" }),
  ).toHaveValue("Does changing the whole change 1%?");
  await page
    .getByRole("button", { name: "Mark lesson complete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lesson completed", exact: true }),
  ).toBeDisabled();
});
test("evidence bridge stores the argument and shows the lesson source", async ({
  page,
}) => {
  await openLesson(
    page,
    latest.lessons.find((l) => l.subject === "writing")!,
  );
  await section(page, "02 Explore");
  await page
    .getByRole("textbox", { name: "Your claim", exact: true })
    .fill("The writer supports an idea with a precise detail.");
  await page
    .getByRole("button", { name: "Next connection →", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Evidence from the text", exact: true })
    .fill("A detail and its source.");
  await page
    .getByRole("button", { name: "Next connection →", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "How the evidence supports your claim",
      exact: true,
    })
    .fill("The detail connects to the claim because…");
  await page.getByText("Read your whole argument", { exact: true }).click();
  await expect(page.locator(".argument-preview")).toContainText(
    "The detail connects to the claim because…",
  );
});

test("word recall reveals the definition and retains the learner’s own example", async ({
  page,
}) => {
  const lesson = latest.lessons.find((item) => item.subject === "mathematics")!;
  await openLesson(page, lesson);
  await section(page, "04 Words");
  await page.locator(".recall-card").click();
  await expect(page.locator(".recall-card strong")).toHaveText(
    lesson.vocabulary[0].definition,
  );
  await page
    .getByRole("textbox", { name: "My explanation or example", exact: true })
    .fill("My own example of this word.");
  await page.getByRole("button", { name: "Next word →", exact: true }).click();
  await expect(page.locator(".recall-card strong")).toHaveText(
    lesson.vocabulary[1].term,
  );
  await page
    .getByRole("button", { name: "← Previous word", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "My explanation or example",
      exact: true,
    }),
  ).toHaveValue("My own example of this word.");
  await expect(page.locator(".recall-card strong")).toHaveText(
    lesson.vocabulary[0].term,
  );
});
test("test accuracy stays separate from confidence", async ({ page }) => {
  await openLesson(
    page,
    latest.lessons.find((l) => l.subject === "computer_science")!,
  );
  await section(page, "02 Explore");
  await page.getByRole("button", { name: "Open the test results" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "66.7% accuracy · 4 of 6 correct." }),
  ).toBeVisible();
  await page
    .getByRole("slider", { name: "The classifier’s confidence" })
    .press("End");
  await expect(
    page.getByRole("status").filter({ hasText: "66.7% accuracy" }),
  ).toContainText("Confidence is 100%");
});

for (const width of [1280, 390, 320])
  test(`all latest subjects fit ${width}px and retain reachable tutor controls`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const lesson of latest.lessons) {
      await openLesson(page, lesson);
      await section(page, "02 Explore");
      await expect(page.locator(".model-card")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBeTruthy();
      // Virgil is the stage now rather than a floating button, so what has to
      // stay reachable at phone widths is the tutor panel itself.
      await expect(
        page.getByRole("button", { name: "Talk with Virgil", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${lesson.subject}-${width}.png`),
        fullPage: true,
      });
    }
  });

/**
 * The avatar's face is a three.js scene now, not an SVG.
 *
 * These three checks used to poll a `virgil-mouth` ellipse and read its `ry`.
 * The three.js rewrite removed that element and left the checks behind, so they
 * had been failing against a node that no longer exists. What they were really
 * asserting still matters, so they assert it against what the avatar actually
 * exposes: the analyser energy the scene is driven by, the state class, and
 * whether the picture moves.
 */

async function openAvatarFixture(page: Page) {
  await page.goto("/tests/browser/index.html?fixture=avatar");
  await page.waitForSelector("[data-testid='virgil-avatar']");
  await page.addStyleTag({
    content: ".virgil-avatar{width:360px !important;height:360px !important;}",
  });
}

const energy = (page: Page) =>
  page.evaluate(() =>
    Number(document.querySelector('[data-testid="source-energy"]')!.textContent),
  );

test("Virgil follows output energy, pauses, and disconnects without microphone input", async ({
  page,
}) => {
  await openAvatarFixture(page);
  const avatar = page.getByTestId("virgil-avatar");
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  await expect.poll(() => energy(page)).toBeGreaterThan(0);
  await expect(avatar).toHaveClass(/avatar-speaking/);

  await page.getByRole("button", { name: "Silence output", exact: true }).click();
  await expect.poll(() => energy(page)).toBe(0);
  await expect(avatar).toHaveClass(/avatar-idle/);

  await page.getByRole("button", { name: "Resume output", exact: true }).click();
  await expect.poll(() => energy(page)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Disconnect output", exact: true }).click();
  await expect.poll(() => energy(page)).toBe(0);
  await expect(avatar).toHaveClass(/avatar-idle/);

  // The fixture never opens a microphone, so this whole path is output only.
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  await expect.poll(() => energy(page)).toBeGreaterThan(0);
});

test("reduced motion keeps the avatar still while preserving connected state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAvatarFixture(page);
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  const avatar = page.getByTestId("virgil-avatar");
  // Reduced motion suppresses the scene's idle life — the breathing, the sway,
  // the tassel — and the avatar says so, so the promise is checkable rather
  // than inferred from two WebGL frames that never compare equal.
  await expect(avatar).toHaveAttribute("data-reduced-motion", "true");
  // Speaking is still reported and still driven by real audio; it simply is
  // not decorated with idle movement.
  await expect(avatar).toHaveClass(/avatar-speaking/);
  await expect.poll(() => energy(page)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Silence output", exact: true }).click();
  await expect.poll(() => energy(page)).toBe(0);
  await expect(avatar).toHaveClass(/avatar-idle/);
  await expect(avatar).toHaveAttribute("data-reduced-motion", "true");
});

test("Virgil’s face follows a spoken sentence and settles in its pauses", async ({
  page,
}) => {
  await openAvatarFixture(page);
  await page
    .getByRole("button", { name: "Play speech sample", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play speech sample", exact: true }),
  ).toBeDisabled();
  const samples = await page.evaluate(async () => {
    const values: number[] = [];
    for (let i = 0; i < 180; i++) {
      values.push(
        Number(document.querySelector('[data-testid="source-energy"]')!.textContent),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return values;
  });
  // A real sentence is neither continuous noise nor silence: it has voiced
  // stretches and settled pauses, and the face is driven by both.
  const voiced = samples.filter((value) => value > 0.35);
  const quiet = samples.filter(
    (value, i) =>
      i > 3 && value === 0 && samples.slice(i - 3, i).every((previous) => previous === 0),
  );
  expect(voiced.length).toBeGreaterThan(15);
  expect(quiet.length).toBeGreaterThan(15);

  await page
    .getByRole("button", { name: "Disconnect output", exact: true })
    .click();
  await expect.poll(() => energy(page)).toBe(0);
  await expect(page.getByTestId("virgil-avatar")).toHaveClass(/avatar-idle/);
});
