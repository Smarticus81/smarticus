import "dotenv/config";
import { PrismaClient, type MasteryStatus, type Subject } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestAllCurriculum } from "../server/ingest/curriculum.js";
import { parseDate } from "../server/services/student.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
    orderBy: { updatedAt: "desc" },
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
  } else {
    await prisma.masteryRecord.update({
      where: { id: existing.id },
      data: { status: params.status, evidence: params.evidence },
    });
  }
}

export async function seedDatabase() {
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

  // Wednesday evidence.
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

  // Thursday evidence from the completed packet supplied by the parent.
  await ensureFeedback({
    studentId: student.id,
    subject: "mathematics",
    date: "2026-08-27",
    content:
      "Fraction division improved substantially: the independent set and both fraction-division exit items shown were correct. Decimal multiplication was mostly strong, including multi-digit products and applications. Estimation/reasonableness is not yet automatic; 7.2 x 0.45 was written as 5.24 instead of 3.24, which a quick estimate would have caught. Move to Grade 6 decimal division while retaining conceptual fraction-division and estimation checks.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "literature",
    date: "2026-08-27",
    content:
      "Informational-text comprehension is strong at the current Grade 6 level. Atticus correctly explained asphalt heating, transpiration, vegetation cooling, and relevant evidence. Continue precision work: topic must name the subject, an objective summary must include the major ideas, and repeated measurements should be explained as improving reliability rather than simply 'one is not enough.'",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "writing",
    date: "2026-08-27",
    content:
      "No separate Thursday writing-workshop sample was included in the completed upload set. Do not claim new Thursday writing mastery. Continue the supported Wednesday position: substantive ideas and evidence with explicit instruction needed for organization, sentence boundaries, evidence-to-reasoning links, and proofreading.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "science",
    date: "2026-08-27",
    content:
      "Light-path reasoning is strong: Atticus correctly explained that room light reaches a book, reflects from the book, and enters the eyes, and that no object is visible in a perfectly dark room without visible light. Transparent/translucent/opaque vocabulary is not yet secure: clear plastic should be transparent in the intended example, wax paper/tissue translucent, and cardboard opaque. Continue with a brief vocabulary repair.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "history_geography",
    date: "2026-08-27",
    content:
      "Atticus correctly connected mountainous terrain to difficult travel, separated communities, and the development of independent city-states. Map work included the major requested features. Correct the claim that the sea helped as drinking water; emphasize transport, trade, fishing, communication, and exchange. The cultural connection versus political unity question was unanswered, so Friday should introduce the polis and complete that distinction.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "french",
    date: "2026-08-27",
    content:
      "Basic ne...pas placement with regular -ER verbs is developing well. Explicitly repair elision before vowel sounds: Elle n'ecoute pas, je n'aime pas. Continue subject-pronoun consistency in self-generated sentences and preserve oral fluency while correcting written forms.",
  });
  await ensureFeedback({
    studentId: student.id,
    subject: "computer_science",
    date: "2026-08-27",
    content:
      "Atticus completed the Scratch conditional build, tested multiple inputs, found/fixed a green-flag bug, and trained/tested a three-class Teachable Machine image classifier. Hands-on build/debugging evidence is strong. The comparison and exit-ticket explanations were incomplete due to time, so the conceptual distinction between explicit programmed rules and learned patterns from labeled examples remains developing.",
  });

  await ensureMastery({
    studentId: student.id,
    subject: "mathematics",
    standard: "6.NS.A.1-fraction-division",
    status: "proficient",
    evidence: "Thursday independent and exit-ticket fraction-division work showed repeated correct use of the divisor reciprocal, including mixed numbers. Retain periodic conceptual checks before declaring mastered.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "mathematics",
    standard: "6.NS-fraction-multiplication",
    status: "proficient",
    evidence: "Wednesday and Thursday evidence together show reliable multiplication of fractions and mixed numbers at the current Grade 6 level.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "mathematics",
    standard: "6.NS.B.3-decimal-multiplication",
    status: "proficient",
    evidence: "Thursday independent decimal multiplication was mostly correct across multi-digit and application problems; estimation/reasonableness remains a required checking habit.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "literature",
    standard: "RI.6.2-central-idea-summary",
    status: "developing",
    evidence: "Thursday work showed correct central understanding and relevant details, but topic naming and objective-summary completeness still need direct practice.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "science",
    standard: "MS-PS4-2-light-path",
    status: "proficient",
    evidence: "Thursday CER and challenge response correctly modeled light source -> object -> eye and explained why a book cannot be seen in complete darkness.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "science",
    standard: "MS-PS4-2-material-classification",
    status: "developing",
    evidence: "Thursday lab confused transparent, translucent, and opaque classifications even while the broader light-path model was correct.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "history_geography",
    standard: "C3-geography-causation-ancient-greece",
    status: "developing",
    evidence: "Correct mountains -> difficult travel -> separated communities reasoning, but incomplete cultural/political distinction and one inaccurate sea-use claim require reinforcement.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "french",
    standard: "ACTFL-er-verbs-negation",
    status: "developing",
    evidence: "Thursday work shows generally correct ne...pas placement with regular -ER verbs, with elision and subject consistency still needing repair.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "computer_science",
    standard: "CSTA-conditionals-debugging",
    status: "proficient",
    evidence: "Thursday Scratch build demonstrated working conditional logic, boundary testing, and a real debug/fix cycle.",
  });
  await ensureMastery({
    studentId: student.id,
    subject: "computer_science",
    standard: "AI-ML-classification-generalization",
    status: "developing",
    evidence: "Thursday Teachable Machine build was completed successfully, but the written conceptual comparison between explicit rules and learned patterns was not completed.",
  });

  console.log("Seed complete.", { studentId: student.id, schoolYear: schoolYear.label });
}

export async function disconnectSeedDatabase() {
  await prisma.$disconnect();
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectSeedDatabase();
    });
}
