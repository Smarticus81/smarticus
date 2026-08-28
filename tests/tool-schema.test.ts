import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTutorTools } from "../client/src/voice/tools.js";

describe("Realtime tool schemas", () => {
  it("requires every declared field for Structured Outputs", () => {
    for (const tool of createTutorTools("test-lesson")) {
      const schema = tool.parameters as {
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
      };
      const properties = Object.keys(schema.properties ?? {}).sort();
      const required = [...(schema.required ?? [])].sort();

      assert.deepEqual(required, properties, `${tool.name} has an optional field`);
      assert.equal(
        schema.additionalProperties,
        false,
        `${tool.name} must reject undeclared fields`,
      );
    }
  });
});
