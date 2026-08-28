import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/http.js";

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
}).strict();

export const authRouter = Router();

function passwordMatches(candidate: string): boolean {
  if (!env.APP_ACCESS_PASSWORD) return true;
  const expected = createHash("sha256").update(env.APP_ACCESS_PASSWORD).digest();
  const supplied = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expected, supplied);
}

authRouter.get("/session", (req, res) => {
  res.json({ authenticated: !env.APP_ACCESS_PASSWORD || req.session.authenticated === true });
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { password } = LoginSchema.parse(req.body);
    if (!passwordMatches(password)) {
      return res.status(401).json({ error: "Invalid password" });
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.authenticated = true;
    await new Promise<void>((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });
    res.json({ authenticated: true });
  }),
);

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("atticus.sid", {
      secure: env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    });
    res.status(204).end();
  });
});

export function requireAuthentication(req: Request, res: Response, next: NextFunction) {
  if (!env.APP_ACCESS_PASSWORD || req.session.authenticated === true) return next();
  res.status(401).json({ error: "Authentication required", requestId: req.ctx.requestId });
}
