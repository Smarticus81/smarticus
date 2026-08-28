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
        new Set(["OPENAI_API_KEY", "SESSION_SECRET", "APP_ACCESS_PASSWORD", "DATABASE_URL"]),
      );
    }
  });
});
