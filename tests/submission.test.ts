import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubmitLessonWorkSchema } from "../shared/schemas/api.js";

const answer = {
  item_id: "math-i2",
  section: "independent_practice" as const,
  prompt: "Find 18% of 250.",
  answer: "45, because 10% is 25 and 8% is 20.",
};
const photo = `data:image/jpeg;base64,${"A".repeat(64)}`;

describe("handing work in", () => {
  it("accepts typed answers from the platform", () => {
    const parsed = SubmitLessonWorkSchema.parse({
      lesson_id: "2026-09-18-mathematics",
      mode: "platform",
      answers: [answer],
      photos: [],
    });
    assert.equal(parsed.mode, "platform");
    assert.equal(parsed.answers[0].answer, answer.answer);
  });

  it("accepts a photograph of paper with no typed answers at all", () => {
    // Most of a school day happens on paper; a submission of a page is whole
    // on its own and must not require the keyboard boxes to be filled too.
    const parsed = SubmitLessonWorkSchema.parse({
      lesson_id: "2026-09-18-mathematics",
      mode: "paper",
      answers: [],
      photos: [photo],
    });
    assert.equal(parsed.mode, "paper");
    assert.equal(parsed.photos.length, 1);
  });

  it("refuses an empty hand-in", () => {
    // Blank answers and no photograph is not finished work, and recording it as
    // finished would be a lie told about a child's day.
    assert.throws(
      () =>
        SubmitLessonWorkSchema.parse({
          lesson_id: "2026-09-18-mathematics",
          mode: "platform",
          answers: [{ ...answer, answer: "   " }],
          photos: [],
        }),
      /Nothing to hand in yet/,
    );
  });

  it("rejects anything that is not an image for a photo", () => {
    for (const bad of ["https://example.org/page.jpg", "data:text/html,<script>", "not a url"]) {
      assert.throws(
        () =>
          SubmitLessonWorkSchema.parse({
            lesson_id: "l1",
            mode: "paper",
            answers: [],
            photos: [bad],
          }),
        /Expected an image data URL/,
        `${bad} should not be accepted`,
      );
    }
  });

  it("defaults photos to none and rejects unknown fields", () => {
    const parsed = SubmitLessonWorkSchema.parse({
      lesson_id: "l1",
      mode: "platform",
      answers: [answer],
    });
    assert.deepEqual(parsed.photos, []);
    assert.throws(() =>
      SubmitLessonWorkSchema.parse({
        lesson_id: "l1",
        mode: "platform",
        answers: [answer],
        score: 10,
      }),
    );
  });
});
