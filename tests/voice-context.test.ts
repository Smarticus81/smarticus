import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatVoiceContext, type VoiceContextInput } from "../server/services/voiceContext.js";

/**
 * The brief is what the speaking model knows before anyone talks to it. When it
 * held one lesson title, a half-heard sentence could only be answered from that
 * lesson, which is how a session got stuck on mathematics.
 */
const day: VoiceContextInput = {
  studentName: "Atticus",
  gradeLevel: 6,
  date: "2026-09-18",
  selectedLessonId: "math-1",
  lessons: [
    {
      id: "math-1",
      external_id: "2026-09-18-math",
      subject: "mathematics",
      lesson_title: "Equivalent expressions",
      unit_title: "Expressions",
      todays_goal: "Use the distributive property both ways.",
    },
    {
      id: "fr-1",
      external_id: "2026-09-18-french",
      subject: "french",
      lesson_title: "Le passé composé",
      unit_title: null,
      todays_goal: null,
      learning_objectives: [{ text: "Tell a short story about yesterday." }],
    },
    {
      id: "sci-1",
      subject: "science",
      lesson_title: "How cameras focus light",
      todays_goal: "   ",
      learning_objectives: ["Trace a ray through a lens."],
    },
  ],
  feedback: [{ subject: "literature", content: "Every requested component was present this week." }],
  misconceptions: [{ subject: "mathematics", concept: "Estimating before multiplying decimals" }],
  sessions: [
    { subject: "science", lessonTitle: "Light and shadow", summary: "Worked through reflection angles." },
  ],
};

describe("voice context brief", () => {
  it("names every subject scheduled today, not just the open one", () => {
    const { brief, subjects } = formatVoiceContext(day);
    assert.deepEqual(subjects, ["mathematics", "french", "science"]);
    for (const title of ["Equivalent expressions", "Le passé composé", "How cameras focus light"]) {
      assert.ok(brief.includes(title), `${title} is missing from the brief`);
    }
    assert.match(brief, /may switch whenever he likes/);
  });

  it("marks the open lesson as where he is rather than what he may ask about", () => {
    const { brief } = formatVoiceContext(day);
    assert.match(brief, /\[OPEN ON HIS SCREEN\]/);
    assert.match(brief, /not a fence/);
    // Exactly one lesson carries the marker.
    assert.equal(brief.match(/\[OPEN ON HIS SCREEN\]/g)?.length, 1);
  });

  it("falls back to an objective when a lesson has no goal for the day", () => {
    const { brief } = formatVoiceContext(day);
    assert.match(brief, /Goal: Tell a short story about yesterday\./);
    assert.match(brief, /Goal: Trace a ray through a lens\./);
  });

  it("carries the learner's open threads, feedback and recent work as history", () => {
    const { initialItems } = formatVoiceContext(day);
    const text = initialItems.map((item) => item.content[0].text).join("\n");
    assert.match(text, /Estimating before multiplying decimals/);
    assert.match(text, /Every requested component/);
    assert.match(text, /Worked through reflection angles/);
    for (const item of initialItems) {
      assert.equal(item.role, "developer");
      assert.equal(item.content[0].type, "input_text");
      // The Live session caps its seeded history, so every item stays small.
      assert.ok(item.content[0].text.length <= 1_400);
    }
  });

  it("says so plainly when the day is empty instead of inventing a lesson", () => {
    const { brief, initialItems, subjects } = formatVoiceContext({
      ...day,
      lessons: [],
      feedback: [],
      misconceptions: [],
      sessions: [],
    });
    assert.deepEqual(subjects, []);
    assert.match(brief, /Nothing is scheduled today/);
    assert.equal(initialItems.length, 1);
  });
});
