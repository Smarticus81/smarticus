import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARM_REST,
  ARM_THINK,
  expressionFor,
  mouthForSpeech,
  mouthPath,
  nextBlinkDelay,
  nextSaccade,
  type VirgilState,
} from "../client/src/voice/virgilRig.js";

/*
 * The rules of Virgil's face, without a browser: what each state asks of the
 * brows, eyes, mouth and hands, and how speech and chance shape the rest.
 */

const STATES: VirgilState[] = ["idle", "connecting", "listening", "thinking", "speaking", "muted", "error"];

describe("expressionFor", () => {
  it("gives every state a complete, distinct face", () => {
    const seen = new Set<string>();
    for (const state of STATES) {
      const face = expressionFor(state);
      for (const [key, value] of Object.entries(face)) {
        if (key === "arms") continue;
        assert.equal(typeof value, "number", `${state}.${key}`);
        assert.ok(Number.isFinite(value), `${state}.${key}`);
      }
      seen.add(JSON.stringify(face));
    }
    assert.equal(seen.size, STATES.length, "two states share an expression");
  });

  it("reads the way the state feels", () => {
    const listening = expressionFor("listening");
    assert.ok(listening.browLeftY < 0 && listening.browRightY < 0, "brows up when attentive");
    assert.ok(listening.lid > 1, "eyes a little wider");
    assert.notEqual(listening.tilt, 0, "head cocked");

    const thinking = expressionFor("thinking");
    assert.deepEqual(thinking.arms, ARM_THINK, "hand to chin");
    assert.equal(thinking.thought, 1, "thought bubble shown");
    assert.ok(thinking.browLeftY < thinking.browRightY, "one brow up");
    assert.ok(Math.abs(thinking.gazeX) > 0.3 && thinking.gazeY < 0, "eyes off to one side and up");

    const muted = expressionFor("muted");
    assert.ok(muted.lid < 0.2, "eyes closed while resting");
    assert.ok(muted.smile > 0, "still a kind face");

    const error = expressionFor("error");
    assert.ok(error.smile < 0, "mouth turns down");
    assert.ok(error.browLeftRot > 0 && error.browRightRot < 0, "inner brows up: worried, not angry");
    assert.ok(error.pupil < 1, "pupils shrink");
    assert.equal(error.sweat, 1);
    assert.equal(expressionFor("idle").sweat, 0);
    assert.equal(expressionFor("idle").thought, 0);
    assert.deepEqual(expressionFor("idle").arms, ARM_REST);
  });
});

describe("mouthPath", () => {
  it("is a closed lens that widens and opens with the inputs", () => {
    const closed = mouthPath(160, 174, 0, 0.5);
    assert.match(closed, /^M [\d.]+ [\d.]+ Q .* Z$/);
    const open = mouthPath(160, 174, 1, 0.5);
    const bottom = (d: string) => Math.max(...[...d.matchAll(/Q [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1])));
    assert.ok(bottom(open) > bottom(closed) + 20, "an open mouth drops the lower lip");
    const narrow = mouthPath(160, 174, 0, 0.5, 0.6);
    const left = (d: string) => Number(d.split(" ")[1]);
    assert.ok(left(narrow) > left(closed), "a narrow mouth has corners closer in");
  });

  it("lifts the corners for a smile and drops them for a frown", () => {
    const cornerY = (d: string) => Number(d.split(" ")[2]);
    assert.ok(cornerY(mouthPath(160, 174, 0, 1)) < cornerY(mouthPath(160, 174, 0, 0)));
    assert.ok(cornerY(mouthPath(160, 174, 0, -1)) > cornerY(mouthPath(160, 174, 0, 0)));
  });
});

describe("mouthForSpeech", () => {
  it("stays shut in silence and opens with the envelope", () => {
    assert.deepEqual(mouthForSpeech(0, 1), { open: 0, width: 1 });
    const quiet = mouthForSpeech(0.2, 1);
    const loud = mouthForSpeech(0.9, 1);
    assert.ok(quiet.open > 0 && loud.open > quiet.open);
    assert.ok(loud.open <= 1);
  });

  it("varies the shape over time so syllables are not one flapping jaw", () => {
    const widths = new Set<number>();
    for (let t = 0; t < 2; t += 0.05) widths.add(Math.round(mouthForSpeech(0.6, t).width * 100));
    assert.ok(widths.size > 10);
    for (const width of widths) assert.ok(width >= 70 && width <= 125);
  });
});

describe("timing", () => {
  it("blinks on an irregular clock with the odd double blink", () => {
    assert.equal(nextBlinkDelay(() => 0.05), 0.22);
    const delay = nextBlinkDelay(() => 0.5);
    assert.ok(delay >= 2.2 && delay <= 6.5);
    assert.notEqual(nextBlinkDelay(() => 0.3), nextBlinkDelay(() => 0.9));
  });

  it("wanders the eyes mostly a little, sometimes a lot, never off the face", () => {
    for (let i = 0; i < 200; i++) {
      const look = nextSaccade();
      assert.ok(Math.abs(look.x) <= 0.75 && Math.abs(look.y) <= 0.45);
      assert.ok(look.hold >= 0.8 && look.hold <= 3.2);
    }
    const far = nextSaccade(() => 0.1);
    const near = nextSaccade(() => 0.5);
    assert.ok(Math.hypot(far.x, far.y) > Math.hypot(near.x, near.y));
  });
});
