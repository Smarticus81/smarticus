import { env } from "../config/env.js";
import { toGeminiFunctionDeclarations } from "../../shared/voice/tools.js";
import { WebSocket } from "ws";
import type { BridgeToolCall, ServerFrame } from "../../shared/voice/fallbackBridge.js";
import {
  fallbackInstructions,
  type FallbackInstructionParams,
  type UpstreamAdapter,
  type UpstreamResult,
} from "./fallbackTutor.js";

const GEMINI_LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** Audio rates the Live API fixes on each side of the conversation. */
export const GEMINI_INPUT_SAMPLE_RATE = 16_000;
export const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

export function geminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export function geminiSocketUrl(): string {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  return `${GEMINI_LIVE_ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
}

/**
 * The opening frame of a Gemini Live session. It has to be the first message on
 * the socket; the server answers with `setupComplete` before audio may flow.
 */
export function buildGeminiSetup(params: FallbackInstructionParams): Record<string, unknown> {
  const tools: Record<string, unknown>[] = [
    { functionDeclarations: toGeminiFunctionDeclarations() },
  ];
  if (env.GEMINI_ENABLE_SEARCH) tools.push({ googleSearch: {} });

  return {
    setup: {
      model: `models/${env.GEMINI_LIVE_MODEL}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_LIVE_VOICE } },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: fallbackInstructions(params),
          },
        ],
      },
      tools,
      // Transcripts of both sides, so the studio's wake word, goodbye detection
      // and saved session transcript work the same on either provider.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Nothing is set for thinking level, proactive audio or affective dialogue:
      // Gemini 3.8 Live either fixes those or rejects them outright. Turn
      // coverage is left at its default too, which forwards every video frame —
      // harmless here because the bridge only ever sends one when a tool
      // returned a picture.
    },
  };
}

interface GeminiServerMessage {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  toolCall?: {
    functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>;
  };
  goAway?: { timeLeft?: string };
}

const INPUT_AUDIO_MIME = `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`;

/** The first fallback: Gemini Live, relayed through the app server. */
export function createGeminiUpstream(): UpstreamAdapter {
  return {
    label: "Gemini",
    model: env.GEMINI_LIVE_MODEL,
    voice: env.GEMINI_LIVE_VOICE,
    acceptsImages: true,
    openSocket: () => new WebSocket(geminiSocketUrl()),
    setup: (instructions) => [buildGeminiSetup(instructions)],
    audio: (data) => [{ realtimeInput: { audio: { data, mimeType: INPUT_AUDIO_MIME } } }],
    image: (data, mime) => [{ realtimeInput: { video: { data, mimeType: mime } } }],
    text: (text, turnComplete) => [
      { clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete } },
    ],
    toolResult(id, name, raw) {
      let response: unknown;
      try {
        response = JSON.parse(raw);
      } catch {
        response = { error: "The tool result was not valid JSON." };
      }
      return [
        {
          toolResponse: {
            functionResponses: [
              {
                id,
                name,
                // Gemini expects an object here; a bare value is wrapped so a
                // string or array result does not fail the turn.
                response:
                  response && typeof response === "object" && !Array.isArray(response)
                    ? response
                    : { result: response },
              },
            ],
          },
        },
      ];
    },
    handle(raw): UpstreamResult {
      const message = raw as GeminiServerMessage;
      if (message.setupComplete !== undefined) return { ready: true };

      const frames: ServerFrame[] = [];
      const content = message.serverContent;
      if (content) {
        if (content.interrupted) frames.push({ t: "interrupted" });
        const inputText = content.inputTranscription?.text;
        if (inputText) frames.push({ t: "input_transcript", text: inputText });
        const outputText = content.outputTranscription?.text;
        if (outputText) frames.push({ t: "output_transcript", text: outputText });
        for (const part of content.modelTurn?.parts ?? []) {
          const audio = part.inlineData;
          if (audio?.data && audio.mimeType?.startsWith("audio/")) {
            frames.push({ t: "audio", d: audio.data });
          }
        }
        if (content.turnComplete) frames.push({ t: "turn_complete" });
      }

      const calls: BridgeToolCall[] = (message.toolCall?.functionCalls ?? [])
        .filter((call): call is { id?: string; name: string; args?: Record<string, unknown> } =>
          Boolean(call.name),
        )
        .map((call) => ({
          id: call.id ?? "",
          name: call.name,
          args: JSON.stringify(call.args ?? {}),
        }));
      if (calls.length) frames.push({ t: "tool_call", calls });

      if (message.goAway) {
        frames.push({ t: "error", message: "The fallback session is about to reach its time limit." });
      }
      return { frames };
    },
  };
}
