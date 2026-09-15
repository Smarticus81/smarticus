import { z } from "zod";

/** Virtual board coordinates. Steps are laid out in this space and scaled to the canvas. */
export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 600;

const coordinate = z.number().min(-200).max(1400);
const color = z.string().max(40).nullable();
const label = z.string().max(120).nullable();
const boardText = z.string().min(1).max(400);

export const WhiteboardStepSchema = z.union([
  z
    .object({
      kind: z.literal("text"),
      x: coordinate,
      y: coordinate,
      text: boardText,
      size: z.number().min(10).max(96).nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("line"),
      x1: coordinate,
      y1: coordinate,
      x2: coordinate,
      y2: coordinate,
      arrow: z.boolean().nullable(),
      width: z.number().min(1).max(24).nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("rect"),
      x: coordinate,
      y: coordinate,
      w: z.number().min(1).max(1400),
      h: z.number().min(1).max(800),
      label,
      fill: z.boolean().nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("circle"),
      x: coordinate,
      y: coordinate,
      r: z.number().min(1).max(600),
      label,
      fill: z.boolean().nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("path"),
      points: z.array(coordinate).min(4).max(400),
      closed: z.boolean().nullable(),
      width: z.number().min(1).max(24).nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("number_line"),
      x: coordinate,
      y: coordinate,
      w: z.number().min(50).max(1400),
      min: z.number(),
      max: z.number(),
      step: z.number().positive().nullable(),
      marks: z.array(z.number()).max(40),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("fraction_bar"),
      x: coordinate,
      y: coordinate,
      w: z.number().min(20).max(1400),
      h: z.number().min(8).max(300),
      parts: z.number().int().min(1).max(60),
      shaded: z.number().int().min(0).max(60),
      label,
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("table"),
      x: coordinate,
      y: coordinate,
      rows: z.array(z.array(z.string().max(60)).min(1).max(8)).min(1).max(12),
      cell_width: z.number().min(30).max(400).nullable(),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("highlight"),
      x: coordinate,
      y: coordinate,
      w: z.number().min(1).max(1400),
      h: z.number().min(1).max(800),
      color,
    })
    .strict(),
  z
    .object({
      kind: z.literal("pause"),
      ms: z.number().min(0).max(4000),
    })
    .strict(),
]);

export type WhiteboardStep = z.infer<typeof WhiteboardStepSchema>;

export const WhiteboardDrawSchema = z
  .object({
    steps: z.array(WhiteboardStepSchema).min(1).max(60),
    clear_first: z.boolean(),
    caption: z.string().max(200).nullable(),
  })
  .strict();

export type WhiteboardDraw = z.infer<typeof WhiteboardDrawSchema>;

/** Short, speakable description of a step for transcripts and the backend model. */
export function describeStep(step: WhiteboardStep): string {
  switch (step.kind) {
    case "text":
      return `text "${step.text}" at (${Math.round(step.x)}, ${Math.round(step.y)})`;
    case "line":
      return `${step.arrow ? "arrow" : "line"} from (${Math.round(step.x1)}, ${Math.round(step.y1)}) to (${Math.round(step.x2)}, ${Math.round(step.y2)})`;
    case "rect":
      return `rectangle ${Math.round(step.w)}×${Math.round(step.h)} at (${Math.round(step.x)}, ${Math.round(step.y)})${step.label ? ` labeled "${step.label}"` : ""}`;
    case "circle":
      return `circle r=${Math.round(step.r)} at (${Math.round(step.x)}, ${Math.round(step.y)})${step.label ? ` labeled "${step.label}"` : ""}`;
    case "path":
      return `freehand path with ${Math.floor(step.points.length / 2)} points`;
    case "number_line":
      return `number line ${step.min} to ${step.max}${step.marks.length ? ` marking ${step.marks.join(", ")}` : ""}`;
    case "fraction_bar":
      return `fraction bar ${step.shaded}/${step.parts}${step.label ? ` labeled "${step.label}"` : ""}`;
    case "table":
      return `table with ${step.rows.length} rows: ${step.rows.map((row) => row.join(" | ")).join(" / ")}`;
    case "highlight":
      return `highlight ${Math.round(step.w)}×${Math.round(step.h)} at (${Math.round(step.x)}, ${Math.round(step.y)})`;
    case "pause":
      return `pause ${step.ms}ms`;
  }
}
