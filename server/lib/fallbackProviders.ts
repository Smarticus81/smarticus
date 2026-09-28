import { env } from "../config/env.js";
import {
  FALLBACK_PROVIDERS,
  type FallbackProvider,
} from "../../shared/voice/fallbackBridge.js";
import type { UpstreamAdapter } from "./fallbackTutor.js";
import { createGeminiUpstream, geminiConfigured } from "./gemini.js";
import { createGrokUpstream, grokConfigured } from "./grok.js";

interface FallbackProviderEntry {
  configured(): boolean;
  /** Concurrent sessions allowed on this provider. */
  maxSessions(): number;
  model(): string;
  create(): UpstreamAdapter;
}

export const fallbackProviders: Record<FallbackProvider, FallbackProviderEntry> = {
  gemini: {
    configured: geminiConfigured,
    maxSessions: () => env.GEMINI_MAX_SESSIONS,
    model: () => env.GEMINI_LIVE_MODEL,
    create: createGeminiUpstream,
  },
  grok: {
    configured: grokConfigured,
    maxSessions: () => env.GROK_MAX_SESSIONS,
    model: () => env.GROK_VOICE_MODEL,
    create: createGrokUpstream,
  },
};

/** The fallbacks this server can offer, in the order the studio tries them. */
export function configuredFallbacks(): FallbackProvider[] {
  return FALLBACK_PROVIDERS.filter((provider) => fallbackProviders[provider].configured());
}
