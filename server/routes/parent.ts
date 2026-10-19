import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/http.js";
import { getParentDashboard, saveParentGradeDay, type ParentGradeDay } from "../services/parent.js";

import { SaveSchoolContextSchema, SchoolAssignmentSchema } from "../../shared/schoolContext.js";
import { DescribeScreenSchema, LiveSessionRequestSchema } from "../../shared/schemas/api.js";
import { toFunctionTools } from "../../shared/voice/tools.js";
import { schoolVoiceToolDefinitions } from "../../shared/voice/schoolTools.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { createLiveSession, describeScreen } from "../lib/openai.js";
import { readSchoolContext, saveSchoolContext, SchoolContextConflict } from "../services/schoolContext.js";
import { buildSchoolTutorSession, selectSchoolAssignment, SchoolTutorSelectionError } from "../services/schoolLearning.js";

const CodeSchema = z.object({ code: z.string().min(4).max(64) }).strict();
const SchoolSelectionSchema = z.object({
  assignmentId: SchoolAssignmentSchema.shape.id,
  expectedRevision: z.number().int().min(0),
});
const SchoolLiveSchema = SchoolSelectionSchema.extend({
  sdp: LiveSessionRequestSchema.shape.sdp,
}).strict();
const SchoolVisionSchema = DescribeScreenSchema.extend(SchoolSelectionSchema.shape).strict();
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

parentRouter.get("/school-context", asyncHandler(async (_req, res) => {
  try {
    const state = await readSchoolContext();
    res.json({ ...state, lessons: [] });
  } catch {
    res.status(500).json({ error: "The private school plan could not be loaded. Please try again." });
  }
}));
parentRouter.put("/school-context", asyncHandler(async (req, res) => {
  const parsed = SaveSchoolContextSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid school plan. Check the required fields and limits." });
  try {
    await saveSchoolContext(parsed.data.context, parsed.data.expectedRevision);
    res.json({ ...(await readSchoolContext()), lessons: [] });
  } catch (error) {
    if (error instanceof SchoolContextConflict) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "The private school plan could not be saved. Existing records were kept." });
  }
}));

parentRouter.post("/school-tutor/live", asyncHandler(async (req, res) => {
  const parsed = SchoolLiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid school tutoring request. Reload and try again." });
  try {
    const { assignmentId, expectedRevision, sdp } = parsed.data;
    const selected = selectSchoolAssignment(await readSchoolContext(), assignmentId, expectedRevision);
    const instructions = buildSchoolTutorSession(selected);
    if (!env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "School voice tutoring is not configured on this server." });
    }
    const live = await createLiveSession({
      sdp,
      safetyIdentifier: hashSafetyIdentifier(`school:${req.sessionID}`),
      voiceInstructions: instructions.voiceInstructions,
      backendInstructions: instructions.backendInstructions,
      tools: toFunctionTools(schoolVoiceToolDefinitions),
      allowWebSearch: false,
    });
    // Do not persist this session or its school context in public tutoring records.
    res.json({
      ...live,
      lessonId: instructions.lessonId,
      lessonMarker: instructions.lessonMarker,
    });
  } catch (error) {
    if (error instanceof SchoolTutorSelectionError) return res.status(error.status).json({ error: error.message });
    // SDK and database errors can contain input or source text; do not log or return them.
    return res.status(502).json({ error: "School voice tutoring could not start just now. Please try again." });
  }
}));

parentRouter.post("/school-tutor/vision", asyncHandler(async (req, res) => {
  const parsed = SchoolVisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid school screen request. Share the screen and try again." });
  try {
    const { assignmentId, expectedRevision, ...frame } = parsed.data;
    selectSchoolAssignment(await readSchoolContext(), assignmentId, expectedRevision);
    if (!env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "School screen description is not configured on this server." });
    }
    res.json({ description: await describeScreen(frame) });
  } catch (error) {
    if (error instanceof SchoolTutorSelectionError) return res.status(error.status).json({ error: error.message });
    return res.status(502).json({ error: "The school screen could not be described just now." });
  }
}));
