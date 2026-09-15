import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  describeStep,
  type WhiteboardStep,
} from "../../../shared/voice/whiteboard";

export type BoardAuthor = "virgil" | "student";

export interface BoardOp {
  id: number;
  author: BoardAuthor;
  step: WhiteboardStep;
  /** Timestamp when the animation started; null while queued. */
  startedAt: number | null;
  /** Animation length in ms. 0 renders instantly. */
  duration: number;
}

export const INK = "#1f2a24";
export const STUDENT_INK = "#2f6fd6";
const HIGHLIGHT = "rgba(213, 238, 167, 0.55)";
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** How long the tutor spends "drawing" a step, so writing feels live. */
export function stepDuration(step: WhiteboardStep, speed = 1): number {
  const scale = speed > 0 ? 1 / speed : 1;
  switch (step.kind) {
    case "text":
      return Math.max(320, step.text.length * 42) * scale;
    case "line":
      return Math.max(260, distance(step.x1, step.y1, step.x2, step.y2) * 1.6) * scale;
    case "rect":
      return Math.max(420, (step.w + step.h) * 2 * 0.9) * scale;
    case "circle":
      return Math.max(420, 2 * Math.PI * step.r * 0.9) * scale;
    case "path": {
      let length = 0;
      for (let index = 2; index + 1 < step.points.length; index += 2) {
        length += distance(
          step.points[index - 2],
          step.points[index - 1],
          step.points[index],
          step.points[index + 1],
        );
      }
      return Math.max(240, length * 1.4) * scale;
    }
    case "number_line":
      return Math.max(600, step.w * 1.2 + step.marks.length * 160) * scale;
    case "fraction_bar":
      return Math.max(600, step.parts * 90 + 400) * scale;
    case "table":
      return Math.max(600, step.rows.flat().join("").length * 30 + step.rows.length * 200) * scale;
    case "highlight":
      return 420 * scale;
    case "pause":
      return step.ms;
  }
}

export function opProgress(op: BoardOp, now: number): number {
  if (op.startedAt === null) return 0;
  if (op.duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - op.startedAt) / op.duration));
}

export interface PenPosition {
  x: number;
  y: number;
}

interface RenderResult {
  animating: boolean;
  pen: PenPosition | null;
}

/**
 * Hand motion accelerates quickly and settles slowly; a symmetric ease reads
 * mechanical. This starts fast and eases out, like a pen finishing a stroke.
 */
function ease(progress: number) {
  return 1 - (1 - progress) ** 2.6;
}

function strokeStyle(ctx: CanvasRenderingContext2D, color: string | null | undefined, width: number) {
  ctx.strokeStyle = color || INK;
  ctx.fillStyle = color || INK;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // A soft, tight shadow lifts ink off the paper without looking like a glow.
  ctx.shadowColor = "rgba(31, 42, 36, 0.16)";
  ctx.shadowBlur = Math.max(1.5, width * 0.5);
  ctx.shadowOffsetY = 0.6;
}

