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
  req.ctx = {
    requestId: (req.headers["x-request-id"] as string) || randomUUID(),
    sessionId: req.headers["x-session-id"] as string | undefined,
    lessonId: req.headers["x-lesson-id"] as string | undefined,
  };
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
