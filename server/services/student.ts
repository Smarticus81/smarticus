import { prisma } from "../lib/prisma.js";
import type { Subject } from "@prisma/client";

export async function getDefaultStudent() {
  const student = await prisma.student.findFirst({
    where: { preferredName: "Atticus" },
  });
  if (!student) {
    throw new Error("Default student not found. Run db:seed first.");
  }
  return student;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function subjectToPrisma(subject: string): Subject {
  return subject as Subject;
}

export async function getParentSettings() {
  let settings = await prisma.parentSetting.findFirst();
  if (!settings) {
    settings = await prisma.parentSetting.create({ data: {} });
  }
  return settings;
}

export async function ensureStudentSession(studentId: string) {
  return prisma.student.findUniqueOrThrow({ where: { id: studentId } });
}
