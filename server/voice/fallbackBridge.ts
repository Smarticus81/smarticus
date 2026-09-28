import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { RequestHandler } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";
import {
  describeUpstreamClose,
  type UpstreamAdapter,
  type UpstreamPayload,
} from "../lib/fallbackTutor.js";
import { fallbackProviders } from "../lib/fallbackProviders.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { buildVoiceInstructions, RESPONSE_QUALITY_RULES } from "../services/voicePrompt.js";
import { buildVoiceContext } from "../services/voiceContext.js";
import { getDefaultStudent } from "../services/student.js";
import {
  BRIDGE_PATHS,
  ClientFrameSchema,
  FALLBACK_PROVIDERS,
  type FallbackProvider,
  type ServerFrame,
} from "../../shared/voice/fallbackBridge.js";

/** A frame larger than this is not a voice chunk; it is something going wrong. */
const MAX_FRAME_BYTES = 1_500_000;
const SETUP_TIMEOUT_MS = 20_000;

const activeSessions: Record<FallbackProvider, number> = { gemini: 0, grok: 0 };

/**
 * Relay one browser voice session to a fallback provider and back.
 *
 * The bridge is deliberately thin: it authenticates the socket, builds the
 * session's instructions server-side, and then forwards validated frames
 * through the provider's adapter. It never interprets the conversation, and the
 * API key never leaves this process.
 */
class FallbackSession {
  private upstream: WebSocket | null = null;
  private ready = false;
  private closed = false;
  /** Audio that arrived before the provider finished setup, replayed once it has. */
  private readonly pending: string[] = [];
  private setupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: WebSocket,
    private readonly requestId: string,
    private readonly provider: FallbackProvider,
    private readonly adapter: UpstreamAdapter,
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

