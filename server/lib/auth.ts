import { createHash } from "crypto";

export function hashSafetyIdentifier(internalStudentId: string): string {
  return createHash("sha256").update(`atticus:${internalStudentId}`).digest("hex");
}
