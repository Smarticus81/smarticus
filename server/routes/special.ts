import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import {
  LiveSessionRequestSchema,
  EndSessionSchema,
} from "../../shared/schemas/api.js";
import { toFunctionTools } from "../../shared/voice/tools.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import {
  buildVoiceInstructions,
  RESPONSE_QUALITY_RULES,
} from "../services/voicePrompt.js";
import { buildVoiceContext } from "../services/voiceContext.js";
import { createLiveSession } from "../lib/openai.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { getDefaultStudent } from "../services/student.js";
import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";
import { env } from "../config/env.js";

export const realtimeRouter = Router();

/**
 * Errors that mean the OpenAI account cannot pay for this session, as opposed to
 * a transient outage, so the learner is told to top up rather than to retry.
 */
const QUOTA_ERROR =
  /insufficient_quota|exceeded your current quota|billing_hard_limit|quota exceeded|account is not active/i;

function isQuotaError(error: unknown): boolean {
  if (QUOTA_ERROR.test(error instanceof Error ? error.message : String(error))) return true;
  // Deliberately not a bare 429: that is also how a transient rate limit
  // arrives, and a burst of requests should simply be retried.
  const { code, type } = (error ?? {}) as { code?: string; type?: string };
  return code === "insufficient_quota" || type === "insufficient_quota";
}

realtimeRouter.post(
  "/live",
  asyncHandler(async (req, res) => {
    const { lesson_id, sdp } = LiveSessionRequestSchema.parse(req.body);
    const student = await getDefaultStudent();
    req.session.studentId = student.id;

    const lesson = await getLessonById(lesson_id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    if (!lesson.voice_prompt.trim()) {
      return res.status(422).json({ error: "Lesson voice guidance is missing" });
    }

    const baseInstructions = await buildAgentInstructions(lesson);
    const backendInstructions = `${baseInstructions}\n\n${RESPONSE_QUALITY_RULES}`;
    const lessonMarker = `[SELECTED_LESSON:${lesson.external_id ?? lesson.id}]`;
    if (!backendInstructions.includes(lessonMarker)) {
      throw new Error("Backend instructions are missing the selected lesson marker");
    }
    const context = await buildVoiceContext({
      date: lesson.date,
      selectedLessonId: lesson.id,
    });
    const voiceInstructions = buildVoiceInstructions({
      studentName: student.preferredName,
      lessonTitle: lesson.lesson_title,
      subject: lesson.subject,
      contextBrief: context.brief,
    });

    try {
      const live = await createLiveSession({
        sdp,
        safetyIdentifier: hashSafetyIdentifier(student.internalId),
        voiceInstructions,
        backendInstructions,
        initialInput: context.initialItems,
        tools: toFunctionTools(),
      });
      log({
        message: "Live voice session created",
        requestId: req.ctx.requestId,
        lessonId: lesson.id,
        lessonExternalId: lesson.external_id,
        lessonDate: lesson.date,
        liveSessionId: live.sessionId,
        voiceModel: live.voiceModel,
        backendModel: live.backendModel,
      });
      res.json({
        sdp: live.sdp,
        sessionId: live.sessionId,
        lessonId: lesson.id,
        lessonMarker,
        voiceModel: live.voiceModel,
        backendModel: live.backendModel,
        voice: live.voice,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create live session";
      if (env.OPENAI_API_KEY && isQuotaError(error)) {
        log({
          message: "Live voice session refused: OpenAI quota exhausted",
          requestId: req.ctx.requestId,
          lessonId: lesson.id,
        });
        // 402 rather than 503: the pipeline is healthy, the budget is not.
        return res.status(402).json({
          error: "The OpenAI voice budget is used up. Top up the OpenAI account, then connect again.",
        });
      }
      if (message.includes("OPENAI_API_KEY")) {
        return res.status(503).json({
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