  private sendUpstream(payloads: UpstreamPayload[]) {
    if (this.upstream?.readyState !== WebSocket.OPEN) return false;
    for (const payload of payloads) this.upstream.send(JSON.stringify(payload));
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
        this.sendUpstream(this.adapter.audio(frame.d));
        return;
      case "image":
        this.sendUpstream(this.adapter.image(frame.d, frame.mime));
        return;
      case "text":
        this.sendUpstream(this.adapter.text(frame.text, frame.turnComplete));
        return;
      case "tool":
        this.sendUpstream(this.adapter.toolResult(frame.id, frame.name, frame.response));
        return;
      case "bye":
        this.dispose("client_ended");
        return;
    }
  }

  private async openUpstream(lessonId: string) {
    if (this.upstream) return this.fail("This voice session was already started.");
    let setup: UpstreamPayload[];
    let lessonMarker: string;
    try {
      const student = await getDefaultStudent();
      const lesson = await getLessonById(lessonId);
      if (!lesson) return this.closeWith("lesson_not_found", "That lesson could not be found.");
      if (!lesson.voice_prompt.trim()) {
        return this.closeWith("lesson_unprepared", "This lesson has no voice guidance yet.");
      }
      const [baseInstructions, context] = await Promise.all([
        buildAgentInstructions(lesson),
        buildVoiceContext({ date: lesson.date, selectedLessonId: lesson.id }),
      ]);
      lessonMarker = `[SELECTED_LESSON:${lesson.external_id ?? lesson.id}]`;
      if (!baseInstructions.includes(lessonMarker)) {
        throw new Error("Backend instructions are missing the selected lesson marker");
      }
      setup = this.adapter.setup({
        // A fallback has one system instruction rather than a seeded history, so
        // the day's brief rides along with the voice half of the prompt.
        voiceInstructions: buildVoiceInstructions({
          studentName: student.preferredName,
          lessonTitle: lesson.lesson_title,
          subject: lesson.subject,
          contextBrief: context.brief,
        }),
        backendInstructions: `${baseInstructions}\n\n${RESPONSE_QUALITY_RULES}`,
      });
    } catch (error) {
      log({
        level: "error",
        message: "Fallback voice session could not be prepared",
        requestId: this.requestId,
        provider: this.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.closeWith("setup_failed", "The fallback tutor could not start.");
    }

    let upstream: WebSocket;
    try {
      upstream = this.adapter.openSocket();
    } catch (error) {
      log({
        level: "error",
        message: "Fallback voice upstream could not be opened",
        requestId: this.requestId,
        provider: this.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.closeWith("upstream_unavailable", "The fallback tutor could not start.");
    }
    this.upstream = upstream;
    this.setupTimer = setTimeout(() => {
      if (!this.ready) this.closeWith("setup_timeout", "The fallback tutor did not respond.");
    }, SETUP_TIMEOUT_MS);
    this.setupTimer.unref();

    upstream.on("open", () => this.sendUpstream(setup));
    upstream.on("message", (data) =>
      this.handleUpstreamMessage(data.toString(), lessonId, lessonMarker),
    );
    upstream.on("error", (error) => {
      log({
        level: "error",
        message: "Fallback voice upstream failed",
        requestId: this.requestId,
        provider: this.provider,
        error: error.message,
      });
      this.closeWith("upstream_error", "The fallback tutor's connection failed.");
    });
    upstream.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      log({
        level: this.ready ? "info" : "error",
        message: "Fallback voice upstream closed",
        requestId: this.requestId,
        provider: this.provider,
        code,
        reason,
        ready: this.ready,
      });
      if (!this.ready && !this.closed) {
        this.fail(describeUpstreamClose(this.adapter.label, code, reason));
      }
      this.dispose(`upstream_closed_${code}`);
    });
  }

  private handleUpstreamMessage(raw: string, lessonId: string, lessonMarker: string) {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const result = this.adapter.handle(message);

    if (result.error) {
      log({
        level: "error",
        message: "Fallback voice provider reported an error",
        requestId: this.requestId,
        provider: this.provider,
        error: result.error,
        ready: this.ready,
      });
      if (!this.ready) {
        return this.closeWith(
          "upstream_refused",
          `${this.adapter.label} refused the fallback session: ${result.error}`,
        );
      }
      this.send({ t: "error", message: result.error });
    }

    if (result.ready && !this.ready) {
      this.ready = true;
      if (this.setupTimer) clearTimeout(this.setupTimer);
      this.setupTimer = null;
      this.send({
        t: "ready",
        sessionId: `${this.provider}-${this.requestId}`,
        provider: this.provider,
        model: this.adapter.model,
        voice: this.adapter.voice,
        images: this.adapter.acceptsImages,
        lessonId,
        lessonMarker,
      });
      for (const chunk of this.pending.splice(0)) this.sendUpstream(this.adapter.audio(chunk));
    }

    for (const frame of result.frames ?? []) this.send(frame);
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
    activeSessions[this.provider] = Math.max(0, activeSessions[this.provider] - 1);
  }
}

function providerForPath(pathname: string): FallbackProvider | null {
  return FALLBACK_PROVIDERS.find((provider) => BRIDGE_PATHS[provider] === pathname) ?? null;
}

/**
 * Attach the fallback voice bridge to the HTTP server, one path per provider.
 *
 * The upgrade is authenticated with the same session cookie as the REST API, by
 * running the very same session middleware over the upgrade request.
 */
export function attachFallbackBridge(server: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const provider = providerForPath(url.pathname);
    if (!provider) return;
    const entry = fallbackProviders[provider];

    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };

    if (!entry.configured()) return reject("503 Service Unavailable");
    if (activeSessions[provider] >= entry.maxSessions()) return reject("429 Too Many Requests");

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
          activeSessions[provider] += 1;
          const requestId = Math.random().toString(36).slice(2, 12);
          log({
            message: "Fallback voice session opened",
            requestId,
            provider,
            activeSessions: activeSessions[provider],
          });
          new FallbackSession(client, requestId, provider, entry.create()).start();
        });
      },
    );
  });

  return wss;
}
