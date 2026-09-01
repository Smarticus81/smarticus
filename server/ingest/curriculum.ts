import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { DailyScheduleSchema } from "../../shared/schemas/lesson.js";
import {
  uploadFileToVectorStore,
  pollVectorStoreFileStatus,
  removeVectorStoreFile,
  type VectorFileAttributes,
} from "../lib/openai.js";
import { log } from "../lib/logger.js";
import { env } from "../config/env.js";
import type { Subject } from "@prisma/client";
import { PdfReader } from "pdfreader";

const CURRICULUM_ROOT = path.join(process.cwd(), "curriculum");
const REFERENCE_ROOT = path.join(CURRICULUM_ROOT, "2026-27", "reference");
const REFERENCE_MANIFEST = path.join(REFERENCE_ROOT, "vector-manifest.json");
const sourceIngestionLocks = new Map<string, Promise<unknown>>();

type ReferenceManifestEntry = {
  path: string;
  attributes: VectorFileAttributes;
};

type ReferenceManifest = {
  files: ReferenceManifestEntry[];
};

type IngestionResult = {
  status: "skipped" | "completed";
  checksum: string;
  lessons?: number;
  vectorStatus?: "pending" | "completed" | "failed" | "skipped";
};

async function withSourceIngestionLock<T>(
  sourcePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(sourcePath);
  const existing = sourceIngestionLocks.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const running = operation().finally(() => {
    if (sourceIngestionLocks.get(key) === running) {
      sourceIngestionLocks.delete(key);
    }
  });
  sourceIngestionLocks.set(key, running);
  return running;
}

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

function makeStudentSafeDailyDocument(parsed: ReturnType<typeof DailyScheduleSchema.parse>) {
  return {
    ...parsed,
    lessons: parsed.lessons.map((lesson) => ({
      ...lesson,
      guided_practice: lesson.guided_practice.map(({ answer: _answer, ...item }) => item),
      independent_practice: lesson.independent_practice.map(({ answer: _answer, ...item }) => item),
      exit_ticket: lesson.exit_ticket.map(({ answer: _answer, ...item }) => item),
      answer_key: {},
      teacher_notes: "",
    })),
  };
}

async function prepareReplacement(sourcePath: string, checksum: string) {
  const existingDoc = await prisma.sourceDocument.findUnique({ where: { sourcePath } });
  if (existingDoc?.checksum === checksum && existingDoc.indexingStatus === "completed") {
    return { existingDoc, skip: true as const };
  }

  if (existingDoc?.vectorStoreFileId && existingDoc.checksum !== checksum) {
    await removeVectorStoreFile(existingDoc.vectorStoreFileId);
  }

  return { existingDoc, skip: false as const };
}

async function uploadAndPoll(params: {
  filename: string;
  content: Buffer;
  attributes: VectorFileAttributes;
}) {
  let vectorStatus: "pending" | "completed" | "failed" | "skipped" = "skipped";
  let openaiFileId: string | null = null;
  let vectorStoreFileId: string | null = null;

  if (env.OPENAI_API_KEY && env.OPENAI_VECTOR_STORE_ID) {
    const upload = await uploadFileToVectorStore({
      filename: params.filename,
      content: params.content,
      attributes: params.attributes,
    });
    openaiFileId = upload.fileId;
    vectorStoreFileId = upload.vectorStoreFileId;
    if (vectorStoreFileId) {
      const polled = await pollVectorStoreFileStatus(vectorStoreFileId);
      vectorStatus = polled === "completed" ? "completed" : "failed";
    }
  }

  return { vectorStatus, openaiFileId, vectorStoreFileId };
}

async function extractPdfText(filePath: string) {
  const content = await readFile(filePath);
  return new Promise<string>((resolve, reject) => {
    const lines: string[] = [];
    new PdfReader().parseBuffer(content, (error, item) => {
      if (error) {
        reject(new Error(String(error)));
      } else if (item?.text) {
        lines.push(item.text);
      } else if (item === undefined) {
        resolve(lines.join(" ").replace(/\s+/g, " ").trim());
      }
    });
  });
}

function pdfDate(filePath: string) {
  const match = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error(`PDF filename must include a date: ${path.basename(filePath)}`);
  return match[1];
}

function makeStudentSafePdfText(text: string) {
  const protectedSection = text.search(
    /\bPARENT\b.{0,80}\b(?:ANSWER\s+KEY|TEACHER\s+KEY)\b/i,
  );
  return {
    text: (protectedSection >= 0 ? text.slice(0, protectedSection) : text).trim(),
    protectedSectionRemoved: protectedSection >= 0,
  };
}

