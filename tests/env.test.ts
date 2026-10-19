import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { envSchema } from "../server/config/env.js";

const productionEnv = {
  NODE_ENV: "production",
  PORT: "3000",
  OPENAI_API_KEY: "test-key",
  DATABASE_URL: "postgresql://app:secret@database:5432/atticus",
  SESSION_SECRET: "a-production-only-secret-with-more-than-32-characters",
  APP_ACCESS_PASSWORD: "a-unique-family-access-password",
  PARENT_ACCESS_CODE: "test-parent-code",
};

describe("production environment validation", () => {
  it("accepts explicit production credentials", () => {
    assert.equal(envSchema.safeParse(productionEnv).success, true);
  });

  it("rejects placeholder credentials", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/atticus_tutor",
      SESSION_SECRET: "short",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(
        new Set(result.error.issues.map((issue) => issue.path[0])),
        new Set(["OPENAI_API_KEY", "SESSION_SECRET", "APP_ACCESS_PASSWORD", "PARENT_ACCESS_CODE", "DATABASE_URL"]),
      );
    }
  });
});


describe("private school bootstrap validation", () => {
  it("requires only the existing parent protection for a private parent plan", () => {
    assert.equal(envSchema.safeParse({ NODE_ENV: "development", PRIVATE_SCHOOL_CONTEXT_JSON: "{}" }).success, false);
    assert.equal(envSchema.safeParse({ NODE_ENV: "development", PRIVATE_SCHOOL_CONTEXT_JSON: "{}", PARENT_ACCESS_CODE: "test-parent-code" }).success, true);
  });
  it("allows a protected continuation but rejects a missing first part", () => {
    const common = { NODE_ENV: "development", PARENT_ACCESS_CODE: "test-parent-code" };
    assert.equal(envSchema.safeParse({ ...common, PRIVATE_SCHOOL_CONTEXT_JSON: "{", PRIVATE_SCHOOL_CONTEXT_JSON_PART_2: "}" }).success, true);
    assert.equal(envSchema.safeParse({ ...common, PRIVATE_SCHOOL_CONTEXT_JSON_PART_2: "}" }).success, false);
    assert.equal(envSchema.safeParse({ PRIVATE_SCHOOL_CONTEXT_JSON_PART_2: "}" }).success, false);
  });
});
