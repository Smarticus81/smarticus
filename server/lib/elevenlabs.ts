import { WebSocket } from "ws";
import { env } from "../config/env.js";
import { toGeminiFunctionDeclarations } from "../../shared/voice/tools.js";
import type { ServerFrame } from "../../shared/voice/fallbackBridge.js";
import {
  fallbackInstructions,
  type FallbackInstructionParams,
  type UpstreamAdapter,
  type UpstreamPayload,
  type UpstreamResult,
} from "./fallbackTutor.js";

export const ELEVENLABS_API_ORIGIN = "https://api.elevenlabs.io";

/**
 * The rates the browser's fallback audio pipeline speaks: 16kHz up, 24kHz
 * down. An ElevenLabs agent carries its own audio formats in its settings, so
 * the adapter reads what the session actually negotiated and resamples either
 * side when the agent was set up differently.
 */
export const ELEVENLABS_INPUT_SAMPLE_RATE = 16_000;
export const ELEVENLABS_OUTPUT_SAMPLE_RATE = 24_000;

/** How long the agent waits for a tool result before it gives up on it. */
const TOOL_TIMEOUT_SECONDS = 30;

export function elevenLabsConfigured(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID);
}

/** What the studio shows as the model: the LLM override when set, else the agent. */
export function elevenLabsModelLabel(): string {
  return env.ELEVENLABS_LLM ?? "elevenlabs-agent";
}

function apiHeaders(): Record<string, string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
  return { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" };
}

/**
 * A short-lived URL for one conversation with a private agent. The key is
 * exchanged for it server-side and never rides on the socket itself.
 */
