import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toFunctionTools, voiceToolDefinitions } from "../shared/voice/tools.js";

function assertStrict(schema: Record<string, unknown>, path: string) {
  if (schema.type === "object") {
    const properties = Object.keys((schema.properties as Record<string, unknown>) ?? {}).sort();
    const required = [...((schema.required as string[]) ?? [])].sort();
    assert.deepEqual(required, properties, `${path} has an optional field`);
    assert.equal(schema.additionalProperties, false, `${path} must reject undeclared fields`);
    for (const [key, value] of Object.entries((schema.properties as Record<string, unknown>) ?? {})) {
      assertStrict(value as Record<string, unknown>, `${path}.${key}`);
    }
  }
  if (schema.items) assertStrict(schema.items as Record<string, unknown>, `${path}[]`);
  for (const branch of (schema.anyOf as Record<string, unknown>[]) ?? []) {
    assertStrict(branch, `${path}|`);
  }
}

describe("Live backend tool schemas", () => {
  it("emits strict JSON Schema for every tool, including nested whiteboard steps", () => {
    const tools = toFunctionTools();
    assert.equal(tools.length, voiceToolDefinitions.length);
    for (const tool of tools) {
      assert.equal(tool.type, "function");
      assert.equal(tool.strict, true);
      assert.ok(tool.description.length > 20, `${tool.name} needs a description`);
      assert.equal("$schema" in tool.parameters, false, `${tool.name} leaks $schema`);
      assertStrict(tool.parameters, tool.name);
    }
  });

  it("has unique tool names and the vision and whiteboard tools", () => {
    const names = voiceToolDefinitions.map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length);
    for (const expected of [
      "look_at_screen",
      "navigate_lesson",
      "whiteboard_draw",
      "whiteboard_look",
      "whiteboard_clear",
      "get_lesson_questions",
    ]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
  });

  it("keeps every whiteboard step kind in the draw schema", () => {
    const draw = toFunctionTools().find((tool) => tool.name === "whiteboard_draw");
    assert.ok(draw);
    const steps = (draw.parameters.properties as Record<string, { items: { anyOf: Array<{ properties: { kind: { const: string } } }> } }>).steps;
    const kinds = steps.items.anyOf.map((branch) => branch.properties.kind.const).sort();
    assert.deepEqual(kinds, [
      "circle",
      "fraction_bar",
      "highlight",
      "line",
      "number_line",
      "path",
      "pause",
      "rect",
      "table",
      "text",
    ]);
  });
});
