import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
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
  if (res.headersSent) return _next(err);

  if (err instanceof ZodError) {
    log({ level: "warn", message: "Validation error", requestId: req.ctx?.requestId, issues: err.issues });
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      requestId: req.ctx?.requestId,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const status = err.code === "P2025" ? 404 : err.code === "P2002" ? 409 : 500;
    if (status !== 500) {
      log({
        level: "warn",
        message: "Database request rejected",
        requestId: req.ctx?.requestId,
        prismaCode: err.code,
      });
      return res.status(status).json({
        error: status === 404 ? "Resource not found" : "Resource already exists",
        requestId: req.ctx?.requestId,
      });
    }
  }

  const httpStatus =
    typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
      ? err.status
      : undefined;
  if (httpStatus === 400 || httpStatus === 413) {
    return res.status(httpStatus).json({
      error: httpStatus === 413 ? "Request body too large" : "Invalid request body",
      requestId: req.ctx?.requestId,
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  log({
    level: "error",
    message,
    requestId: req.ctx?.requestId,
    sessionId: req.ctx?.sessionId,
    lessonId: req.ctx?.lessonId,
  });
  res.status(500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : message,
    requestId: req.ctx?.requestId,
  });
}

declare module "express-session" {
  interface SessionData {
    studentId?: string;
    tutorSessionId?: string;
    authenticated?: boolean;
  }
}
