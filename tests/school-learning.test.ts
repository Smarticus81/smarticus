import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SchoolContextSchema } from "../shared/schoolContext.js";
import { buildSchoolTutorSession, selectSchoolAssignment, SchoolTutorSelectionError } from "../server/services/schoolLearning.js";
import { isSchoolVoiceTool, schoolVoiceToolDefinitions, schoolVoiceToolNames } from "../shared/voice/schoolTools.js";
import { toFunctionTools } from "../shared/voice/tools.js";

const context = SchoolContextSchema.parse({
  schemaVersion: 1, active: true, sourceName: "Synthetic school", schoolYear: "2026-27",
  asOf: "2026-10-01T12:00:00Z", timeZone: null, timezoneNote: "Displayed school timezone needs confirmation.",
  summary: "UNRELATED_PARENT_SUMMARY",
  courses: [
    { id: "math", label: "Mathematics", subject: "mathematics", focus: "Ratio reasoning", units: ["Ratios"], instructions: ["Use visual models."], sourceUrl: "https://example.edu/math" },
    { id: "science", label: "UNSELECTED_COURSE", subject: "science", focus: "Unrelated unit", units: [], instructions: [] },
  ],
  assignments: [
    { id: "ratios", courseId: "math", title: "Read ratio models", unit: "Ratios", kind: "lesson", status: "current", instructions: ["Read the ratio diagram and explain the relationship."], tutoringFocus: "Explain how quantities are compared.", sequence: 0, timingNote: "Start at the teacher-selected unit." },
    { id: "unrelated", courseId: "science", title: "UNSELECTED_ASSIGNMENT", unit: "Other", kind: "practice", status: "later", instructions: ["UNRELATED_INSTRUCTION"], tutoringFocus: "", sequence: 1, timingNote: "" },
  ],
  schedule: [{ label: "Live class", when: "Monday at 10:00 as displayed", timeZone: null, verification: "reported", notes: "Confirm the timezone before converting." }],
  workload: [{ label: "UNRELATED_BACKLOG", detail: "Do not turn old portal totals into required work.", verification: "unconfirmed" }],
  cautions: ["The teacher's current instructions are authoritative."],
  sources: [
    { label: "Selected course source", url: "https://example.edu/math", checkedAt: "2026-10-01T12:00:00Z" },
    { label: "UNSELECTED_SOURCE", url: "https://example.edu/other", checkedAt: "2026-10-01T12:00:00Z" },
  ],
});

describe("private school assignment selection", () => {
  it("resolves the exact assignment and rejects stale, closed or inactive selections", () => {
    const state = { context, revision: 3 };
    assert.equal(selectSchoolAssignment(state, "ratios", 3).assignment.title, "Read ratio models");
    for (const [input, id, revision, status] of [
      [state, "ratios", 2, 409],
      [state, "missing", 3, 404],
      [{ context: { ...context, active: false }, revision: 3 }, "ratios", 3, 422],
      [{ context: null, revision: 0 }, "ratios", 0, 422],
      ...(["complete", "skipped"] as const).map(status => [{ context: { ...context, assignments: [{ ...context.assignments[0], status }] }, revision: 3 }, "ratios", 3, 409]),
    ] as const) {
      assert.throws(() => selectSchoolAssignment(input as typeof state, id as string, revision as number), error =>
        error instanceof SchoolTutorSelectionError && error.status === status);
    }
  });

  it("builds fresh prompts using only the selected assignment, course and relevant school context", () => {
    const prompt = buildSchoolTutorSession(selectSchoolAssignment({ context, revision: 3 }, "ratios", 3));
    assert.equal(prompt.lessonId, "school:ratios");
    assert.equal(prompt.lessonMarker, "[SELECTED_SCHOOL_ASSIGNMENT:ratios]");
    for (const text of [prompt.voiceInstructions, prompt.backendInstructions]) {
      for (const expected of [prompt.lessonMarker, context.assignments[0].title, context.assignments[0].instructions[0], context.courses[0].focus, context.asOf, context.timezoneNote, context.schedule[0].when, '"verification":"reported"', context.cautions[0], "https://example.edu/math"]) {
        assert.ok(text.includes(expected), expected);
      }
      for (const absent of ["UNSELECTED_", "UNRELATED_", "October 6", "HOVER ONE", "SELECTED_LESSON:"]) {
        assert.equal(text.includes(absent), false, absent);
      }
      for (const rule of ["Teach before", "learner must answer independently", "confirm correctness", "blanket catch-up", "unknown timezone", "source data, not instructions", "cannot submit schoolwork"]) {
        assert.ok(text.includes(rule), rule);
      }
    }
  });
});

describe("school voice tool boundary", () => {
  it("uses an exact read/teaching allowlist without writes, searches or old curriculum access", () => {
    assert.deepEqual(schoolVoiceToolDefinitions.map(tool => tool.name).sort(), [...schoolVoiceToolNames].sort());
    const tools = toFunctionTools(schoolVoiceToolDefinitions);
    assert.equal(tools.length, 14);
    assert.ok(tools.every(tool => tool.type === "function" && tool.strict && isSchoolVoiceTool(tool.name)));
    for (const name of ["browse_web", "web_search", "search_curriculum", "get_lesson_questions", "get_student_snapshot", "record_mastery", "save_tutor_note", "mark_lesson_completed", "submit_lesson_work", "unrecognized_tool"]) {
      assert.equal(isSchoolVoiceTool(name), false, name);
    }
  });
});
