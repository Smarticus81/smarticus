import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStep, WhiteboardDrawSchema, WhiteboardStepSchema } from "../shared/voice/whiteboard.js";
import {
  advanceQueue,
  opProgress,
  simplifyStroke,
  stepDuration,
  summarizeBoard,
  type BoardOp,
} from "../client/src/voice/whiteboardEngine.js";

const text = { kind: "text", x: 40, y: 60, text: "3 out of 4", size: 32, color: null } as const;
const bar = { kind: "fraction_bar", x: 40, y: 120, w: 600, h: 60, parts: 4, shaded: 3, label: null, color: "#2f6fd6" } as const;

describe("whiteboard step schema", () => {
  it("accepts a valid multi-step drawing and rejects malformed steps", () => {
    const parsed = WhiteboardDrawSchema.safeParse({ steps: [text, bar], clear_first: true, caption: "Three quarters" });
    assert.equal(parsed.success, true);
    assert.equal(WhiteboardStepSchema.safeParse({ kind: "text", x: 1, y: 1 }).success, false);
    assert.equal(WhiteboardStepSchema.safeParse({ kind: "path", points: [1, 2], closed: null, width: null, color: null }).success, false);
    assert.equal(WhiteboardStepSchema.safeParse({ kind: "rect", x: 0, y: 0, w: 10, h: 10, label: null, fill: null, color: null, extra: 1 }).success, false);
  });
  it("describes steps for the transcript and the reasoning model", () => {
    assert.equal(describeStep(text), 'text "3 out of 4" at (40, 60)');
    assert.equal(describeStep(bar), "fraction bar 3/4");
  });
});

describe("whiteboard animation", () => {
  it("gives longer text more writing time and pauses exactly their duration", () => {
    assert.ok(stepDuration({ ...text, text: "a much longer sentence to write" }) > stepDuration(text));
    assert.equal(stepDuration({ kind: "pause", ms: 700 }), 700);
    assert.ok(stepDuration(bar, 2) < stepDuration(bar, 1), "speed shortens the animation");
  });
  it("starts queued ops one after another", () => {
    const ops: BoardOp[] = [
      { id: 1, author: "virgil", step: text, startedAt: null, duration: 1_000 },
      { id: 2, author: "virgil", step: bar, startedAt: null, duration: 500 },
    ];
    assert.equal(advanceQueue(ops, 0), true);
    assert.equal(ops[0].startedAt, 0);
    assert.equal(ops[1].startedAt, null, "second op waits for the first");
    assert.equal(opProgress(ops[0], 500), 0.5);
    assert.equal(advanceQueue(ops, 500), false);
    assert.equal(advanceQueue(ops, 1_000), true);
    assert.equal(ops[1].startedAt, 1_000);
    assert.equal(opProgress(ops[1], 1_500), 1);
    assert.equal(opProgress({ ...ops[1], duration: 0 }, 1_000), 1, "instant ops render fully");
  });
  it("summarizes who drew what", () => {
    const summary = summarizeBoard([
      { id: 1, author: "virgil", step: text, startedAt: 0, duration: 0 },
      { id: 2, author: "student", step: { kind: "path", points: [0, 0, 10, 10, 20, 0], closed: false, width: 4, color: "#000" }, startedAt: 0, duration: 0 },
    ]);
    assert.match(summary, /1\. Virgil drew text/);
    assert.match(summary, /2\. Atticus drew freehand path with 3 points/);
    assert.equal(summarizeBoard([]), "The whiteboard is empty.");
  });
  it("simplifies dense strokes while keeping the end point", () => {
    const dense = [0, 0, 0.2, 0.1, 0.4, 0.2, 5, 5, 5.1, 5.1, 10, 10];
    const simplified = simplifyStroke(dense, 1);
    assert.deepEqual(simplified, [0, 0, 5, 5, 10, 10]);
  });
});
