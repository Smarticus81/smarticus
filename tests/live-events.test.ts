import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsGoodbye,
  containsWakeWord,
  functionCallFromEvent,
  responseFinishedFromEvent,
  serializeToolOutput,
  stateNote,
  ToolTurnTracker,
  TranscriptAccumulator,
  wakeGreetingCommentary,
  withToolTimeout,
} from "../client/src/voice/liveEvents.js";

describe("wake word and farewell detection", () => {
  it("hears the wake word inside a sentence and tolerates transcription spellings", () => {
    assert.equal(containsWakeWord("Hey Virgil, what's a ratio?"), true);
    assert.equal(containsWakeWord("vergil are you there"), true);
    assert.equal(containsWakeWord("the virgin islands"), false);
    assert.equal(containsWakeWord("I like turtles"), false);
  });
  it("recognizes clear farewells only", () => {
    assert.equal(containsGoodbye("okay bye Virgil"), true);
    assert.equal(containsGoodbye("that's all for today"), true);
    assert.equal(containsGoodbye("by the way"), false);
  });
  it("asks for an immediate greeting and documents the standby state", () => {
    assert.match(wakeGreetingCommentary("Atticus"), /right now/);
    assert.match(stateNote(false), /standby/i);
    assert.match(stateNote(true), /awake/i);
  });
});

describe("delegated function calls", () => {
  const callEvent = {
    type: "response.event",
    delegation_id: "dlg_1",
    event: {
      type: "response.output_item.done",
      response: { id: "resp_1" },
      item: { type: "function_call", call_id: "call_1", name: "look_at_screen", arguments: "{\"reason\":null}" },
    },
  };
  it("extracts function calls from nested Responses events", () => {
    assert.deepEqual(functionCallFromEvent(callEvent), {
      callId: "call_1",
      name: "look_at_screen",
      arguments: "{\"reason\":null}",
      delegationId: "dlg_1",
      responseId: "resp_1",
    });
    assert.equal(functionCallFromEvent({ type: "response.event", event: { type: "response.output_text.delta" } }), null);
    assert.equal(functionCallFromEvent({ type: "session.output_transcript.delta" }), null);
  });
  it("detects the end of a delegated response", () => {
    assert.deepEqual(
      responseFinishedFromEvent({ type: "response.event", delegation_id: "dlg_1", event: { type: "response.completed", response: { status: "completed" } } }),
      { delegationId: "dlg_1", status: "completed" },
    );
    assert.equal(responseFinishedFromEvent(callEvent), null);
  });
  it("continues a response exactly once after all its calls are answered", () => {
    const tracker = new ToolTurnTracker();
    const first = functionCallFromEvent(callEvent)!;
    const second = { ...first, callId: "call_2" };
    assert.equal(tracker.begin(first), true);
    assert.equal(tracker.begin(first), false, "duplicate calls are ignored");
    assert.equal(tracker.begin(second), true);
    assert.equal(tracker.finish("dlg_1"), false, "still waiting on outputs");
    assert.equal(tracker.complete(first), false);
    assert.equal(tracker.complete(second), true, "last output continues the response");
    assert.equal(tracker.finish("dlg_1"), false, "no second continuation");
  });
  it("waits for the response stream to end when outputs arrive first", () => {
    const tracker = new ToolTurnTracker();
    const call = functionCallFromEvent(callEvent)!;
    tracker.begin(call);
    assert.equal(tracker.complete(call), false);
    assert.equal(tracker.finish("dlg_1"), true);
  });
  it("keeps waiting when another call starts after an early output", () => {
    const tracker = new ToolTurnTracker();
    const first = functionCallFromEvent(callEvent)!;
    const second = { ...first, callId: "call_2" };
    assert.equal(tracker.begin(first), true);
    assert.equal(tracker.complete(first), false, "the stream has not ended yet");
    assert.equal(tracker.begin(second), true, "the same response emitted another call");
    assert.equal(tracker.busy, true);
    assert.equal(tracker.finish("dlg_1"), false, "call_2 still owes an output");
    assert.equal(tracker.complete(second), true, "continue once every output is sent");
    assert.equal(tracker.busy, false);
  });
  it("never runs or re-answers a call it already handled", () => {
    const tracker = new ToolTurnTracker();
    const call = functionCallFromEvent(callEvent)!;
    tracker.begin(call);
    tracker.complete(call);
    tracker.finish("dlg_1");
    assert.equal(tracker.begin(call), false, "a repeated event is ignored");
    assert.equal(tracker.busy, false);
  });
  it("does not continue a response whose output could not be sent", () => {
    const tracker = new ToolTurnTracker();
    const first = functionCallFromEvent(callEvent)!;
    const second = { ...first, callId: "call_2" };
    tracker.begin(first);
    tracker.begin(second);
    tracker.finish("dlg_1");
    assert.equal(tracker.complete(first, false), false);
    assert.equal(tracker.complete(second), false, "the backend is missing an output");
  });
  it("forgets turn state after a protocol error so the next turn is clean", () => {
    const tracker = new ToolTurnTracker();
    const call = functionCallFromEvent(callEvent)!;
    tracker.begin(call);
    assert.equal(tracker.busy, true);
    tracker.reset();
    assert.equal(tracker.busy, false);
    assert.equal(tracker.finish("dlg_1"), false);
  });
  it("fails a stalled tool instead of leaving the backend waiting", async () => {
    await assert.rejects(
      withToolTimeout(new Promise(() => {}), "look_at_screen", 10),
      /look_at_screen did not finish/,
    );
    assert.equal(await withToolTimeout(Promise.resolve("ok"), "navigate_lesson", 1_000), "ok");
  });
});

describe("tool output serialization", () => {
  it("returns plain text for ordinary results and attaches images when provided", () => {
    assert.equal(serializeToolOutput({ ok: true }), "{\"ok\":true}");
    const rich = serializeToolOutput({ output: { board: "empty" }, images: ["data:image/png;base64,AAAA"] });
    assert.ok(Array.isArray(rich));
    assert.equal(rich[0].type, "input_text");
    assert.equal(rich[1].type, "input_image");
  });
  it("truncates very large outputs", () => {
    const text = serializeToolOutput("x".repeat(30_000)) as string;
    assert.ok(text.length < 25_000);
    assert.match(text, /truncated/);
  });
});

describe("transcript accumulation", () => {
  it("joins fragments and closes utterances on silence gaps", () => {
    const transcript = new TranscriptAccumulator(1_000);
    assert.equal(transcript.push("Hey", 0, 200), null);
    assert.equal(transcript.push("Virgil", 250, 500), null);
    assert.equal(transcript.push(",", 500, 520), null);
    assert.equal(transcript.text, "Hey Virgil,");
    const closed = transcript.push("what", 2_000, 2_200);
    assert.deepEqual(closed, { text: "Hey Virgil,", startMs: 0, endMs: 520 });
    assert.equal(transcript.text, "what");
    assert.deepEqual(transcript.flush(), { text: "what", startMs: 2_000, endMs: 2_200 });
    assert.equal(transcript.flush(), null);
  });
});
