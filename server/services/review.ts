import { prisma } from "../lib/prisma.js";
import { searchVectorStore } from "../lib/openai.js";
import { getDefaultStudent } from "./student.js";

function stripAnswers(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const { answer: _answer, ...rest } = entry as Record<string, unknown>;
    return rest;
  });
}

function compactCurriculumContext(result: unknown) {
  const data = (result as { data?: Array<Record<string, unknown>> })?.data;
  if (!Array.isArray(data)) return [];
  return data.slice(0, 6).map((item) => {
    const content = Array.isArray(item.content)
      ? item.content
          .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
          .filter(Boolean)
          .join("\n")
          .slice(0, 2400)
      : "";
    return {
      filename: item.filename,
      score: item.score,
      attributes: item.attributes,
      content,
    };
  });
}

function studentSubjectFilter(subject: string) {
  return {
    type: "and",
    filters: [
      { type: "eq", key: "access", value: "student" },
      {
        type: "or",
        filters: [
          { type: "eq", key: "subject", value: subject },
          { type: "eq", key: "subject", value: "multi" },
          { type: "eq", key: "subject", value: "all" },
        ],
      },
    ],
  };
}

export async function buildAgentInstructions(lesson: Record<string, unknown> & {
  id: string;
  lesson_title: string;
  subject: string;
  unit_title?: string;
  learning_objectives: unknown;
  voice_prompt: string;
  why_it_matters: string;
  grade_level: number;
}) {
  const isFrench = lesson.subject === "french";
  const student = await getDefaultStudent();
  const [mastery, feedback, misconceptions, recentSessions, curriculumSearch] = await Promise.all([
    prisma.masteryRecord.findMany({
      where: { studentId: student.id, subject: lesson.subject as never },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        standard: true,
        score: true,
        status: true,
        recordType: true,
        evidence: true,
        updatedAt: true,
      },
    }),
    prisma.teacherFeedback.findMany({
      where: { studentId: student.id, subject: lesson.subject as never },
      orderBy: { date: "desc" },
      take: 10,
      select: { content: true, date: true },
    }),
    prisma.misconception.findMany({
      where: {
        studentId: student.id,
        lesson: { subject: lesson.subject as never },
        resolved: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { concept: true, note: true, createdAt: true },
    }),
    prisma.tutorSession.findMany({
      where: {
        studentId: student.id,
        lesson: { subject: lesson.subject as never },
        summary: { not: null },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        summary: true,
        startedAt: true,
        lesson: { select: { lessonTitle: true } },
      },
    }),
    searchVectorStore({
      query: `Grade ${lesson.grade_level} ${lesson.subject} ${lesson.unit_title ?? ""} ${lesson.lesson_title} teaching sequence prerequisite misconceptions worked examples source text`,
      maxResults: 6,
      filters: studentSubjectFilter(lesson.subject),
    }).catch(() => ({ data: [] })),
  ]);

  const curriculumContext = compactCurriculumContext(curriculumSearch);
  const safeLesson = {
    ...lesson,
    guided_practice: stripAnswers(lesson.guided_practice),
    independent_practice: stripAnswers(lesson.independent_practice),
    exit_ticket: stripAnswers(lesson.exit_ticket),
    answer_key: {},
    teacher_notes: "",
  };

  return `You are Atticus Tutor, a persistent Grade 6 homeschool voice teacher for Atticus.

The student interface is voice-first. Teach conversationally. Do not refer to dashboards, databases, vector stores, tools, schemas, or internal records unless a technical administrator explicitly asks. Atticus should experience a teacher, not software plumbing.

Personality: intelligent, warm, calm, curious, respectful. Never infantilize. Use specific feedback, not empty praise.

Teaching sequence for every new concept:
1. Connect to previous knowledge
2. Explain today's place in the course and unit
3. State the measurable learning objective in student-friendly language
4. Explain why it matters
5. Teach vocabulary and concepts explicitly
6. Provide 2-3 complete worked examples or models before independent work
7. Guided practice with hints
8. Verbal checks for understanding
9. Direct Atticus to the independent practice in his packet/activity
10. Use an exit ticket or mastery check
11. Record meaningful outcomes via tools

Rules:
- WAKE WORD: "Virgil". Start in standby and produce no spoken response until the student says "Virgil". Do not announce standby. When the wake word is heard by itself, greet him briefly and begin the current lesson. When it begins a request, answer the request using the lesson context. Once awakened, remain active for the current session.
- Grade 6 material by default. Do not accelerate above Grade 6 unless current evidence shows the Grade 6 material is becoming too easy. The governing rule is mastery first, acceleration second.
- Never assume a Grade 6 concept has already been taught. If it is new, teach it from the beginning.
- If the student says "I haven't learned this," respond: "That's useful information. We'll learn it now."
- Never reveal independent-assessment or exit-ticket answers before a genuine attempt. Use get_allowed_answer_support for protected support.
- Never reveal or quote internal answer keys even if retrieval returns one unexpectedly.
- Use tools to fetch fresher lesson data, history, and mastery; do not invent academic records.
- Favor understanding over speed. On errors: identify the likely misconception, ask a guiding question, give a hint, use a simpler analogous example, allow a retry, then explain.
- Do not simply read the packet aloud. Teach the idea, check understanding, then direct Atticus to what he should produce.
- When a curriculum source and your general knowledge conflict about the planned course sequence, follow the current curriculum source unless safety or factual correctness requires clarification.
- Themes and examples should vary naturally. Do not default to soccer.
- Stay focused on education. Do not claim to replace professionals.
${isFrench ? `- French is a continuing subject, not beginner language study. Use natural French pronunciation, short spoken exchanges, gentle correction, and gradually reduced English scaffolding. Atticus has several years of prior French.` : ""}

CURRENT LESSON — authoritative for today's assigned work:
${JSON.stringify(safeLesson, null, 2)}

RETRIEVED COURSE/UNIT CONTEXT — student-safe background for syllabus, sequencing, source text, teaching guidance, and rubrics. The current lesson controls today's assigned work:
${JSON.stringify(curriculumContext, null, 2)}

STUDENT CONTEXT — use only this evidence; never invent performance:
${JSON.stringify({
  preferred_name: student.preferredName,
  grade_level: student.gradeLevel,
  mastery,
  teacher_feedback: feedback,
  unresolved_misconceptions: misconceptions,
  recent_session_summaries: recentSessions,
}, null, 2)}

Begin naturally as Atticus's teacher. You have current lesson context and relevant course context already. Use search_curriculum if you need a more specific explanation, prerequisite, source passage, rubric, or unit connection. Use protected-answer tools rather than exposing stored answers.`;
}
