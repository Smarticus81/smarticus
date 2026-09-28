import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  toGeminiFunctionDeclarations,
  voiceToolDefinitions,
} from "../shared/voice/tools.js";
import { ClientFrameSchema } from "../shared/voice/fallbackBridge.js";

/** Everything Gemini's Schema type accepts; anything else fails the declaration. */
const ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "title",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "anyOf",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

function walk(schema: unknown, path: string, visit: (node: Record<string, unknown>, path: string) => void) {
  if (Array.isArray(schema)) {
    schema.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit));
    return;
  }
  if (!schema || typeof schema !== "object") return;
  const node = schema as Record<string, unknown>;
  visit(node, path);
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object") {
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, `${path}.${name}`, visit);
      }
      continue;
    }
    if (key === "items" || key === "anyOf") walk(value, `${path}.${key}`, visit);
  }
}

describe("Gemini fallback tool declarations", () => {
  it("offers the same tool catalog as the paid pipeline", () => {
    const declarations = toGeminiFunctionDeclarations();
    assert.equal(declarations.length, voiceToolDefinitions.length);
    assert.deepEqual(
      declarations.map((declaration) => declaration.name).sort(),
      voiceToolDefinitions.map((definition) => definition.name).sort(),
      "a tool missing here would silently vanish when the fallback takes over",
    );
    for (const declaration of declarations) {
      assert.ok(declaration.description.length > 0, `${declaration.name} needs a description`);
    }
  });

  it("asks for blocking tool calls, which the browser executors assume", () => {
    // Gemini 3.8 Live defaults to NON_BLOCKING: the model would keep talking
    // through a tool call and could answer before look_at_screen came back.
    for (const declaration of toGeminiFunctionDeclarations()) {
      assert.equal(
        declaration.behavior,
        "BLOCKING",
        `${declaration.name} must not inherit the asynchronous default`,
      );
    }
  });

  it("emits only schema keywords Gemini understands", () => {
    for (const declaration of toGeminiFunctionDeclarations()) {
      walk(declaration.parameters, declaration.name, (node, path) => {
        for (const key of Object.keys(node)) {
          assert.ok(
            ALLOWED_SCHEMA_KEYS.has(key),
            `${path} carries "${key}", which Gemini rejects`,
          );
        }
      });
    }
  });

  it("keeps union discriminators, so a whiteboard step still names its kind", () => {
    const board = toGeminiFunctionDeclarations().find(
      (declaration) => declaration.name === "whiteboard_draw",
    );
    assert.ok(board?.parameters, "whiteboard_draw must declare parameters");
    const steps = (board.parameters.properties as Record<string, Record<string, unknown>>).steps;
    const branches = (steps.items as { anyOf?: Record<string, unknown>[] }).anyOf ?? [];
    assert.ok(branches.length > 1, "the whiteboard step union should survive conversion");

    const kinds = branches.map((branch) => {
      const properties = branch.properties as Record<string, Record<string, unknown>>;
      const values = properties?.kind?.enum as unknown[] | undefined;
      assert.ok(values?.length === 1, "each branch must pin its own kind");
      return values[0];
    });
    assert.ok(kinds.includes("text"), "the text step should still be reachable");
    assert.equal(new Set(kinds).size, kinds.length, "each branch needs a distinct kind");
  });

  it("expresses a nullable field as Gemini spells it, not as a null union", () => {
    const look = toGeminiFunctionDeclarations().find(
      (declaration) => declaration.name === "look_at_screen",
    );
    const reason = (look?.parameters?.properties as Record<string, Record<string, unknown>>).reason;
    assert.equal(reason.type, "string");
    assert.equal(reason.nullable, true);
    assert.ok(!("anyOf" in reason), "a null union would be rejected");
  });

  it("omits the parameter schema for a tool that takes no arguments", () => {
    const clear = toGeminiFunctionDeclarations().find(
      (declaration) => declaration.name === "whiteboard_clear",
    );
    assert.equal(clear?.parameters, undefined);
  });
});

describe("Fallback bridge protocol", () => {
  it("accepts the frames the browser sends", () => {
    const frames = [
      { t: "start", lessonId: "lesson-1" },
      { t: "audio", d: "AAAA" },
      { t: "image", d: "AAAA", mime: "image/jpeg" },
      { t: "text", text: "[STATE: awake]", turnComplete: false },
      { t: "tool", id: "call-1", name: "look_at_screen", response: "{}" },
      { t: "bye" },
    ];
    for (const frame of frames) {
      assert.ok(ClientFrameSchema.safeParse(frame).success, `${frame.t} should parse`);
    }
  });

  it("rejects anything the relay should not forward", () => {
    const rejected: unknown[] = [
      { t: "audio", d: "A".repeat(64_001) },
      { t: "image", d: "AAAA", mime: "image/gif" },
      { t: "start" },
      { t: "text", text: "hi" },
      { t: "audio", d: "AAAA", extra: true },
      { t: "unknown" },
    ];
    for (const frame of rejected) {
      assert.equal(
        ClientFrameSchema.safeParse(frame).success,
        false,
        `${JSON.stringify(frame).slice(0, 60)} should be rejected`,
      );
    }
  });
});

describe("Fallback upstream close", () => {
  it("passes the provider's refusal reason on, so a failed setup says why", async () => {
    const { describeUpstreamClose } = await import("../server/lib/fallbackTutor.js");
    const message = describeUpstreamClose("Gemini", 1007, "Invalid voice name: Nope");
    assert.match(message, /^Gemini/);
    assert.match(message, /1007/);
    assert.match(message, /Invalid voice name: Nope/);
  });

  it("still names the close code when the provider gives no reason", async () => {
    const { describeUpstreamClose } = await import("../server/lib/fallbackTutor.js");
    assert.match(describeUpstreamClose("Grok", 1011, "  "), /code 1011/);
  });

  it("keeps a long reason to a readable length", async () => {
    const { describeUpstreamClose } = await import("../server/lib/fallbackTutor.js");
    assert.ok(describeUpstreamClose("Gemini", 1008, "x".repeat(5_000)).length < 300);
  });
});

