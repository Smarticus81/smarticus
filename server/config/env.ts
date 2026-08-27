import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  REALTIME_VOICE: z.string().default("marin"),
  OPENAI_VECTOR_STORE_ID: z.string().optional(),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/atticus_tutor"),
  SESSION_SECRET: z.string().default("dev-session-secret-change-in-production"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

export const env = loadEnv();
