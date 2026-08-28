import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RequestContext {
  requestId: string;
  sessionId?: string;
  lessonId?: string;
}

declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
    }
  }
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const suppliedRequestId = req.header("x-request-id");
  req.ctx = {
    requestId:
      suppliedRequestId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID(),
    sessionId: req.headers["x-session-id"] as string | undefined,
    lessonId: req.headers["x-lesson-id"] as string | undefined,
  };
  _res.setHeader("x-request-id", req.ctx.requestId);

  const startedAt = performance.now();
  _res.on("finish", () => {
    log({
      message: "Request completed",
      requestId: req.ctx.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      statusCode: _res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  });
  next();
}

export interface LogFields {
  requestId?: string;
  sessionId?: string;
  lessonId?: string;
  toolName?: string;
  toolOutcome?: string;
  ingestionJobId?: string;
  level?: "info" | "warn" | "error" | "debug";
  message: string;
  [key: string]: unknown;
}

export function log(fields: LogFields) {
  const { level = "info", message, ...rest } = fields;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...rest,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