export async function fetchSignedUrl(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!env.ELEVENLABS_AGENT_ID) throw new Error("ELEVENLABS_AGENT_ID is not configured");
  const url = new URL("/v1/convai/conversation/get-signed-url", ELEVENLABS_API_ORIGIN);
  url.searchParams.set("agent_id", env.ELEVENLABS_AGENT_ID);
  const response = await fetchImpl(url, { headers: apiHeaders() });
  const body = (await response.json().catch(() => ({}))) as {
    signed_url?: string;
    detail?: unknown;
  };
  if (!response.ok || !body.signed_url) {
    const detail =
      typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? "");
    throw new Error(
      `ElevenLabs would not sign a conversation URL (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return body.signed_url;
}

/** `pcm_16000` → 16000; anything that is not linear PCM is unsupported. */
export function pcmRate(format: string | undefined): number | null {
  const match = /^pcm_(\d+)$/.exec(format ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Linear resampling of base64 PCM16 (little-endian). The relay carries a few
 * hundred milliseconds at a time, so a plain interpolation is enough: speech
 * stays intelligible and no dependency is needed for it.
 */
export function resamplePcm16(base64: string, from: number, to: number): string {
  if (from === to || !base64) return base64;
  const bytes = Buffer.from(base64, "base64");
  const input = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  if (input.length === 0) return "";
  const outputLength = Math.max(1, Math.round((input.length * to) / from));
  const output = new Int16Array(outputLength);
  const step = from / to;
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * step;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    output[i] = Math.round(
      input[Math.min(index, input.length - 1)] * (1 - fraction) + input[next] * fraction,
    );
  }
  return Buffer.from(output.buffer, output.byteOffset, output.byteLength).toString("base64");
}

/**
 * The tool catalog as ElevenLabs client tools: the same schemas Gemini gets,
 * minus the Gemini-only keywords. `expects_response` makes the agent wait for
 * the browser's result before it answers, which is what the executors assume.
 */
export function elevenLabsToolConfigs(): Record<string, unknown>[] {
  return toGeminiFunctionDeclarations().map((declaration) => ({
    type: "client",
    name: declaration.name,
    description: declaration.description,
    expects_response: true,
    response_timeout_secs: TOOL_TIMEOUT_SECONDS,
    parameters: plainSchema(declaration.parameters ?? { type: "object", properties: {} }),
  }));
}

/** The only keywords ElevenLabs' tool parameter schema accepts. */
const ELEVENLABS_SCHEMA_KEYS = new Set(["type", "description", "enum", "items", "properties", "required"]);

/**
 * ElevenLabs reads a parameter's description as "the model supplies this
 * value", so every property carries one, falling back to its own name.
 */
function plainSchema(input: unknown, name = ""): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const schema = input as Record<string, unknown>;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
    const merged = mergeBranches(schema.anyOf.map((branch) => plainSchema(branch, name)));
    if (typeof schema.description === "string") merged.description = schema.description;
    if (name && typeof merged.description !== "string") merged.description = name.replace(/_/g, " ");
    return merged;
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && schema.nullable === true && typeof value === "string" && value !== "object" && value !== "array") {
      // ElevenLabs writes an optional scalar as a two-entry type, not `nullable`.
      output.type = [value, "null"];
      continue;
    }
    if (!ELEVENLABS_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      output.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([child, childSchema]) => [
          child,
          plainSchema(childSchema, child),
        ]),
      );
      continue;
    }
    if (key === "items") {
      output.items = plainSchema(value, `${name} item`);
      continue;
    }
    output[key] = value;
  }
  if (output.type === "object" && !output.properties) output.properties = {};
  if (name && typeof output.description !== "string") output.description = name.replace(/_/g, " ");
  return output;
}

/**
 * ElevenLabs has no `anyOf`, so a union of object shapes (the whiteboard's
 * step kinds, say) becomes one object carrying every branch's properties, with
 * the discriminating enums joined and only the properties every branch needs
 * marked required. A union of anything else keeps its first branch.
 */
function mergeBranches(branches: Record<string, unknown>[]): Record<string, unknown> {
  if (branches.length === 1 || branches.some((branch) => branch.type !== "object")) {
    return branches[0] ?? {};
  }
  const properties: Record<string, Record<string, unknown>> = {};
  for (const branch of branches) {
    for (const [key, value] of Object.entries(
      (branch.properties ?? {}) as Record<string, Record<string, unknown>>,
    )) {
      const existing = properties[key];
      if (!existing) {
        properties[key] = { ...value };
        continue;
      }
      if (Array.isArray(existing.enum) && Array.isArray(value.enum)) {
        existing.enum = [...new Set([...existing.enum, ...value.enum])];
      }
    }
  }
  const required = branches
    .map((branch) => new Set((branch.required as string[] | undefined) ?? []))
    .reduce((common, next) => new Set([...common].filter((key) => next.has(key))));
  return {
    type: "object",
    properties,
    ...(required.size ? { required: [...required] } : {}),
  };
}

/**
 * The agent as the studio needs it: no opening line of its own (the studio
 * greets through the same note the other providers get), the browser's audio
 * rates, every studio tool, and overrides switched on so each session can carry
 * the day's instructions. The system prompt here is only a placeholder; the
 * real one is sent when a conversation starts.
 */
export function elevenLabsAgentConfig(toolIds: string[]): Record<string, unknown> {
  return {
    name: "Virgil",
    conversation_config: {
      agent: {
        first_message: "",
        language: "en",
        prompt: {
          prompt:
            "You are Virgil, a homeschool tutor. The studio sends the full instructions when each conversation starts.",
          ...(env.ELEVENLABS_LLM ? { llm: env.ELEVENLABS_LLM } : {}),
          tool_ids: toolIds,
        },
      },
      tts: {
        ...(env.ELEVENLABS_VOICE_ID ? { voice_id: env.ELEVENLABS_VOICE_ID } : {}),
        agent_output_audio_format: `pcm_${ELEVENLABS_OUTPUT_SAMPLE_RATE}`,
      },
      asr: { user_input_audio_format: `pcm_${ELEVENLABS_INPUT_SAMPLE_RATE}` },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
          tts: { voice_id: true },
        },
      },
    },
  };
}

/** The opening frame of a conversation: this session's instructions and voice. */
export function buildElevenLabsSetup(params: FallbackInstructionParams): UpstreamPayload {
  return {
    type: "conversation_initiation_client_data",
    conversation_config_override: {
      agent: {
        prompt: {
          prompt: fallbackInstructions(params),
          ...(env.ELEVENLABS_LLM ? { llm: env.ELEVENLABS_LLM } : {}),
        },
        // The studio asks for the greeting itself, as it does on every provider.
        first_message: "",
      },
      ...(env.ELEVENLABS_VOICE_ID ? { tts: { voice_id: env.ELEVENLABS_VOICE_ID } } : {}),
    },
  };
}

interface ElevenLabsServerEvent {
  type?: string;
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
    agent_output_audio_format?: string;
    user_input_audio_format?: string;
  };
  audio_event?: { audio_base_64?: string; event_id?: number };
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  interruption_event?: { event_id?: number };
  client_tool_call?: {
    tool_name?: string;
    tool_call_id?: string;
    parameters?: Record<string, unknown>;
  };
  ping_event?: { event_id?: number };
  error_event?: { message?: string; reason?: string; error_type?: string; code?: number };
}

/**
 * The third fallback: an ElevenLabs agent, relayed through the app server so
 * the key stays there.
 *
 * ElevenLabs runs the whole conversation on its side (speech in, model, speech
 * out); the studio's tools reach it as "client tools" the agent was set up
 * with, answered here with the browser's results. It has no image input, so
 * tool pictures are described in text only. Its audio formats belong to the
 * agent's settings rather than the session, so the adapter resamples whatever
 * the agent negotiated to the rates the browser plays and records at.
 */
export function createElevenLabsUpstream(
  options: { fetchImpl?: typeof fetch } = {},
): UpstreamAdapter {
  let inputRate = ELEVENLABS_INPUT_SAMPLE_RATE;
  let outputRate = ELEVENLABS_OUTPUT_SAMPLE_RATE;

  return {
    label: "ElevenLabs",
    model: elevenLabsModelLabel(),
    voice: env.ELEVENLABS_VOICE_ID ?? "agent voice",
    acceptsImages: false,
    async openSocket() {
      const signedUrl = await fetchSignedUrl(options.fetchImpl);
      return new WebSocket(signedUrl);
    },
    setup: (instructions) => [buildElevenLabsSetup(instructions)],
    audio: (data) => [
      { user_audio_chunk: resamplePcm16(data, ELEVENLABS_INPUT_SAMPLE_RATE, inputRate) },
    ],
    image: () => [],
    // A spoken reply is asked for with a user message; context alone is an update
    // the agent folds into its next turn without answering it.
    text: (text, turnComplete) => [
      turnComplete ? { type: "user_message", text } : { type: "contextual_update", text },
    ],
    toolResult: (id, _name, response) => [
      { type: "client_tool_result", tool_call_id: id, result: response, is_error: false },
    ],
    handle(raw): UpstreamResult {
      const event = raw as ElevenLabsServerEvent;
      switch (event.type) {
        case "conversation_initiation_metadata": {
          const metadata = event.conversation_initiation_metadata_event ?? {};
          const negotiatedInput = pcmRate(metadata.user_input_audio_format ?? "pcm_16000");
          const negotiatedOutput = pcmRate(metadata.agent_output_audio_format ?? "pcm_16000");
          if (negotiatedInput === null || negotiatedOutput === null) {
            return {
              error: `The ElevenLabs agent uses an audio format the studio cannot play (${metadata.user_input_audio_format} in, ${metadata.agent_output_audio_format} out). Set both to PCM in the agent's Voice settings.`,
            };
          }
          inputRate = negotiatedInput;
          outputRate = negotiatedOutput;
          return { ready: true };
        }
        case "audio": {
          const data = event.audio_event?.audio_base_64;
          return data
            ? {
                frames: [
                  { t: "audio", d: resamplePcm16(data, outputRate, ELEVENLABS_OUTPUT_SAMPLE_RATE) },
                ],
              }
            : {};
        }
        case "agent_response": {
          const text = event.agent_response_event?.agent_response;
          return text ? { frames: [{ t: "output_transcript", text }, { t: "turn_complete" }] } : {};
        }
        case "user_transcript": {
          const text = event.user_transcription_event?.user_transcript?.trim();
          return text ? { frames: [{ t: "input_transcript", text }] } : {};
        }
        case "interruption":
          return { frames: [{ t: "interrupted" }] };
        case "client_tool_call": {
          const call = event.client_tool_call;
          if (!call?.tool_name || !call.tool_call_id) return {};
          const frame: ServerFrame = {
            t: "tool_call",
            calls: [
              {
                id: call.tool_call_id,
                name: call.tool_name,
                args: JSON.stringify(call.parameters ?? {}),
              },
            ],
          };
          return { frames: [frame] };
        }
        case "ping":
          // Unanswered pings end the conversation, so the relay answers for the browser.
          return { reply: [{ type: "pong", event_id: event.ping_event?.event_id ?? 0 }] };
        case "error": {
          const detail = event.error_event ?? {};
          return {
            error: detail.message || detail.reason || detail.error_type || "ElevenLabs reported an error.",
          };
        }
        default:
          return {};
      }
    },
  };
}
