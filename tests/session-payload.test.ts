import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSessionPayload,
  type TranscriptLine,
} from "../client/src/voice/sessionPayload.js";
import { EndSessionSchema } from "../shared/schemas/api.js";

describe("voice session persistence", () => {
  it("saves long multilingual conversations under the HTTP body limit with newest context intact", () => {
    const lines: TranscriptLine[] = Array.from({ length: 600 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      text: `${index}: ${"光と分数 🌎 ".repeat(2000)}`,
      timestamp: new Date().toISOString(),
    }));
    const payload = createSessionPayload("session", "Science", lines);
    assert.ok(Buffer.byteLength(JSON.stringify(payload), "utf8") < 100_000);
    assert.ok(EndSessionSchema.safeParse(payload).success);
    assert.ok(payload.transcript.at(-1)?.text.startsWith("599:"));
    assert.equal(lines.length, 600);
  });
  it("provides a useful summary for a session with no transcribed speech", () => {
    const payload = createSessionPayload("session", "Light reflection", []);
    assert.equal(payload.summary, "Voice session for Light reflection");
    assert.deepEqual(payload.transcript, []);
  });
});
