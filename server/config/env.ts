import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    OPENAI_API_KEY: optionalString,
    REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
    REALTIME_VOICE: z.string().default("marin"),
    WEB_SEARCH_MODEL: z.string().default("gpt-5.6"),
    OPENAI_VECTOR_STORE_ID: optionalString,
    DATABASE_URL: z
      .string()
      .default("postgresql://postgres:postgres@localhost:5432/atticus_tutor"),
    SESSION_SECRET: z.string().default("dev-session-secret-change-in-production"),
    APP_ACCESS_PASSWORD: optionalString,
    SESSION_MAX_AGE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60 * 1000),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    AUTO_INGEST_CURRICULUM: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV !== "production") return;

    if (!values.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required in production",
      });
    }
    if (
      values.SESSION_SECRET.length < 32 ||
      values.SESSION_SECRET.startsWith("dev-session-secret")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be a unique value of at least 32 characters in production",
      });
    }
    if (!values.APP_ACCESS_PASSWORD || values.APP_ACCESS_PASSWORD.length < 12) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ACCESS_PASSWORD"],
        message: "APP_ACCESS_PASSWORD must be at least 12 characters in production",
      });
    }
    if (values.DATABASE_URL.includes("postgres:postgres@localhost")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must not use the development default in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export const env = loadEnv();
