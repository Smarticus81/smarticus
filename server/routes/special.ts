import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import {
  ClientSecretRequestSchema,
  EndSessionSchema,
} from "../../shared/schemas/api.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { mintRealtimeClientSecret } from "../lib/openai.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { getDefaultStudent } from "../services/student.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";

export const realtimeRouter = Router();

const VOICE_RESPONSE_OVERRIDES = `
VOICE RESPONSE OVERRIDES — follow these even if earlier general wording differs:
- If Atticus says only the wake word "Virgil", say exactly: "Ready." Then stop and wait. Do not add his name, a greeting, a question, or extra words.
- If "Virgil" begins a request, skip the greeting and answer the request immediately.
- Be concise by default. Most spoken replies should be one or two short sentences. Give one step or one explanation at a time. Do not add filler, repeated encouragement, recaps, or multiple follow-up questions unless Atticus asks for more detail.
- For any assigned guided-practice, independent-practice, or exit-ticket question, NEVER state the final answer, even after an incorrect attempt. Say whether his attempt is correct, incorrect, or partially correct; identify one issue; give one concise hint or next step; then ask him to retry.
- If his assigned answer is correct, confirm it briefly and explain the key reason without restating a hidden answer key.
- If he is stuck, use at most one analogous example that is different from the assigned item, then return to his problem.
- Do not solve an assigned problem by gradually supplying every missing step. Keep the final calculation, wording, or conclusion for Atticus to produce.
- For general concept questions that are not assigned items, teach directly but still keep the answer concise unless he asks for a deeper explanation.
`;

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

    const baseInstructions = await buildAgentInstructions(lesson);
    const instructions = `${baseInstructions}\n\n${VOICE_RESPONSE_OVERRIDES}`;
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
      const message =
        error instanceof Error ? error.message : "Failed to mint client secret";
      if (message.includes("OPENAI_API_KEY")) {
        return res
          .status(503)
          .json({
            error: "OpenAI not configured",
            devNote: "Set OPENAI_API_KEY for live voice sessions",
          });
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
      // A retry after a lost HTTP response must not make an already-saved session fail.
      const saved = await prisma.tutorSession.findFirst({
        where: {
          id: body.session_id,
          studentId: student.id,
          endedAt: { not: null },
        },
        select: { id: true, transcript: true },
      });
      if (!saved)
        return res
          .status(404)
          .json({ error: "Active tutor session not found" });
      if (req.session.tutorSessionId === body.session_id)
        delete req.session.tutorSessionId;
      return res.json({
        ended: true,
        transcriptRetained: saved.transcript !== null,
      });
    }
    if (req.session.tutorSessionId === body.session_id) {
      delete req.session.tutorSessionId;
    }

    res.json({ ended: true, transcriptRetained: retain && !!body.transcript });
  }),
);