async function preparePdfReplacement(sourcePath: string, checksum: string) {
  const existingDoc = await prisma.sourceDocument.findUnique({ where: { sourcePath } });
  const metadata =
    existingDoc?.metadata &&
    typeof existingDoc.metadata === "object" &&
    !Array.isArray(existingDoc.metadata)
      ? existingDoc.metadata
      : {};
  const alreadySanitized = metadata.protected_sections_removed === true;

  if (
    existingDoc?.checksum === checksum &&
    existingDoc.indexingStatus === "completed" &&
    alreadySanitized
  ) {
    return { existingDoc, skip: true as const };
  }

  if (existingDoc?.vectorStoreFileId) {
    await removeVectorStoreFile(existingDoc.vectorStoreFileId);
  }
  return { existingDoc, skip: false as const };
}

async function ingestPdfFileUnlocked(filePath: string) {
  const content = await readFile(filePath);
  const checksum = sha256(content);
  const replacement = await preparePdfReplacement(filePath, checksum);
  if (replacement.skip) return { status: "skipped" as const, checksum };

  const job = await prisma.ingestionJob.create({
    data: { sourcePath: filePath, checksum, status: "processing" },
  });

  try {
    const dateString = pdfDate(filePath);
    const extracted = await extractPdfText(filePath);
    const safePacket = makeStudentSafePdfText(extracted);
    if (!safePacket.text) {
      throw new Error(`PDF has no student-safe content: ${path.basename(filePath)}`);
    }

    const externalId = `pdf-${sha256(filePath).slice(0, 24)}`;
    const legacyLesson = await prisma.lesson.findUnique({
      where: { externalId },
      select: { id: true, unitId: true },
    });
    if (legacyLesson) {
      await prisma.lesson.delete({ where: { id: legacyLesson.id } });
      await prisma.unit.deleteMany({
        where: { id: legacyLesson.unitId, lessons: { none: {} } },
      });
    }

    const uploaded = await uploadAndPoll({
      filename: `${path.basename(filePath, ".pdf")}.txt`,
      content: Buffer.from(safePacket.text),
      attributes: { document_type: "daily_curriculum", school_year: "2026-27", date: dateString, subject: "multi", access: "student", status: "current" },
    });
    const metadata = {
      student_safe_text: true,
      protected_sections_removed: true,
      protected_section_found: safePacket.protectedSectionRemoved,
      structured_daily_source: `${dateString}.json`,
    };
    await prisma.sourceDocument.upsert({
      where: { sourcePath: filePath },
      create: { filename: path.basename(filePath), sourceType: "daily_curriculum_pdf", sourcePath: filePath, checksum, openaiFileId: uploaded.openaiFileId, vectorStoreFileId: uploaded.vectorStoreFileId, indexingStatus: uploaded.vectorStatus, ingestedAt: new Date(), metadata },
      update: { checksum, openaiFileId: uploaded.openaiFileId, vectorStoreFileId: uploaded.vectorStoreFileId, indexingStatus: uploaded.vectorStatus, ingestedAt: new Date(), metadata },
    });
    await prisma.ingestionJob.update({ where: { id: job.id }, data: { status: "completed", completedAt: new Date(), message: "Ingested sanitized PDF learning packet" } });
    return { status: "completed" as const, checksum, lessons: 0, vectorStatus: uploaded.vectorStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionJob.update({ where: { id: job.id }, data: { status: "failed", message, completedAt: new Date() } });
    throw error;
  }
}

export function ingestPdfFile(filePath: string) {
  return withSourceIngestionLock(filePath, () => ingestPdfFileUnlocked(filePath));
}

async function ingestDailyFileUnlocked(filePath: string) {
  const content = await readFile(filePath, "utf-8");
  const checksum = sha256(content);
  const replacement = await prepareReplacement(filePath, checksum);
  if (replacement.skip) {
    log({ message: "Skipping unchanged file", sourcePath: filePath, ingestionJobId: replacement.existingDoc?.id });
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
          startDate: new Date("2026-08-25"),
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

    // The database stores protected answers. The vector store receives only the student-safe form.
    const safeContent = Buffer.from(JSON.stringify(makeStudentSafeDailyDocument(parsed), null, 2));
    const uploaded = await uploadAndPoll({
      filename: `${path.basename(filePath, ".json")}.student.json`,
      content: safeContent,
      attributes: {
        document_type: "daily_curriculum",
        school_year: parsed.school_year,
        grade: parsed.grade_level,
        date: parsed.date,
        subject: "multi",
        access: "student",
        status: "current",
      },
    });

    await prisma.sourceDocument.upsert({
      where: { sourcePath: filePath },
      create: {
        filename: path.basename(filePath),
        sourceType: "daily_curriculum",
        sourcePath: filePath,
        checksum,
        openaiFileId: uploaded.openaiFileId,
        vectorStoreFileId: uploaded.vectorStoreFileId,
        indexingStatus: uploaded.vectorStatus,
        ingestedAt: new Date(),
        metadata: { day_number: parsed.day_number, student_safe_vector_copy: true },
      },
      update: {
        checksum,
        openaiFileId: uploaded.openaiFileId,
        vectorStoreFileId: uploaded.vectorStoreFileId,
        indexingStatus: uploaded.vectorStatus,
        ingestedAt: new Date(),
        metadata: { day_number: parsed.day_number, student_safe_vector_copy: true },
      },
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), message: `Ingested ${parsed.lessons.length} lessons` },
    });

    log({ message: "Curriculum ingested", sourcePath: filePath, ingestionJobId: job.id, toolOutcome: "success" });
    return { status: "completed" as const, checksum, lessons: parsed.lessons.length, vectorStatus: uploaded.vectorStatus };
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

export function ingestDailyFile(filePath: string) {
  return withSourceIngestionLock(filePath, () => ingestDailyFileUnlocked(filePath));
}

export async function ingestReferenceFile(filePath: string, attributes: VectorFileAttributes) {
  const content = await readFile(filePath);
  const checksum = sha256(content);
  const replacement = await prepareReplacement(filePath, checksum);
  if (replacement.skip) {
    return { status: "skipped" as const, checksum };
  }

  const job = await prisma.ingestionJob.create({
    data: { sourcePath: filePath, checksum, status: "processing", metadata: attributes },
  });

  try {
    const uploaded = await uploadAndPoll({
      filename: path.basename(filePath),
      content,
      attributes,
    });

    await prisma.sourceDocument.upsert({
      where: { sourcePath: filePath },
      create: {
        filename: path.basename(filePath),
        sourceType: String(attributes.document_type ?? "reference"),
        sourcePath: filePath,
        checksum,
        openaiFileId: uploaded.openaiFileId,
        vectorStoreFileId: uploaded.vectorStoreFileId,
        indexingStatus: uploaded.vectorStatus,
        ingestedAt: new Date(),
        metadata: attributes,
      },
      update: {
        checksum,
        openaiFileId: uploaded.openaiFileId,
        vectorStoreFileId: uploaded.vectorStoreFileId,
        indexingStatus: uploaded.vectorStatus,
        ingestedAt: new Date(),
        metadata: attributes,
      },
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), message: "Reference document ingested" },
    });

    return { status: "completed" as const, checksum, vectorStatus: uploaded.vectorStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "failed", message, completedAt: new Date() },
    });
    throw error;
  }
}

