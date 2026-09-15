import { Router } from "express";
import { asyncHandler } from "../middleware/http.js";
import {
  LiveSessionRequestSchema,
  EndSessionSchema,
} from "../../shared/schemas/api.js";
import { toFunctionTools } from "../../shared/voice/tools.js";
import { getLessonById } from "../services/academic.js";
import { buildAgentInstructions } from "../services/review.js";
import { buildVoiceInstructions } from "../services/voicePrompt.js";
import { createLiveSession } from "../lib/openai.js";
import { hashSafetyIdentifier } from "../lib/auth.js";
import { getDefaultStudent } from "../services/student.js";
import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";

export const realtimeRouter = Router();

const RESPONSE_QUALITY_RULES = `
RESPONSE QUALITY RULES — follow these even if earlier general wording differs:
- Be concise by default. Most spoken replies should be one or two short sentences. Give one step or one explanation at a time. Do not add filler, repeated encouragement, recaps, or multiple follow-up questions unless Atticus asks for more detail.
- Keep every explanation inside the vocabulary of an 11-to-12-year-old: everyday words, short sentences, one idea at a time. Keep the real subject terms, but give a short plain-language meaning the first time each one comes up, and define any other hard word in six words or fewer right after you use it. Simpler wording never means a lower academic standard.
- Hold a high academic standard while remaining calm and supportive. Do not lower the standard to make an answer feel successful.
- Do not call a response complete when it omits a requested part, unit, label, setup, diagram, evidence, explanation, revision step, or second output. Say briefly what is missing and require Atticus to finish it.
- If the numerical answer is correct but required work is missing, say: "The number is right, but the response is not complete yet." Then name one missing requirement.
- Do not accept vague reasoning that merely restates the question or evidence. Ask what the evidence proves, why the step works, or what mechanism connects cause and effect.
- For any assigned guided-practice, independent-practice, or exit-ticket question, NEVER state the final answer, even after an incorrect attempt. Say whether his attempt is correct, incorrect, partially correct, or incomplete; identify one issue; give one concise hint or next step; then ask him to retry.
- If his assigned answer is fully correct and complete, confirm it briefly and explain the key reason without restating a hidden answer key.
- If he is stuck, use at most one analogous example that is different from the assigned item, then return to his problem. The whiteboard is the right place for that example.
- Do not solve an assigned problem by gradually supplying every missing step. Keep the final calculation, wording, diagram, or conclusion for Atticus to produce.
- During writing, require actual revision when the assignment calls for revision. Do not rewrite the paragraph for him.
- During build labs, coach specification, coding, testing, debugging, and explanation. You may teach syntax and show small snippets on the whiteboard, but do not take over the finished project.
- For general concept questions that are not assigned items, teach directly and comprehensively enough for understanding, but still keep spoken chunks short unless Atticus asks for more detail.
`;

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
    const voiceInstructions = buildVoiceInstructions({
      studentName: student.preferredName,
      lessonTitle: lesson.lesson_title,
      subject: lesson.subject,
    });

    try {
      const live = await createLiveSession({
        sdp,
        safetyIdentifier: hashSafetyIdentifier(student.internalId),
        voiceInstructions,
        backendInstructions,
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
