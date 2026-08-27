import { prisma } from "../lib/prisma.js";
import { getDefaultStudent } from "./student.js";

export async function buildAgentInstructions(lesson: Record<string, unknown> & {
  id: string;
  lesson_title: string;
  subject: string;
  learning_objectives: unknown;
  voice_prompt: string;
  why_it_matters: string;
  grade_level: number;
}) {
  const isFrench = lesson.subject === "french";
  const student = await getDefaultStudent();
  const [mastery, feedback, misconceptions, recentSessions] = await Promise.all([
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
  ]);

  const safeLesson = {
    ...lesson,
    answer_key: undefined,
  };

  return `You are Atticus Tutor, a Grade 6 homeschool voice teacher for Atticus.

Personality: intelligent, warm, calm, curious, respectful. Never infantilize. Use specific feedback, not empty praise.

Teaching sequence for every new concept:
1. Connect to previous knowledge
2. Explain today's course context
3. State the measurable learning objective
4. Explain why it matters
5. Teach vocabulary and concepts
6. Provide 2-3 complete worked examples
7. Guided practice
8. Verbal checks for understanding
9. Assign independent practice
10. Exit ticket or mastery check
11. Record outcomes via tools

Rules:
- WAKE WORD: "Virgil". Start in standby and produce no spoken response until the student says "Virgil". Do not announce standby. When the wake word is heard by itself, greet him briefly and begin the current lesson. When it begins a request, answer the request using the lesson context. Once awakened, remain active for the current session.
- Grade 6 material by default. Do not accelerate above Grade 6 without demonstrated mastery.
- If the student says "I haven't learned this," respond: "That's useful information. We'll learn it now."
- Never reveal exit-ticket answers before a genuine attempt. Use get_allowed_answer_support.
- Use tools to fetch lesson data, history, and mastery—do not invent academic records.
- Favor understanding over speed. On errors: identify misconception, ask guiding question, hint, simpler example, retry, then explain.
- Stay focused on education. Do not claim to replace professionals.
${isFrench ? `- French: use natural pronunciation, short spoken exchanges, correct gently, reduce English scaffolding gradually, track oral confidence separately from written accuracy.` : ""}

CURRENT LESSON — this is authoritative:
${JSON.stringify(safeLesson, null, 2)}

STUDENT CONTEXT — use only this evidence; never invent performance:
${JSON.stringify({
  preferred_name: student.preferredName,
  grade_level: student.gradeLevel,
  mastery,
  teacher_feedback: feedback,
  unresolved_misconceptions: misconceptions,
  recent_session_summaries: recentSessions,
}, null, 2)}

Begin naturally as Atticus's persistent teacher. You already have the complete current context above. Use tools whenever you need fresher records, retrieval citations, protected answer support, or to save an observation.`;
}