async function ingestReferenceManifest() {
  try {
    const manifest = JSON.parse(await readFile(REFERENCE_MANIFEST, "utf-8")) as ReferenceManifest;
    const results = [];
    for (const entry of manifest.files) {
      const filePath = path.join(REFERENCE_ROOT, entry.path);
      results.push(await ingestReferenceFile(filePath, entry.attributes));
    }
    return results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function ingestDailyCurriculum() {
  const files = await walk(CURRICULUM_ROOT);
  const dailyFiles = files
    .filter((f) => f.includes(`${path.sep}daily${path.sep}`) && f.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a));
  const results = [];
  for (const file of dailyFiles) {
    results.push(await ingestDailyFile(file));
  }
  return results;
}

export async function ingestAllCurriculum() {
  const files = await walk(CURRICULUM_ROOT);
  const pdfFiles = files.filter((f) => f.includes(`${path.sep}daily${path.sep}`) && f.endsWith(".pdf"));
  const results: IngestionResult[] = await ingestDailyCurriculum();
  for (const file of pdfFiles) {
    results.push(await ingestPdfFile(file));
  }
  results.push(...(await ingestReferenceManifest()));
  return results;
}

export async function ingestCurriculumFileIfExists(filePath: string) {
  try {
    await stat(filePath);
    if (filePath.endsWith(".json")) return ingestDailyFile(filePath);
    if (filePath.endsWith(".pdf")) return ingestPdfFile(filePath);
    return { status: "skipped" as const, reason: "unsupported curriculum file" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { status: "skipped" as const, reason: "file not found" };
  }
}

export function ingestDailyDate(date: string) {
  return ingestCurriculumFileIfExists(
    path.join(CURRICULUM_ROOT, "2026-27", "daily", `${date}.json`),
  );
}

export const ingestFileIfExists = ingestCurriculumFileIfExists;
