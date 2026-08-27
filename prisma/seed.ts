import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ingestAllCurriculum } from "../server/ingest/curriculum.js";
import { parseDate } from "../server/services/student.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Atticus Tutor...");

  const student = await prisma.student.upsert({
    where: { internalId: "atticus-g6-2026" },
    create: {
      internalId: "atticus-g6-2026",
      preferredName: "Atticus",
      gradeLevel: 6,
    },
    update: {},
  });

  const schoolYear = await prisma.schoolYear.upsert({
    where: { label: "2026-27" },
    create: {
      label: "2026-27",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2027-06-15"),
      studentId: student.id,
    },
    update: {},
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

  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId: student.id, date: parseDate("2026-08-27") } },
    create: {
      studentId: student.id,
      date: parseDate("2026-08-27"),
      status: "present",
    },
    update: {},
  });

  console.log("Ingesting curriculum...");
  try {
    await ingestAllCurriculum();
  } catch (err) {
    console.warn("Curriculum ingest skipped or partial:", err instanceof Error ? err.message : err);
  }

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
