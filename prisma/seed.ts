import "dotenv/config";
import { PrismaClient, type MasteryStatus, type Subject } from "@prisma/client";
import { ingestAllCurriculum } from "../server/ingest/curriculum.js";
import { parseDate } from "../server/services/student.js";

const prisma = new PrismaClient();

async function ensureFeedback(params: {
  studentId: string;
  subject: Subject;
  date: string;
  content: string;
}) {
  const date = parseDate(params.date);
  const existing = await prisma.teacherFeedback.findFirst({
    where: {
      studentId: params.studentId,
      subject: params.subject,
      date,
      content: params.content,
    },
  });
  if (!existing) {
    await prisma.teacherFeedback.create({
      data: { studentId: params.studentId, subject: params.subject, date, content: params.content },
    });
  }
}

async function ensureMastery(params: {
  studentId: string;
  subject: Subject;
  standard: string;
  status: MasteryStatus;
  evidence: string;
}) {
  const existing = await prisma.masteryRecord.findFirst({
    where: {
      studentId: params.studentId,
      subject: params.subject,
      standard: params.standard,
      recordType: "AI_OBSERVATION",
    },
  });
  if (!existing) {
    await prisma.masteryRecord.create({
      data: {
        studentId: params.studentId,
        subject: params.subject,
        standard: params.standard,
        status: params.status,
        evidence: params.evidence,
        recordType: "AI_OBSERVATION",
      },
    });
  }
}

async function main() {
  console.log("Seeding Atticus Tutor...");

  const student = await prisma.student.upsert({
    where: { internalId: "atticus-g6-2026" },
    create: {
      internalId: "atticus-g6-2026",
      preferredName: "Atticus",
      gradeLevel: 6,
    },
    update: { preferredName: "Atticus", gradeLevel: 6 },
  });

  const schoolYear = await prisma.schoolYear.upsert({
    where: { label: "2026-27" },
    create: {
      label: "2026-27",
      startDate: new Date("2026-08-25"),
      endDate: new Date("2027-06-15"),
      studentId: student.id,
    },
    update: {
      startDate: new Date("2026-08-25"),
      endDate: new Date("2027-06-15"),
      studentId: student.id,
    },
  });

  const existingSettings = await prisma.parentSetting.findFirst();
  if (!existingSettings) {
    await prisma.parentSetting.create({
      data: {
        retainTranscripts: true,
        masteryThresholdHigh: 90,
        masteryThresholdLow: 75,
      },
    });
  }

  for (const date of ["2026-08-25", "2026-08-26", "2026-08-27"]) {
    await prisma.attendanceRecord.upsert({
      where: { studentId_date: { studentId: student.id, date: parseDate(date) } },
      create: { studentId: student.id, date: parseDate(date), status: "present" },
      update: {},
    });
  }

  console.log("Ingesting curriculum...");
  try {
    await ingestAllCurriculum();
  } catch (err) {
    console.warn("Curriculum ingest skipped or partial:", err instanceof Error ? err.message : err);
  }

  // Opening-week evidence comes from teacher review of the completed Wednesday packet.
  await ensureFeedback({
    studentId: student.id,
    subject: "mathematics",
    date: "2026-08-26",
    content:
      "Fraction multiplication is developing with useful written work. Fraction division is not yet secure: reciprocal use becomes inconsistent, especially with mixed numbers. Continue full Grade 6 instruction and briefly reteach fraction division before deeper decimal division. Do not accelerate yet.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "literature",
    date: "2026-08-26",
    content:
      "Reading comprehension is solid at the current Grade 6 level. Main priorities are response precision: theme as a complete transferable message, significance as what a detail reveals/proves, and completion of every requested component. Do not make texts easier solely because written answers need refinement.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "writing",
    date: "2026-08-26",
    content:
      "Ideas and evidence are substantive. Continue Grade 6 expectations while explicitly teaching organization, sentence boundaries, evidence-to-reasoning links, and final proofreading. Use an oral plan before independent drafting rather than writing the response for him.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "science",
    date: "2026-08-26",
    content:
      "Atticus shows meaningful understanding of reflection and of light traveling from a source to an object/material and then to the eye or wall. Continue sharpening observation versus inference and distinguish directional reflection from foil/mirror from diffuse reflection by ordinary white paper.",
  });

  await ensureMastery({
    studentId: student.id,
    subject: "mathematics",
    standard: "6.NS.A.1-fraction-division",
    status: "needs_reteach",
    evidence: "Wednesday independent work showed inconsistent reciprocal use in fraction division, especially with mixed numbers.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "mathematics",
    standard: "6.NS-fraction-multiplication",
    status: "developing",
    evidence: "Wednesday work showed improving multiplication of fractions and mixed numbers with several correct procedures, but not enough repeated independent evidence for mastery.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "literature",
    standard: "RL.6.1-evidence-and-inference",
    status: "developing",
    evidence: "Comprehension and inference were generally sound; responses still need more precise evidence/significance and complete multi-part answers.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "writing",
    standard: "W.6.9-evidence-based-response",
    status: "developing",
    evidence: "CER included relevant details and a clear overall claim; organization, sentence boundaries, and explicit reasoning need reinforcement.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "science",
    standard: "MS-PS4-2-light-matter",
    status: "developing",
    evidence: "Light-path reasoning is emerging; continue distinguishing observed reflection/transmission/absorption and explaining evidence precisely.",
  });

  console.log("Seed complete.", { studentId: student.id, schoolYear: schoolYear.label });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
