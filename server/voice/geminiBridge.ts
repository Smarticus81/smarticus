import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { RequestHandler } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";
import { buildGeminiSetup, geminiConfigured, geminiSocketUrl } from "../lib/gemini.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { buildVoiceInstructions, RESPONSE_QUALITY_RULES } from "../services/voicePrompt.js";
import { getDefaultStudent } from "../services/student.js";
import {
  BRIDGE_PATH,
  ClientFrameSchema,
  type BridgeToolCall,
  type ServerFrame,
} from "../../shared/voice/geminiBridge.js";

/** A frame larger than this is not a voice chunk; it is something going wrong. */
const MAX_FRAME_BYTES = 1_500_000;
const SETUP_TIMEOUT_MS = 20_000;

let activeSessions = 0;

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

/**
 * Relay one browser voice session to Gemini Live and back.
 *
 * The bridge is deliberately thin: it authenticates the socket, builds the
 * session's instructions and tool catalog server-side, and then forwards
 * validated frames. It never interprets the conversation, and the API key never
 * leaves this process.
 */
class GeminiSession {
  private upstream: WebSocket | null = null;
  private ready = false;
  private closed = false;
  /** Audio that arrived before Gemini finished setup, replayed once it has. */
  private readonly pending: string[] = [];
  private setupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: WebSocket,
    private readonly requestId: string,
  ) {}

  start() {
    this.client.on("message", (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();
      if (raw.length > MAX_FRAME_BYTES) return this.fail("A voice frame was too large.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return this.fail("A voice frame was not valid JSON.");
      }
      const frame = ClientFrameSchema.safeParse(parsed);
      if (!frame.success) return this.fail("A voice frame did not match the protocol.");
      void this.handleClientFrame(frame.data);
    });
    this.client.on("close", () => this.dispose("client_closed"));
    this.client.on("error", () => this.dispose("client_error"));
  }

  private send(frame: ServerFrame) {
    if (this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(JSON.stringify(frame));
  }

  private fail(message: string) {
    this.send({ t: "error", message });
  }

  private sendUpstream(payload: Record<string, unknown>) {
    if (this.upstream?.readyState !== WebSocket.OPEN) return false;
    this.upstream.send(JSON.stringify(payload));
    return true;
  }

  private async handleClientFrame(frame: ReturnType<typeof ClientFrameSchema.parse>) {
    switch (frame.t) {
      case "start":
        await this.openUpstream(frame.lessonId);
        return;
      case "audio":
        if (!this.ready) {
          // Bounded: dropping the oldest keeps a slow setup from growing memory.
          if (this.pending.length > 200) this.pending.shift();
          this.pending.push(frame.d);
          return;
        }
        this.sendUpstream({
          realtimeInput: {
            audio: { data: frame.d, mimeType: "audio/pcm;rate=16000" },
          },
        });
        return;
      case "image":
        this.sendUpstream({
          realtimeInput: { video: { data: frame.d, mimeType: frame.mime } },
        });
        return;
      case "text":
        this.sendUpstream({
          clientContent: {
            turns: [{ role: "user", parts: [{ text: frame.text }] }],
            turnComplete: frame.turnComplete,
          },
        });
        return;
      case "tool": {
        let response: unknown;
        try {
          response = JSON.parse(frame.response);
        } catch {
          response = { error: "The tool result was not valid JSON." };
        }
        this.sendUpstream({
          toolResponse: {
            functionResponses: [
              {
                id: frame.id,
                name: frame.name,
                // Gemini expects an object here; a bare value is wrapped so a
                // string or array result does not fail the turn.
                response:
                  response && typeof response === "object" && !Array.isArray(response)
                    ? response
                    : { result: response },
              },
            ],
          },
        });
        return;
      }
      case "bye":
        this.dispose("client_ended");
        return;
    }
  }

  private async openUpstream(lessonId: string) {
    if (this.upstream) return this.fail("This voice session was already started.");
    let setup: Record<string, unknown>;
    let lessonMarker: string;
    try {
      const student = await getDefaultStudent();
      const lesson = await getLessonById(lessonId);
      if (!lesson) return this.closeWith("lesson_not_found", "That lesson could not be found.");
      if (!lesson.voice_prompt.trim()) {
        return this.closeWith("lesson_unprepared", "This lesson has no voice guidance yet.");
      }
      const baseInstructions = await buildAgentInstructions(lesson);
      lessonMarker = `[SELECTED_LESSON:${lesson.external_id ?? lesson.id}]`;
      if (!baseInstructions.includes(lessonMarker)) {
        throw new Error("Backend instructions are missing the selected lesson marker");
      }
      setup = buildGeminiSetup({
        voiceInstructions: buildVoiceInstructions({
          studentName: student.preferredName,
          lessonTitle: lesson.lesson_title,
          subject: lesson.subject,
        }),
        backendInstructions: `${baseInstructions}\n\n${RESPONSE_QUALITY_RULES}`,
      });
    } catch (error) {
      log({
        level: "error",
        message: "Fallback voice session could not be prepared",
        requestId: this.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.closeWith("setup_failed", "The fallback tutor could not start.");
    }

    const upstream = new WebSocket(geminiSocketUrl());
    this.upstream = upstream;
    this.setupTimer = setTimeout(() => {
      if (!this.ready) this.closeWith("setup_timeout", "The fallback tutor did not respond.");
    }, SETUP_TIMEOUT_MS);
    this.setupTimer.unref();

    upstream.on("open", () => upstream.send(JSON.stringify(setup)));
    upstream.on("message", (data) =>
      this.handleUpstreamMessage(data.toString(), lessonId, lessonMarker),
    );
    upstream.on("error", (error) => {
      log({
        level: "error",
        message: "Fallback voice upstream failed",
        requestId: this.requestId,
        error: error.message,
      });
      this.closeWith("upstream_error", "The fallback tutor's connection failed.");
    });
    upstream.on("close", (code) => this.dispose(`upstream_closed_${code}`));
  }

  private handleUpstreamMessage(raw: string, lessonId: string, lessonMarker: string) {
    let message: GeminiServerMessage;
    try {
      message = JSON.parse(raw) as GeminiServerMessage;
    } catch {
      return;
    }

    if (message.setupComplete !== undefined && !this.ready) {
      this.ready = true;
      if (this.setupTimer) clearTimeout(this.setupTimer);
      this.setupTimer = null;
      this.send({
        t: "ready",
        sessionId: `gemini-${this.requestId}`,
        model: env.GEMINI_LIVE_MODEL,
        voice: env.GEMINI_LIVE_VOICE,
        lessonId,
        lessonMarker,
      });
      for (const chunk of this.pending.splice(0)) {
        this.sendUpstream({
          realtimeInput: { audio: { data: chunk, mimeType: "audio/pcm;rate=16000" } },
        });
      }
      return;
    }

    const content = message.serverContent;
    if (content) {
      if (content.interrupted) this.send({ t: "interrupted" });
      const inputText = content.inputTranscription?.text;
      if (inputText) this.send({ t: "input_transcript", text: inputText });
      const outputText = content.outputTranscription?.text;
      if (outputText) this.send({ t: "output_transcript", text: outputText });
      for (const part of content.modelTurn?.parts ?? []) {
        const audio = part.inlineData;
        if (audio?.data && audio.mimeType?.startsWith("audio/")) {
          this.send({ t: "audio", d: audio.data });
        }
      }
      if (content.turnComplete) this.send({ t: "turn_complete" });
    }

    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length) {
      const mapped: BridgeToolCall[] = calls
        .filter((call): call is { id?: string; name: string; args?: Record<string, unknown> } =>
          Boolean(call.name),
        )
        .map((call) => ({
          id: call.id ?? "",
          name: call.name,
          args: JSON.stringify(call.args ?? {}),
        }));
      if (mapped.length) this.send({ t: "tool_call", calls: mapped });
    }

    if (message.goAway) {
      this.send({ t: "error", message: "The fallback session is about to reach its time limit." });
    }
  }

  private closeWith(reason: string, message: string) {
    this.send({ t: "error", message });
    this.dispose(reason);
  }

  dispose(reason: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.setupTimer = null;
    this.send({ t: "closed", reason });
    try {
      this.upstream?.close();
    } catch {
      /* already closing */
    }
    this.upstream = null;
    try {
      this.client.close();
    } catch {
      /* already closing */
    }
    activeSessions = Math.max(0, activeSessions - 1);
  }
}

/**
 * Attach the fallback voice bridge to the HTTP server.
 *
 * The upgrade is authenticated with the same session cookie as the REST API, by
 * running the very same session middleware over the upgrade request.
 */
export function attachGeminiBridge(server: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== BRIDGE_PATH) return;

    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };

    if (!geminiConfigured()) return reject("503 Service Unavailable");
    if (activeSessions >= env.GEMINI_MAX_SESSIONS) return reject("429 Too Many Requests");

    // express-session reads the cookie off the request and never writes a
    // response here, but it wraps `writeHead` on the way in, so the stub has to
    // carry one for that wrapping to have something to hold.
    const response = {
      getHeader: () => undefined,
      setHeader: () => undefined,
      writeHead: () => undefined,
      end: () => undefined,
    };
    sessionMiddleware(
      request as never,
      response as never,
      (error?: unknown) => {
        const session = (request as { session?: { authenticated?: boolean } }).session;
        if (error || (env.APP_ACCESS_PASSWORD && session?.authenticated !== true)) {
          return reject("401 Unauthorized");
        }
        wss.handleUpgrade(request, socket, head, (client) => {
          activeSessions += 1;
          const requestId = Math.random().toString(36).slice(2, 12);
          log({ message: "Fallback voice session opened", requestId, activeSessions });
          new GeminiSession(client, requestId).start();
        });
      },
    );
  });

  return wss;
}
