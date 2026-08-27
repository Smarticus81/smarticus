import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { DailyScheduleSchema } from "../../shared/schemas/lesson.js";
import { uploadFileToVectorStore, pollVectorStoreFileStatus } from "../lib/openai.js";
import { log } from "../lib/logger.js";
import { env } from "../config/env.js";
import type { Subject } from "@prisma/client";

const CURRICULUM_ROOT = path.join(process.cwd(), "curriculum");

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

export async function ingestDailyFile(filePath: string) {
  const content = await readFile(filePath, "utf-8");
  const checksum = sha256(content);

  const existingDoc = await prisma.sourceDocument.findUnique({ where: { checksum } });
  if (existingDoc?.indexingStatus === "completed") {
    log({ message: "Skipping unchanged file", sourcePath: filePath, ingestionJobId: existingDoc.id });
    return { status: "skipped" as const, checksum };
  }

  const job = await prisma.ingestionJob.create({
    data: { sourcePath: filePath, checksum, status: "processing" },
  });

  try {
    const parsed = DailyScheduleSchema.parse(JSON.parse(content));
    const student = await prisma.student.findFirst({ where: { preferredName: "Atticus" } });
    if (!student) throw new Error("Student not seeded");

    let schoolYear = await prisma.schoolYear.findUnique({ where: { label: parsed.school_year } });
    if (!schoolYear) {
      schoolYear = await prisma.schoolYear.create({
        data: {
          label: parsed.school_year,
          startDate: new Date("2026-08-01"),
          endDate: new Date("2027-06-15"),
          studentId: student.id,
        },
      });
    }

    for (const lesson of parsed.lessons) {
      let course = await prisma.course.findFirst({
        where: { schoolYearId: schoolYear.id, subject: lesson.subject as Subject },
      });
      if (!course) {
        course = await prisma.course.create({
          data: {
            subject: lesson.subject as Subject,
            title: lesson.course,
            schoolYearId: schoolYear.id,
          },
        });
      }

      let unit = await prisma.unit.findFirst({
        where: { courseId: course.id, externalId: lesson.unit_id },
      });
      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            externalId: lesson.unit_id,
            title: lesson.unit_title,
            courseId: course.id,
          },
        });
      }

      const date = new Date(`${lesson.date}T00:00:00.000Z`);
      await prisma.lesson.upsert({
        where: { externalId: lesson.id },
        create: {
          externalId: lesson.id,
          date,
          schoolYear: lesson.school_year,
          gradeLevel: lesson.grade_level,
          subject: lesson.subject as Subject,
          course: lesson.course,
          unitId: unit.id,
          unitTitle: lesson.unit_title,
          lessonNumber: lesson.lesson_number,
          lessonTitle: lesson.lesson_title,
          standards: lesson.standards,
          previousLearning: lesson.previous_learning,
          courseContext: lesson.course_context,
          learningObjectives: lesson.learning_objectives,
          whyItMatters: lesson.why_it_matters,
          vocabulary: lesson.vocabulary,
          writtenInstruction: lesson.written_instruction,
          workedExamples: lesson.worked_examples,
          guidedPractice: lesson.guided_practice,
          independentPractice: lesson.independent_practice,
          exitTicket: lesson.exit_ticket,
          masteryThreshold: lesson.mastery_threshold,
          materials: lesson.materials,
          estimatedMinutes: lesson.estimated_minutes,
          voicePrompt: lesson.voice_prompt,
          teacherNotes: lesson.teacher_notes ?? "",
          answerKey: lesson.answer_key ?? {},
          sourceReferences: lesson.source_references,
          status: lesson.status as never,
          dayNumber: parsed.day_number,
          todaysGoal: parsed.todays_goal,
          checksum,
        },
        update: {
          date,
          lessonTitle: lesson.lesson_title,
          learningObjectives: lesson.learning_objectives,
          workedExamples: lesson.worked_examples,
          guidedPractice: lesson.guided_practice,
          independentPractice: lesson.independent_practice,
          exitTicket: lesson.exit_ticket,
          voicePrompt: lesson.voice_prompt,
          dayNumber: parsed.day_number,
          todaysGoal: parsed.todays_goal,
          checksum,
        },
      });

      const assignmentExternalId = `${lesson.id}-independent`;
      const lessonRow = await prisma.lesson.findUniqueOrThrow({ where: { externalId: lesson.id } });
      await prisma.assignment.upsert({
        where: { externalId: assignmentExternalId },
        create: {
          externalId: assignmentExternalId,
          lessonId: lessonRow.id,
          studentId: student.id,
          title: `${lesson.lesson_title} - Independent Practice`,
          instructions: lesson.independent_practice.map((p) => p.prompt).join("\n"),
          dueDate: date,
          completed: false,
        },
        update: {
          instructions: lesson.independent_practice.map((p) => p.prompt).join("\n"),
        },
      });
    }

    let vectorStatus: "pending" | "completed" | "failed" | "skipped" = "skipped";
    let openaiFileId: string | null = null;
    let vectorStoreFileId: string | null = null;

    if (env.OPENAI_API_KEY && env.OPENAI_VECTOR_STORE_ID) {
      const upload = await uploadFileToVectorStore({
        filename: path.basename(filePath),
        content: Buffer.from(content),
      });
      openaiFileId = upload.fileId;
      vectorStoreFileId = upload.vectorStoreFileId;
      if (vectorStoreFileId) {
        const polled = await pollVectorStoreFileStatus(vectorStoreFileId);
        vectorStatus = polled === "completed" ? "completed" : "failed";
      }
    }

    await prisma.sourceDocument.upsert({
      where: { sourcePath: filePath },
      create: {
        filename: path.basename(filePath),
        sourceType: "daily_curriculum",
        sourcePath: filePath,
        checksum,
        openaiFileId,
        vectorStoreFileId,
        indexingStatus: vectorStatus,
        ingestedAt: new Date(),
        metadata: { day_number: parsed.day_number },
      },
      update: {
        checksum,
        openaiFileId,
        vectorStoreFileId,
        indexingStatus: vectorStatus,
        ingestedAt: new Date(),
      },
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), message: `Ingested ${parsed.lessons.length} lessons` },
    });

    log({ message: "Curriculum ingested", sourcePath: filePath, ingestionJobId: job.id, toolOutcome: "success" });
    return { status: "completed" as const, checksum, lessons: parsed.lessons.length, vectorStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "failed", message, completedAt: new Date() },
    });
    log({ level: "error", message: "Ingestion failed", sourcePath: filePath, ingestionJobId: job.id, error: message });
    throw error;
  }
}

export async function ingestAllCurriculum() {
  const files = await walk(CURRICULUM_ROOT);
  const dailyFiles = files.filter((f) => f.includes(`${path.sep}daily${path.sep}`) && f.endsWith(".json"));
  const results = [];
  for (const file of dailyFiles) {
    results.push(await ingestDailyFile(file));
  }
  return results;
}

export async function ingestFileIfExists(filePath: string) {
  try {
    await stat(filePath);
    return ingestDailyFile(filePath);
  } catch {
    return { status: "skipped" as const, reason: "file not found" };
  }
}
