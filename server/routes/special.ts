import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import { ClientSecretRequestSchema, EndSessionSchema } from "../../shared/schemas/api.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { mintRealtimeClientSecret } from "../lib/openai.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { getDefaultStudent } from "../services/student.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";

export const realtimeRouter = Router();

realtimeRouter.post(
  "/client-secret",
  asyncHandler(async (req, res) => {
    const { lesson_id } = ClientSecretRequestSchema.parse(req.body);
    const student = await getDefaultStudent();
    req.session.studentId = student.id;

    const lesson = await getLessonById(lesson_id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    if (!lesson.voice_prompt.trim()) {
      return res.status(422).json({ error: "Lesson voice guidance is missing" });
    }

    const instructions = await buildAgentInstructions(lesson);
    const lessonMarker = `[SELECTED_LESSON:${lesson.external_id ?? lesson.id}]`;
    if (!instructions.includes(lessonMarker)) {
      throw new Error("Realtime instructions are missing the selected lesson marker");
    }

    try {
      const secret = await mintRealtimeClientSecret({
        safetyIdentifier: hashSafetyIdentifier(student.internalId),
        instructions,
      });
      log({
        message: "Realtime lesson context ready",
        requestId: req.ctx.requestId,
        lessonId: lesson.id,
        lessonExternalId: lesson.external_id,
        lessonDate: lesson.date,
        voiceGuidanceAttached: true,
      });
      res.json({
        value: secret.value,
        lessonId: lesson.id,
        sessionModel: env.REALTIME_MODEL,
        instructions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mint client secret";
      if (message.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ error: "OpenAI not configured", devNote: "Set OPENAI_API_KEY for live voice sessions" });
      }
      throw error;
    }
  }),
);

realtimeRouter.post(
  "/session/end",
  asyncHandler(async (req, res) => {
    const body = EndSessionSchema.parse(req.body);
    const student = await getDefaultStudent();
    const settings = await prisma.parentSetting.findFirst();
    const retain = settings?.retainTranscripts ?? true;

    const result = await prisma.tutorSession.updateMany({
      where: { id: body.session_id, studentId: student.id, endedAt: null },
      data: {
        endedAt: new Date(),
        summary: body.summary,
        transcript: retain && body.transcript ? body.transcript : undefined,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Active tutor session not found" });
    }
    if (req.session.tutorSessionId === body.session_id) {
      delete req.session.tutorSessionId;
    }

    res.json({ ended: true, transcriptRetained: retain && !!body.transcript });
  }),
);
