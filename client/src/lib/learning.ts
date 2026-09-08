import type { LessonView } from "./types";

export type ActivityKind =
  | "percent"
  | "ratio"
  | "fractions"
  | "color"
  | "reflection"
  | "materials"
  | "french"
  | "evaluation"
  | "algorithm"
  | "evidence"
  | "connections";

/** Choose an explanatory model from the actual lesson topic, never its calendar position. */
export function activityFor(
  lesson: Pick<LessonView, "subject" | "lesson_title" | "unit_title">,
): ActivityKind {
  const topic = lesson.lesson_title.toLowerCase();
  if (lesson.subject === "mathematics") {
    if (/percent/.test(topic)) return "percent";
    if (/ratio|unit rate/.test(topic)) return "ratio";
    if (/fraction/.test(topic)) return "fractions";
  }
  if (lesson.subject === "science")
    return /color|colour|filter|wavelength/.test(topic)
      ? "color"
      : /mirror|angle of reflection/.test(topic)
        ? "reflection"
        : "materials";
  if (lesson.subject === "french") return "french";
  if (lesson.subject === "computer_science")
    return /test|training|generalization|confidence|learning|overfitting/.test(
      topic,
    )
      ? "evaluation"
      : "algorithm";
  if (["literature", "writing"].includes(lesson.subject)) return "evidence";
  return "connections";
}

export function instructionBeats(text: string): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return paragraphs.flatMap((paragraph) => {
    if (paragraph.length < 220) return [paragraph];
    // Split only between sentences: decimals, punctuation and every source word survive.
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u);
    return sentences.map((sentence) => sentence.trim()).filter(Boolean);
  });
}

export const lightColors = [
  { name: "White", mask: 7, color: "#f5f2dd" },
  { name: "Red", mask: 4, color: "#e78174" },
  { name: "Green", mask: 2, color: "#9fc995" },
  { name: "Blue", mask: 1, color: "#a1b8e5" },
  { name: "Yellow", mask: 6, color: "#ead892" },
] as const;
export function transmittedLight(source: number, filter: number) {
  return source & filter;
}
export function reflectedLight(
  source: number,
  filter: number,
  surface: number,
) {
  return source & filter & surface;
}
export function lightAppearance(mask: number) {
  return (
    lightColors.find((color) => color.mask === mask) ?? {
      name: mask === 3 ? "Cyan" : mask === 5 ? "Magenta" : "Dark",
      mask,
      color: mask === 3 ? "#a0d5d0" : mask === 5 ? "#c4a4d9" : "#343a36",
    }
  );
}
export function percentPart(whole: number, percent: number) {
  return (whole * percent) / 100;
}
export function accuracy(predictions: boolean[], actual: boolean[]) {
  if (!actual.length) return 0;
  return (
    (actual.reduce(
      (correct, value, index) => correct + Number(predictions[index] === value),
      0,
    ) /
      actual.length) *
    100
  );
}
