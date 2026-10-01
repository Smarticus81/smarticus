import type { LessonView } from "../../lib/types";

const day27Pictures: Record<string, Array<{ file: string; caption: string }>> = {
  mathematics: [
    { file: "mathematics", caption: "The rectangle has 18 one-by-one squares. The diagonal makes two matching triangles, so each triangle covers 9 square units." },
    { file: "coordinates", caption: "Width compares the first numbers, 10 and 4. Height compares the second numbers, 4 and 1. Find the side lengths before multiplying." },
  ],
  writing: [{ file: "writing", caption: "Evidence says what happened. Reasoning names the idea that the result supports and explains why." }],
  science: [{ file: "science", caption: "The dashed normal makes a square corner with the mirror. Measure angles from this line. In the two-mirror model, the light turns at both hit points." }],
  french: [{ file: "french", caption: "Tu keeps vas when you add Est-ce que. The basic action word stays the same." }],
  history_geography: [{ file: "history_geography", caption: "A river, farmland, or hills offer an opportunity. People still need to use the river, grow the food, or build the defenses." }],
  literature: [{ file: "literature", caption: "Start with an exact detail and where you found it. Then explain your idea, another possible meaning, and what changes as you read." }],
  computer_science: [{ file: "computer_science", caption: "Write a prediction, make one change, and record what actually happens. If a check fails, ask for one fix and try the same check again." }],
};

/** Taught examples only. Assigned answers and grades never appear in these assets. */
export function LessonVisuals({ lesson }: { lesson: LessonView }) {
  if (lesson.date !== "2026-10-01") return null;
  const pictures = day27Pictures[lesson.subject] ?? [];
  return <section className="lesson-pictures" aria-label="Pictures for this lesson">
    <h3>Look at the idea</h3>
    {pictures.map(({ file, caption }) => <figure key={file}>
      <img src={`/lesson-visuals/2026-10-01/${file}.svg`} alt={caption} />
      <figcaption>{caption}</figcaption>
    </figure>)}
  </section>;
}
