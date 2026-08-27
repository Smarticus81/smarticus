import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { log } from "../lib/logger.js";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    log({ level: "warn", message: "Validation error", requestId: req.ctx?.requestId, issues: err.issues });
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  log({
    level: "error",
    message,
    requestId: req.ctx?.requestId,
    sessionId: req.ctx?.sessionId,
    lessonId: req.ctx?.lessonId,
  });
  res.status(500).json({ error: message });
}

declare module "express-session" {
  interface SessionData {
    studentId?: string;
    tutorSessionId?: string;
  }
}
