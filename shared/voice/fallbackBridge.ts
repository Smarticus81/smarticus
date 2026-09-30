import { z } from "zod";

/**
 * The browser-to-server protocol for the fallback voice tier.
 *
 * The OpenAI path negotiates WebRTC once and then talks to OpenAI directly, so
 * the key never reaches the browser. The fallbacks (Gemini Live, then Grok, then
 * an ElevenLabs agent) speak WebSocket with no browser-safe ephemeral credential
 * here, so the app server stays in the middle for the whole session and relays
 * these frames. Every provider sits behind this one envelope, so the browser side does not change
 * with the provider; keeping it small and explicit means the relay can validate
 * everything it forwards.
 */

/** The fallback tiers, in the order the studio tries them. */
export const FALLBACK_PROVIDERS = ["gemini", "grok", "elevenlabs"] as const;
export type FallbackProvider = (typeof FALLBACK_PROVIDERS)[number];

export const BRIDGE_PATHS: Record<FallbackProvider, string> = {
  gemini: "/api/realtime/gemini",
  grok: "/api/realtime/grok",
  elevenlabs: "/api/realtime/elevenlabs",
};

export function isFallbackProvider(value: unknown): value is FallbackProvider {
  return FALLBACK_PROVIDERS.includes(value as FallbackProvider);
}

/** Base64 audio, capped near a second of 16kHz PCM16 so one frame cannot flood. */
const AudioChunkSchema = z.string().min(1).max(64_000);

export const ClientFrameSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("start"), lessonId: z.string().min(1).max(128) }).strict(),
  z.object({ t: z.literal("audio"), d: AudioChunkSchema }).strict(),
  z
    .object({
      t: z.literal("image"),
      d: z.string().min(1).max(1_400_000),
      mime: z.enum(["image/jpeg", "image/png"]),
    })
    .strict(),
  z
    .object({
      t: z.literal("text"),
      text: z.string().min(1).max(8_000),
      /** True asks for a spoken reply now; false only adds context. */
      turnComplete: z.boolean(),
    })
    .strict(),
  z
    .object({
      t: z.literal("tool"),
      id: z.string().max(128),
      name: z.string().min(1).max(64),
      response: z.string().max(120_000),
    })
    .strict(),
  z.object({ t: z.literal("bye") }).strict(),
]);

export type ClientFrame = z.infer<typeof ClientFrameSchema>;

export interface BridgeToolCall {
  id: string;
  name: string;
  /** JSON-encoded, matching the OpenAI path's `LiveFunctionCall.arguments`. */
  args: string;
}

export type ServerFrame =
  | {
      t: "ready";
      sessionId: string;
      provider: FallbackProvider;
      model: string;
      voice: string;
      /** Whether tool pictures reach the model; without them it gets text only. */
      images: boolean;
      lessonId: string;
      lessonMarker: string;
    }
  | { t: "audio"; d: string }
  | { t: "input_transcript"; text: string }
  | { t: "output_transcript"; text: string }
  | { t: "tool_call"; calls: BridgeToolCall[] }
  | { t: "interrupted" }
  | { t: "turn_complete" }
  | { t: "error"; message: string }
  | { t: "closed"; reason: string };
