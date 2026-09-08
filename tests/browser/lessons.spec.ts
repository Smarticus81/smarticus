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
async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === "/api/schedule/today")
      data = days.find((day) => day.date === url.searchParams.get("date")) ?? {
        ...latest,
        lessons: [],
      };
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
    else if (url.pathname === "/api/lessons/select")
      data = all.find(
        (lesson) => lesson.id === route.request().postDataJSON().lesson_id,
      );
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
}
async function section(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

for (const day of days) {
  test(`all sections preserve the ${day.date} curriculum`, async ({ page }) => {
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
      if (width < 950)
        await expect(
          page.getByRole("button", { name: "Virgil is here" }),
        ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${lesson.subject}-${width}.png`),
        fullPage: true,
      });
    }
  });

test("Virgil follows output energy, pauses, and disconnects without microphone input", async ({
  page,
}) => {
  await page.goto("/tests/browser/index.html?fixture=avatar");
  const mouth = page.getByTestId("virgil-mouth");
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  await expect
    .poll(async () => Number(await mouth.getAttribute("ry")))
    .toBeGreaterThan(5);
  await page
    .getByRole("button", { name: "Silence output", exact: true })
    .click();
  await expect
    .poll(async () => Number(await mouth.getAttribute("ry")))
    .toBeLessThan(2);
  await page
    .getByRole("button", { name: "Resume output", exact: true })
    .click();
  await expect
    .poll(async () => Number(await mouth.getAttribute("ry")))
    .toBeGreaterThan(5);
  await page
    .getByRole("button", { name: "Disconnect output", exact: true })
    .click();
  await expect
    .poll(async () => Number(await mouth.getAttribute("ry")))
    .toBeLessThan(2);
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  await expect
    .poll(async () => Number(await mouth.getAttribute("ry")))
    .toBeGreaterThan(5);
});
test("reduced motion keeps the avatar still while preserving connected state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/browser/index.html?fixture=avatar");
  await page.getByRole("button", { name: "Start output", exact: true }).click();
  await expect(page.getByTestId("virgil-avatar")).toHaveClass(
    /avatar-speaking/,
  );
  await expect(page.getByTestId("virgil-mouth")).toHaveAttribute("ry", "1.6");
});

test("Virgil’s mouth follows a spoken sentence and settles in its pauses", async ({
  page,
}) => {
  await page.goto("/tests/browser/index.html?fixture=avatar");
  await page
    .getByRole("button", { name: "Play speech sample", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play speech sample", exact: true }),
  ).toBeDisabled();
  const samples = await page.evaluate(async () => {
    const values: Array<{ energy: number; mouth: number }> = [];
    for (let i = 0; i < 180; i++) {
      values.push({
        energy: Number(
          document.querySelector('[data-testid="source-energy"]')!.textContent,
        ),
        mouth: Number(
          document
            .querySelector('[data-testid="virgil-mouth"]')!
            .getAttribute("ry"),
        ),
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return values;
  });
  const voiced = samples.filter((s) => s.energy > 0.35);
  const quiet = samples.filter(
    (s, i) =>
      i > 3 &&
      s.energy === 0 &&
      samples.slice(i - 3, i).every((previous) => previous.energy === 0),
  );
  expect(voiced.length).toBeGreaterThan(15);
  expect(quiet.length).toBeGreaterThan(15);
  expect(
    voiced.filter((s) => s.mouth > 3).length / voiced.length,
  ).toBeGreaterThan(0.8);
  expect(
    quiet.filter((s) => s.mouth < 2.5).length / quiet.length,
  ).toBeGreaterThan(0.9);
  await page
    .getByRole("button", { name: "Disconnect output", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("virgil-mouth").getAttribute("ry")),
    )
    .toBeLessThan(2);
});
