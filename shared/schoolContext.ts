import { z } from "zod";
import { SubjectEnum } from "./schemas/lesson.js";

const text = (max: number) => z.string().trim().max(max);
const httpsUrl = z.string().url().max(1500).refine(value => new URL(value).protocol === "https:", "Use an HTTPS source URL");
const zone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Use an IANA time zone").nullable();
export const VerificationSchema = z.enum(["verified", "reported", "unconfirmed"]);
export const SchoolAssignmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  title: text(240).min(1),
  unit: text(200),
  kind: z.enum(["lesson", "practice", "assessment", "project", "reading", "activity"]),
  status: z.enum(["current", "next", "later", "complete", "skipped"]),
  instructions: z.array(text(1400)).min(1).max(12),
  tutoringFocus: text(1200),
  sequence: z.number().int().min(0),
  sourceUrl: httpsUrl.optional(),
  timingNote: text(500),
}).strict();
export type SchoolAssignment = z.infer<typeof SchoolAssignmentSchema>;

export const SchoolContextSchema = z.object({
  schemaVersion: z.literal(1),
  active: z.boolean(),
  sourceName: text(160).min(1),
  schoolYear: z.string().regex(/^\d{4}-\d{2}$/),
  asOf: z.string().datetime({ offset: true }),
  timeZone: zone,
  timezoneNote: text(600),
  summary: text(1800),
  assignments: z.array(SchoolAssignmentSchema).max(100).default([]),
  courses: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
    label: text(180).min(1),
    subject: SubjectEnum,
    focus: text(1200),
    units: z.array(text(300)).max(20),
    instructions: z.array(text(700)).max(12),
    sourceUrl: httpsUrl.optional(),
  }).strict()).min(1).max(15),
  schedule: z.array(z.object({
    label: text(200).min(1),
    when: text(500),
    timeZone: zone,
    verification: VerificationSchema,
    notes: text(1000),
    sourceUrl: httpsUrl.optional(),
  }).strict()).max(30),
  workload: z.array(z.object({
    label: text(200).min(1),
    detail: text(1200),
    verification: VerificationSchema,
  }).strict()).max(20),
  cautions: z.array(text(1000)).max(20),
  sources: z.array(z.object({
    label: text(200).min(1),
    url: httpsUrl,
    checkedAt: z.string().datetime({ offset: true }),
  }).strict()).max(30),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.courses.map(course => course.id)).size !== value.courses.length) {
    ctx.addIssue({ code: "custom", message: "Course IDs must be unique", path: ["courses"] });
  }
  if (new Set(value.assignments.map(item => item.id)).size !== value.assignments.length) {
    ctx.addIssue({ code: "custom", message: "Assignment IDs must be unique", path: ["assignments"] });
  }
  const courseIds = new Set(value.courses.map(course => course.id));
  if (value.assignments.some(item => !courseIds.has(item.courseId))) {
    ctx.addIssue({ code: "custom", message: "Assignments must refer to a listed course", path: ["assignments"] });
  }
  if (JSON.stringify(value).length > 50000) {
    ctx.addIssue({ code: "custom", message: "School context is too large" });
  }
});
export type SchoolContext = z.infer<typeof SchoolContextSchema>;
export const SaveSchoolContextSchema = z.object({
  expectedRevision: z.number().int().min(0),
  context: SchoolContextSchema,
}).strict();
export const BootstrapSchoolContextSchema = SaveSchoolContextSchema.extend({
  importId: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
}).strict();
export type SchoolContextState = {
  context: SchoolContext | null;
  revision: number;
  updatedAt: string | null;
  lessons: unknown[];
};
