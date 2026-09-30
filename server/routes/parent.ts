import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/http.js";
import { getParentDashboard, saveParentGradeDay, type ParentGradeDay } from "../services/parent.js";

const CodeSchema = z.object({ code: z.string().min(4).max(64) }).strict();
const GradeDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_number: z.number().int().positive().optional(),
  note: z.string().max(4000).optional(),
  subjects: z.array(z.object({
    subject: z.string().min(1),
    score: z.number().min(0).max(100).nullable(),
    display: z.string().max(32).optional(),
    status: z.enum(["reviewed", "provisional", "not_assessed", "missing"]),
    note: z.string().max(2000).optional(),
  })).max(20),
}).strict();

export const parentRouter = Router();

function codeMatches(candidate: string): boolean {
  if (!env.PARENT_ACCESS_CODE) return false;
  const expected = createHash("sha256").update(env.PARENT_ACCESS_CODE).digest();
  const supplied = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expected, supplied);
}

function requireParent(req: Request, res: Response, next: NextFunction) {
  if (req.session.parentAuthenticated === true) return next();
  res.status(401).json({ error: "Parent access required", requestId: req.ctx.requestId });
}

parentRouter.get("/session", (req, res) => {
  res.json({
    authenticated: req.session.parentAuthenticated === true,
    configured: Boolean(env.PARENT_ACCESS_CODE),
  });
});

parentRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    if (!env.PARENT_ACCESS_CODE) {
      return res.status(503).json({ error: "Parent access is not configured." });
    }
    const { code } = CodeSchema.parse(req.body);
    if (!codeMatches(code)) {
      return res.status(401).json({ error: "Incorrect parent code." });
    }
    req.session.parentAuthenticated = true;
    await new Promise<void>((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });
    res.json({ authenticated: true });
  }),
);

parentRouter.post("/logout", (req, res) => {
  req.session.parentAuthenticated = false;
  req.session.save(() => res.status(204).end());
});

parentRouter.use(requireParent);

parentRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await getParentDashboard());
  }),
);

parentRouter.put(
  "/grades/:date",
  asyncHandler(async (req, res) => {
    const body = GradeDaySchema.parse({ ...req.body, date: req.params.date }) as ParentGradeDay;
    res.json(await saveParentGradeDay(body));
  }),
);
