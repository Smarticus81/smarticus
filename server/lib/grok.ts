import { WebSocket } from "ws";
import { env } from "../config/env.js";
import { toFunctionTools } from "../../shared/voice/tools.js";
import type { ServerFrame } from "../../shared/voice/fallbackBridge.js";
import {
  fallbackInstructions,
  type UpstreamAdapter,
  type UpstreamPayload,
  type UpstreamResult,
} from "./fallbackTutor.js";

const GROK_REALTIME_ENDPOINT = "wss://api.x.ai/v1/realtime";

/**
 * Grok takes any common PCM rate, so it is set to the rates the browser's
 * fallback audio pipeline already uses for Gemini: 16kHz up, 24kHz down.
 */
export const GROK_INPUT_SAMPLE_RATE = 16_000;
export const GROK_OUTPUT_SAMPLE_RATE = 24_000;

export function grokConfigured(): boolean {
  return Boolean(env.XAI_API_KEY);
}

/**
 * The tool catalog for Grok. Grok's Voice Agent API follows the OpenAI Realtime
 * shape, so the paid pipeline's function tools carry over as they are; only the
 * Responses-specific `strict` flag is dropped.
 */
export function grokTools(): UpstreamPayload[] {
  const tools: UpstreamPayload[] = toFunctionTools().map(
    ({ name, description, parameters }) => ({ type: "function", name, description, parameters }),
  );
  if (env.GROK_ENABLE_SEARCH) tools.push({ type: "web_search" });
  return tools;
}

interface GrokServerEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  error?: { message?: string; code?: string };
}

/**
 * The second fallback: xAI's Grok Voice Agent API, relayed through the app
 * server so the key stays there.
 *
 * It speaks the OpenAI Realtime event protocol over a WebSocket. Unlike Gemini
 * it answers a tool result only when asked to, so the adapter tracks the calls
 * of the current turn and requests the next response once the last is answered.
 * It has no image input, so tool pictures are described in text only.
 */
export function createGrokUpstream(): UpstreamAdapter {
  const pendingCalls = new Set<string>();

  return {
    label: "Grok",
    model: env.GROK_VOICE_MODEL,
    voice: env.GROK_VOICE,
    acceptsImages: false,
    openSocket() {
      if (!env.XAI_API_KEY) throw new Error("XAI_API_KEY is not configured");
      const url = `${GROK_REALTIME_ENDPOINT}?model=${encodeURIComponent(env.GROK_VOICE_MODEL)}`;
      return new WebSocket(url, { headers: { Authorization: `Bearer ${env.XAI_API_KEY}` } });
    },
    setup: (instructions) => [
      {
        type: "session.update",
        session: {
          instructions: fallbackInstructions(instructions),
          voice: env.GROK_VOICE,
          turn_detection: { type: "server_vad" },
          audio: {
            input: { format: { type: "audio/pcm", rate: GROK_INPUT_SAMPLE_RATE } },
            output: { format: { type: "audio/pcm", rate: GROK_OUTPUT_SAMPLE_RATE } },
          },
          tools: grokTools(),
        },
      },
    ],
    audio: (data) => [{ type: "input_audio_buffer.append", audio: data }],
    image: () => [],
    text(text, turnComplete) {
      const payloads: UpstreamPayload[] = [
        {
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
        },
      ];
      if (turnComplete) payloads.push({ type: "response.create" });
      return payloads;
    },
    toolResult(id, _name, response) {
      pendingCalls.delete(id);
      const payloads: UpstreamPayload[] = [
        {
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: id, output: response },
        },
      ];
      // Asking for a response while another call of the same turn is still
      // running would answer without its result, so wait for the last one.
      if (pendingCalls.size === 0) payloads.push({ type: "response.create" });
      return payloads;
    },
    handle(raw): UpstreamResult {
      const event = raw as GrokServerEvent;
      switch (event.type) {
        case "session.updated":
          return { ready: true };
        case "response.output_audio.delta":
          return event.delta ? { frames: [{ t: "audio", d: event.delta }] } : {};
        case "response.output_audio_transcript.delta":
          return event.delta ? { frames: [{ t: "output_transcript", text: event.delta }] } : {};
        case "conversation.item.input_audio_transcription.completed":
          return event.transcript?.trim()
            ? { frames: [{ t: "input_transcript", text: event.transcript }] }
            : {};
        case "input_audio_buffer.speech_started":
          return { frames: [{ t: "interrupted" }] };
        case "response.function_call_arguments.done": {
          if (!event.call_id || !event.name) return {};
          pendingCalls.add(event.call_id);
          const frame: ServerFrame = {
            t: "tool_call",
            calls: [{ id: event.call_id, name: event.name, args: event.arguments || "{}" }],
          };
          return { frames: [frame] };
        }
        case "response.done":
          return { frames: [{ t: "turn_complete" }] };
        case "error":
          return { error: event.error?.message || "Grok reported an error." };
        default:
          return {};
      }
    },
  };
}