/** Draw the first `progress` fraction of the current path using a dash trick. */
function strokePartial(ctx: CanvasRenderingContext2D, length: number, progress: number) {
  if (progress >= 1) {
    ctx.setLineDash([]);
    ctx.stroke();
    return;
  }
  ctx.setLineDash([Math.max(0, length * progress), length + 10]);
  ctx.lineDashOffset = 0;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string | null | undefined,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `560 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color || INK;
  ctx.shadowColor = "rgba(31, 42, 36, 0.14)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 0.6;
  ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function pointAlongPolyline(points: number[], progress: number): PenPosition {
  const segments: number[] = [];
  let total = 0;
  for (let index = 2; index + 1 < points.length; index += 2) {
    const length = distance(points[index - 2], points[index - 1], points[index], points[index + 1]);
    segments.push(length);
    total += length;
  }
  let remaining = total * progress;
  for (let index = 0; index < segments.length; index += 1) {
    if (remaining <= segments[index] || index === segments.length - 1) {
      const t = segments[index] ? Math.min(1, remaining / segments[index]) : 1;
      const x1 = points[index * 2];
      const y1 = points[index * 2 + 1];
      const x2 = points[index * 2 + 2];
      const y2 = points[index * 2 + 3];
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    }
    remaining -= segments[index];
  }
  return { x: points[0] ?? 0, y: points[1] ?? 0 };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawStep(ctx: CanvasRenderingContext2D, op: BoardOp, progress: number): PenPosition | null {
  const step = op.step;
  const eased = ease(progress);
  switch (step.kind) {
    case "text": {
      const size = step.size ?? 30;
      const visibleChars = Math.ceil(step.text.length * eased);
      const shown = step.text.slice(0, visibleChars);
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = step.color || INK;
      ctx.shadowColor = "rgba(31, 42, 36, 0.14)";
      ctx.shadowBlur = 2.2;
      ctx.shadowOffsetY = 0.7;
      const lines = shown.split("\n");
      lines.forEach((line, index) => ctx.fillText(line, step.x, step.y + index * size * 1.3));
      const last = lines[lines.length - 1] ?? "";
      return progress < 1
        ? { x: step.x + ctx.measureText(last).width, y: step.y + (lines.length - 1) * size * 1.3 - size * 0.35 }
        : null;
    }
    case "line": {
      strokeStyle(ctx, step.color, step.width ?? 4);
      const length = distance(step.x1, step.y1, step.x2, step.y2);
      ctx.beginPath();
      ctx.moveTo(step.x1, step.y1);
      ctx.lineTo(step.x2, step.y2);
      strokePartial(ctx, length, eased);
      if (step.arrow && progress >= 1) drawArrowHead(ctx, step.x1, step.y1, step.x2, step.y2, 14 + (step.width ?? 4));
      return progress < 1
        ? { x: step.x1 + (step.x2 - step.x1) * eased, y: step.y1 + (step.y2 - step.y1) * eased }
        : null;
    }
    case "rect": {
      strokeStyle(ctx, step.color, 4);
      const perimeter = 2 * (step.w + step.h);
      ctx.beginPath();
      ctx.rect(step.x, step.y, step.w, step.h);
      if (step.fill && progress >= 1) {
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      strokePartial(ctx, perimeter, eased);
      if (step.label && progress >= 1)
        drawLabel(ctx, step.label, step.x + step.w / 2, step.y + step.h / 2, Math.min(28, step.h * 0.5), step.color);
      const points = [step.x, step.y, step.x + step.w, step.y, step.x + step.w, step.y + step.h, step.x, step.y + step.h, step.x, step.y];
      return progress < 1 ? pointAlongPolyline(points, eased) : null;
    }
    case "circle": {
      strokeStyle(ctx, step.color, 4);
      const circumference = 2 * Math.PI * step.r;
      ctx.beginPath();
      ctx.arc(step.x, step.y, step.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
      if (step.fill && progress >= 1) {
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      strokePartial(ctx, circumference, eased);
      if (step.label && progress >= 1) drawLabel(ctx, step.label, step.x, step.y, Math.min(28, step.r * 0.7), step.color);
      const angle = -Math.PI / 2 + Math.PI * 2 * eased;
      return progress < 1 ? { x: step.x + step.r * Math.cos(angle), y: step.y + step.r * Math.sin(angle) } : null;
    }
    case "path": {
      strokeStyle(ctx, step.color, step.width ?? 4);
      const points = step.closed ? [...step.points, step.points[0], step.points[1]] : step.points;
      let length = 0;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let index = 2; index + 1 < points.length; index += 2) {
        ctx.lineTo(points[index], points[index + 1]);
        length += distance(points[index - 2], points[index - 1], points[index], points[index + 1]);
      }
      strokePartial(ctx, length, op.author === "student" ? 1 : eased);
      return progress < 1 && op.author !== "student" ? pointAlongPolyline(points, eased) : null;
    }
    case "number_line": {
      strokeStyle(ctx, step.color, 4);
      const lineShare = 0.45;
      const lineProgress = Math.min(1, eased / lineShare);
      ctx.beginPath();
      ctx.moveTo(step.x, step.y);
      ctx.lineTo(step.x + step.w, step.y);
      strokePartial(ctx, step.w, lineProgress);
      if (lineProgress >= 1) {
        drawArrowHead(ctx, step.x, step.y, step.x + step.w, step.y, 14);
        drawArrowHead(ctx, step.x + step.w, step.y, step.x, step.y, 14);
      }
      const range = step.max - step.min || 1;
      const tickStep = step.step ?? (range > 12 ? Math.ceil(range / 10) : 1);
      const ticks: number[] = [];
      for (let value = step.min; value <= step.max + 1e-9; value += tickStep) ticks.push(Number(value.toFixed(6)));
      const tickProgress = Math.max(0, (eased - lineShare) / (1 - lineShare));
      const shownTicks = Math.floor(ticks.length * Math.min(1, tickProgress / 0.6));
      ticks.slice(0, shownTicks).forEach((value) => {
        const x = step.x + ((value - step.min) / range) * step.w;
        ctx.beginPath();
        ctx.moveTo(x, step.y - 10);
        ctx.lineTo(x, step.y + 10);
        ctx.stroke();
        drawLabel(ctx, String(value), x, step.y + 30, 18, step.color);
      });
      const markProgress = Math.max(0, (tickProgress - 0.6) / 0.4);
      const shownMarks = Math.floor(step.marks.length * markProgress + 1e-9);
      step.marks.slice(0, shownMarks).forEach((value) => {
        const x = step.x + ((value - step.min) / range) * step.w;
        ctx.beginPath();
        ctx.fillStyle = "#c2452b";
        ctx.arc(x, step.y, 9, 0, Math.PI * 2);
        ctx.fill();
        drawLabel(ctx, String(value), x, step.y - 28, 20, "#c2452b");
      });
      return progress < 1 ? { x: step.x + step.w * Math.min(1, eased / lineShare), y: step.y } : null;
    }
    case "fraction_bar": {
      strokeStyle(ctx, step.color, 4);
      const outline = Math.min(1, eased / 0.3);
      ctx.beginPath();
      ctx.rect(step.x, step.y, step.w, step.h);
      strokePartial(ctx, 2 * (step.w + step.h), outline);
      const partWidth = step.w / step.parts;
      const partsProgress = Math.max(0, (eased - 0.3) / 0.7);
      const shownDividers = Math.floor((step.parts - 1) * Math.min(1, partsProgress / 0.5));
      for (let index = 1; index <= shownDividers; index += 1) {
        ctx.beginPath();
        ctx.moveTo(step.x + partWidth * index, step.y);
        ctx.lineTo(step.x + partWidth * index, step.y + step.h);
        ctx.stroke();
      }
      const shadeProgress = Math.max(0, (partsProgress - 0.5) / 0.5);
      const shaded = Math.min(step.shaded, step.parts);
      const shadedWidth = partWidth * shaded * shadeProgress;
      if (shadedWidth > 0) {
        ctx.fillStyle = step.color || "#2f6fd6";
        ctx.globalAlpha = 0.35;
        ctx.fillRect(step.x, step.y, shadedWidth, step.h);
        ctx.globalAlpha = 1;
      }
      if (progress >= 1) {
        const label = step.label ?? `${step.shaded}/${step.parts}`;
        drawLabel(ctx, label, step.x + step.w / 2, step.y + step.h + 26, 22, step.color);
      }
      return progress < 1 ? { x: step.x + step.w * Math.min(1, eased), y: step.y + step.h / 2 } : null;
    }
    case "table": {
      const cellWidth = step.cell_width ?? Math.min(220, Math.max(90, 620 / (step.rows[0]?.length ?? 1)));
      const cellHeight = 44;
      const columns = Math.max(...step.rows.map((row) => row.length));
      strokeStyle(ctx, step.color, 2.5);
      const totalCells = step.rows.length * columns;
      const shownCells = Math.ceil(totalCells * eased);
      let count = 0;
      step.rows.forEach((row, rowIndex) => {
        for (let column = 0; column < columns; column += 1) {
          if (count >= shownCells) return;
          count += 1;
          const x = step.x + column * cellWidth;
          const y = step.y + rowIndex * cellHeight;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
          if (rowIndex === 0) {
            ctx.globalAlpha = 0.12;
            ctx.fillRect(x, y, cellWidth, cellHeight);
            ctx.globalAlpha = 1;
          }
          drawLabel(ctx, row[column] ?? "", x + cellWidth / 2, y + cellHeight / 2, 18, step.color);
        }
      });
      const index = Math.max(0, shownCells - 1);
      return progress < 1
        ? {
            x: step.x + ((index % columns) + 0.5) * cellWidth,
            y: step.y + (Math.floor(index / columns) + 0.5) * cellHeight,
          }
        : null;
    }
    case "highlight": {
      ctx.fillStyle = step.color || HIGHLIGHT;
      ctx.globalAlpha = step.color ? 0.28 : 1;
      ctx.fillRect(step.x, step.y, step.w * eased, step.h);
      ctx.globalAlpha = 1;
      return progress < 1 ? { x: step.x + step.w * eased, y: step.y + step.h / 2 } : null;
    }
    case "pause":
      return null;
  }
}

/**
 * Render every op onto a canvas context scaled from board units. Ops animate
 * sequentially per author queue; the caller advances `startedAt`.
 */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  ops: readonly BoardOp[],
  now: number,
  width: number,
  height: number,
): RenderResult {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  // Warm paper with a faint vignette, so the board reads as a surface in the
  // room rather than a flat white rectangle.
  const paper = ctx.createLinearGradient(0, 0, 0, height);
  paper.addColorStop(0, "#fdfdfa");
  paper.addColorStop(1, "#f6f7ef");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT);
  ctx.scale(scale, scale);
  // Faint dotted grid so drawings feel anchored.
  ctx.fillStyle = "#e6ebdd";
  for (let x = 50; x < BOARD_WIDTH; x += 50)
    for (let y = 50; y < BOARD_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

  let animating = false;
  let pen: PenPosition | null = null;
  for (const op of ops) {
    if (op.startedAt === null) {
      animating = true;
      continue;
    }
    const progress = opProgress(op, now);
    if (progress < 1) animating = true;
    // Each step starts from a clean shadow so fills and highlights never
    // inherit the ink lift from the stroke before them.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const tip = drawStep(ctx, op, progress);
    if (tip && progress < 1) pen = tip;
  }
  if (pen) {
    // A glow plus a solid nib, so the eye can follow where she is writing.
    ctx.shadowColor = "transparent";
    const halo = ctx.createRadialGradient(pen.x, pen.y, 1, pen.x, pen.y, 16);
    halo.addColorStop(0, "rgba(194, 69, 43, 0.35)");
    halo.addColorStop(1, "rgba(194, 69, 43, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(pen.x, pen.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#c2452b";
    ctx.arc(pen.x, pen.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return { animating, pen };
}

/** Start queued ops in order once the previous one has finished. Returns true if anything changed. */
export function advanceQueue(ops: BoardOp[], now: number): boolean {
  let changed = false;
  let previousDone = true;
  for (const op of ops) {
    if (op.startedAt === null) {
      if (previousDone) {
        op.startedAt = now;
        changed = true;
      } else break;
    }
    previousDone = opProgress(op, now) >= 1;
  }
  return changed;
}

export function summarizeBoard(ops: readonly BoardOp[]): string {
  if (!ops.length) return "The whiteboard is empty.";
  const lines = ops.map((op, index) => `${index + 1}. ${op.author === "student" ? "Atticus drew" : "Virgil drew"} ${describeStep(op.step)}`);
  return `Whiteboard contents (${ops.length} items, board is ${BOARD_WIDTH}×${BOARD_HEIGHT}):\n${lines.join("\n")}`;
}

/** Simplify a freehand stroke so student drawings stay light. */
export function simplifyStroke(points: number[], tolerance = 1.5): number[] {
  if (points.length <= 4) return points;
  const result = [points[0], points[1]];
  for (let index = 2; index + 1 < points.length; index += 2) {
    const lastX = result[result.length - 2];
    const lastY = result[result.length - 1];
    if (distance(lastX, lastY, points[index], points[index + 1]) >= tolerance) {
      result.push(points[index], points[index + 1]);
    }
  }
  if (result[result.length - 2] !== points[points.length - 2] || result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 2], points[points.length - 1]);
  }
  return result;
}
