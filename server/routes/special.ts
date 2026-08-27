import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import { ClientSecretRequestSchema, EndSessionSchema } from "../../shared/schemas/api.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { mintRealtimeClientSecret } from "../lib/openai.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { getDefaultStudent } from "../services/student.js";
import { prisma } from "../lib/prisma.js";

export const realtimeRouter = Router();

realtimeRouter.post(
  "/client-secret",
  asyncHandler(async (req, res) => {
    const { lesson_id } = ClientSecretRequestSchema.parse(req.body);
    const student = await getDefaultStudent();
    req.session.studentId = student.id;

    const lesson = await getLessonById(lesson_id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const instructions = await buildAgentInstructions(lesson);

    try {
      const secret = await mintRealtimeClientSecret({
        safetyIdentifier: hashSafetyIdentifier(student.internalId),
        instructions,
      });
      res.json({
        value: secret.value,
        lessonId: lesson.id,
        sessionModel: process.env.REALTIME_MODEL ?? "gpt-realtime-2.1",
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
    const settings = await prisma.parentSetting.findFirst();
    const retain = settings?.retainTranscripts ?? true;

    await prisma.tutorSession.update({
      where: { id: body.session_id },
      data: {
        endedAt: new Date(),
        summary: body.summary,
        transcript: retain && body.transcript ? body.transcript : undefined,
      },
    });

    res.json({ ended: true, transcriptRetained: retain && !!body.transcript });
  }),
);
