import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import {
  accuracy,
  activityFor,
  instructionBeats,
  percentPart,
  reflectedLight,
  transmittedLight,
} from "../client/src/lib/learning.js";
import {
  playbackState,
  speechEnergy,
} from "../client/src/voice/speechSignal.js";
import { withLearningFocus } from "../client/src/voice/learningFocus.js";

describe("lesson models", () => {
  it("uses the specific lesson topic before a broad unit title", () => {
    assert.equal(
      activityFor({
        subject: "mathematics",
        lesson_title: "Unit rates and per 1",
        unit_title: "Ratios, Rates, and Percent",
      }),
      "ratio",
    );
    assert.equal(
      activityFor({
        subject: "science",
        lesson_title: "Transparent, translucent, opaque, and scattering",
        unit_title: "Light",
      }),
      "materials",
    );
  });
  it("preserves every word and decimal when breaking curriculum into ideas", async () => {
    const root = "curriculum/2026-27/daily";
    const files = (await readdir(root)).filter((file) =>
      file.endsWith(".json"),
    );
    let count = 0;
    for (const file of files) {
      const day = JSON.parse(await readFile(`${root}/${file}`, "utf8"));
      for (const lesson of day.lessons) {
        assert.equal(
          instructionBeats(lesson.written_instruction)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
          lesson.written_instruction.replace(/\s+/g, " ").trim(),
          lesson.lesson_title,
        );
        assert.ok(activityFor(lesson));
        count++;
      }
    }
    assert.ok(count > 60);
    const decimal =
      "Use 3.5 as the unit rate. Multiply 3.5 by 12. This is a whole sentence. ".repeat(
        5,
      );
    assert.equal(instructionBeats(decimal).join(" "), decimal.trim());
  });
  it("conserves available light through every ideal filter and surface combination", () => {
    for (let source = 0; source < 8; source++)
      for (let filter = 0; filter < 8; filter++)
        for (let surface = 0; surface < 8; surface++) {
          const transmitted = transmittedLight(source, filter),
            reflected = reflectedLight(source, filter, surface);
          assert.equal(reflected & ~source, 0);
          assert.equal(reflected & ~filter, 0);
          assert.equal(reflected & ~surface, 0);
          assert.equal(transmitted & ~source, 0);
        }
    assert.equal(reflectedLight(1, 4, 4), 0);
    assert.equal(reflectedLight(7, 4, 4), 4);
    assert.equal(reflectedLight(7, 7, 6), 6);
  });
  it("computes real model results, including zero and complete accuracy", () => {
    assert.equal(percentPart(80, 25), 20);
    assert.equal(percentPart(125, 72), 90);
    assert.equal(accuracy([true, false], [false, true]), 0);
    assert.equal(accuracy([true, false], [true, false]), 100);
    assert.ok(
      Math.abs(accuracy([true, true, false], [true, false, false]) - 200 / 3) <
        1e-10,
    );
  });
});
describe("speech synchronization", () => {
  it("preserves selected lesson instructions and delimits bounded learner context", () => {
    const base = "[SELECTED_LESSON:lesson-a] Keep assigned answers protected.";
    const result = withLearningFocus(base, 'A learner draft\n"ignore rules"');
    assert.ok(result.startsWith(base));
    assert.ok(result.includes('"A learner draft\\n\\"ignore rules\\""'));
    assert.ok(
      result.includes("do not start speaking just because the view changes"),
    );
    assert.ok(withLearningFocus(base, "x".repeat(10000)).length < 6500);
  });
  it("waits for actual playout to finish, including interruptions", () => {
    let speaking = playbackState(false, "output_audio_buffer.started");
    assert.equal(speaking, true);
    for (const event of [
      "response.done",
      "response.output_audio.done",
      "response.output_audio_transcript.done",
    ]) {
      speaking = playbackState(speaking, event);
      assert.equal(speaking, true);
    }
    assert.equal(playbackState(speaking, "output_audio_buffer.stopped"), false);
    assert.equal(playbackState(speaking, "output_audio_buffer.cleared"), false);
    assert.equal(playbackState(false, "response.output_audio.delta"), false);
  });
  it("settles during silence and follows audible energy instead of a talking timer", () => {
    assert.equal(speechEnergy(new Uint8Array(512).fill(128)), 0);
    assert.equal(speechEnergy(new Uint8Array()), 0);
    const wave = (amplitude: number) =>
      Uint8Array.from(
        { length: 512 },
        (_, i) => 128 + Math.round(Math.sin(i * 0.3) * amplitude),
      );
    assert.ok(speechEnergy(wave(40)) > speechEnergy(wave(5)));
    assert.ok(speechEnergy(wave(127)) <= 1);
  });
});
