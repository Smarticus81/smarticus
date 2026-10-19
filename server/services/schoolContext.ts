import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";
import {
  BootstrapSchoolContextSchema, SchoolContextSchema,
  type SchoolContext,
} from "../../shared/schoolContext.js";

export class SchoolContextConflict extends Error {
  constructor() { super("The school plan changed. Reload before saving."); }
}

export function bootstrapMayApply(existing: { revision: number; bootstrapId: string | null; parentEdited: boolean } | null,
  input: { expectedRevision: number; importId: string }): boolean {
  if (!existing) return input.expectedRevision === 0;
  return !existing.parentEdited && existing.bootstrapId !== input.importId && existing.revision === input.expectedRevision;
}

export async function readSchoolContext() {
  const row = await prisma.privateSchoolContext.findUnique({ where: { id: "default" } });
  if (!row) return { context: null, revision: 0, updatedAt: null };
  const parsed = SchoolContextSchema.safeParse(row.content);
  if (!parsed.success) throw new Error("Stored school plan needs validation.");
  return { context: parsed.data, revision: row.revision, updatedAt: row.updatedAt.toISOString() };
}

export async function saveSchoolContext(context: SchoolContext, expectedRevision: number, bootstrapId?: string) {
  if (!env.PARENT_ACCESS_CODE) {
    throw new Error("Private school plans require configured parent sign-in.");
  }
  try {
    return await prisma.$transaction(async tx => {
      const existing = await tx.privateSchoolContext.findUnique({ where: { id: "default" } });
      if (bootstrapId && !bootstrapMayApply(existing, { expectedRevision, importId: bootstrapId })) return { applied: false };
      if ((existing?.revision ?? 0) !== expectedRevision) throw new SchoolContextConflict();
      const content = context as unknown as Prisma.InputJsonValue;
      if (existing) {
        const update = await tx.privateSchoolContext.updateMany({
          where: { id: "default", revision: expectedRevision, ...(bootstrapId ? { parentEdited: false } : {}) },
          data: { content, revision: { increment: 1 }, parentEdited: bootstrapId ? false : true,
            ...(bootstrapId ? { bootstrapId } : {}) },
        });
        if (update.count !== 1) throw new SchoolContextConflict();
      } else {
        await tx.privateSchoolContext.create({ data: {
          id: "default", content, revision: 1, parentEdited: !bootstrapId, bootstrapId: bootstrapId ?? null,
        } });
      }
      return { applied: true };
    }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof SchoolContextConflict || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw new SchoolContextConflict();
    }
    // Prisma validation/SQL exceptions can echo arguments. Never log the private payload.
    throw new Error("The private school plan could not be saved. Existing records were kept.");
  }
}

export async function bootstrapSchoolContext() {
  const raw = env.PRIVATE_SCHOOL_CONTEXT_JSON;
  if (!raw) return;
  // Keep this runtime-only value out of build output, logs, errors and responses.
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("Private school plan bootstrap JSON is invalid."); }
  const result = BootstrapSchoolContextSchema.safeParse(input);
  if (!result.success) throw new Error("Private school plan bootstrap validation failed.");
  try {
    const saved = await saveSchoolContext(result.data.context, result.data.expectedRevision, result.data.importId);
    log({ message: saved.applied ? "Private school plan bootstrap applied" : "Private school plan bootstrap skipped", toolOutcome: "success" });
  } catch (error) {
    if (error instanceof SchoolContextConflict) {
      // A concurrent importer or parent edit won. Preserve it and keep serving.
      log({ message: "Private school plan bootstrap skipped after concurrent update", toolOutcome: "success" });
      return;
    }
    throw error;
  }
}