describe("Gemini upstream adapter", () => {
  it("reports ready on setupComplete and relays audio, transcripts and tool calls", async () => {
    const { createGeminiUpstream } = await import("../server/lib/gemini.js");
    const gemini = createGeminiUpstream();
    assert.deepEqual(gemini.handle({ setupComplete: {} }), { ready: true });
    const result = gemini.handle({
      serverContent: {
        outputTranscription: { text: "Hi" },
        modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: "AAAA" } }] },
        turnComplete: true,
      },
      toolCall: { functionCalls: [{ id: "c1", name: "look_at_screen", args: {} }] },
    });
    assert.deepEqual(result.frames, [
      { t: "output_transcript", text: "Hi" },
      { t: "audio", d: "AAAA" },
      { t: "turn_complete" },
      { t: "tool_call", calls: [{ id: "c1", name: "look_at_screen", args: "{}" }] },
    ]);
  });

  it("wraps a non-object tool result, which Gemini would reject", async () => {
    const { createGeminiUpstream } = await import("../server/lib/gemini.js");
    const [payload] = createGeminiUpstream().toolResult("c1", "tool", JSON.stringify("text"));
    const response = (payload.toolResponse as { functionResponses: Array<{ response: unknown }> })
      .functionResponses[0].response;
    assert.deepEqual(response, { result: "text" });
  });
});

describe("Grok upstream adapter", () => {
  const instructions = { voiceInstructions: "VOICE", backendInstructions: "BACKEND" };

  it("configures one realtime session with the lesson prompt, voice, audio rates and tools", async () => {
    const { createGrokUpstream } = await import("../server/lib/grok.js");
    const [update] = createGrokUpstream().setup(instructions);
    assert.equal(update.type, "session.update");
    const session = update.session as Record<string, unknown>;
    assert.match(String(session.instructions), /VOICE[\s\S]*FALLBACK TUTOR[\s\S]*BACKEND/);
    assert.equal(typeof session.voice, "string");
    assert.deepEqual(session.turn_detection, { type: "server_vad" });
    assert.deepEqual(session.audio, {
      input: { format: { type: "audio/pcm", rate: 16_000 } },
      output: { format: { type: "audio/pcm", rate: 24_000 } },
    });
  });

  it("offers the same function tools as the paid pipeline, without the Responses-only flag", async () => {
    const { grokTools } = await import("../server/lib/grok.js");
    const functions = grokTools().filter((tool) => tool.type === "function");
    assert.deepEqual(
      functions.map((tool) => tool.name).sort(),
      voiceToolDefinitions.map((tool) => tool.name).sort(),
    );
    for (const tool of functions) {
      assert.equal("strict" in tool, false);
      assert.equal(typeof tool.parameters, "object");
    }
  });

  it("translates Grok's realtime events into relay frames", async () => {
    const { createGrokUpstream } = await import("../server/lib/grok.js");
    const grok = createGrokUpstream();
    assert.deepEqual(grok.handle({ type: "session.updated" }), { ready: true });
    assert.deepEqual(grok.handle({ type: "response.output_audio.delta", delta: "AAAA" }).frames, [
      { t: "audio", d: "AAAA" },
    ]);
    assert.deepEqual(
      grok.handle({ type: "response.output_audio_transcript.delta", delta: "Hi" }).frames,
      [{ t: "output_transcript", text: "Hi" }],
    );
    assert.deepEqual(
      grok.handle({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Virgil",
      }).frames,
      [{ t: "input_transcript", text: "Virgil" }],
    );
    assert.deepEqual(grok.handle({ type: "input_audio_buffer.speech_started" }).frames, [
      { t: "interrupted" },
    ]);
    assert.deepEqual(grok.handle({ type: "response.done" }).frames, [{ t: "turn_complete" }]);
    assert.deepEqual(grok.handle({ type: "error", error: { message: "quota" } }), {
      error: "quota",
    });
    assert.deepEqual(grok.handle({ type: "ping" }), {});
  });

  it("asks for the next reply only once every tool call of the turn is answered", async () => {
    const { createGrokUpstream } = await import("../server/lib/grok.js");
    const grok = createGrokUpstream();
    for (const id of ["a", "b"]) {
      const { frames } = grok.handle({
        type: "response.function_call_arguments.done",
        call_id: id,
        name: "look_at_screen",
        arguments: "{}",
      });
      assert.deepEqual(frames, [
        { t: "tool_call", calls: [{ id, name: "look_at_screen", args: "{}" }] },
      ]);
    }
    const first = grok.toolResult("a", "look_at_screen", '{"result":"x"}');
    assert.deepEqual(first, [
      {
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: "a", output: '{"result":"x"}' },
      },
    ]);
    const last = grok.toolResult("b", "look_at_screen", "{}");
    assert.equal(last.at(-1)?.type, "response.create");
  });

  it("speaks for a closing app note and stays quiet for context, and drops images", async () => {
    const { createGrokUpstream } = await import("../server/lib/grok.js");
    const grok = createGrokUpstream();
    assert.equal(grok.acceptsImages, false);
    assert.deepEqual(grok.image("AAAA", "image/png"), []);
    assert.equal(grok.text("note", false).length, 1);
    assert.equal(grok.text("greet", true).at(-1)?.type, "response.create");
    assert.deepEqual(grok.audio("AAAA"), [{ type: "input_audio_buffer.append", audio: "AAAA" }]);
  });
});
