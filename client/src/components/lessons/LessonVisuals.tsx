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

const day28Pictures: typeof day27Pictures = {
  mathematics: [
    { file: "mathematics", caption: "Four rows of six square units cover the rectangle. Two equal triangles fill it, so one triangle covers half: 24 divided by 2 is 12 square units." },
    { file: "coordinates", caption: "A point is an address: first number x, second number y. Match x with x for width and y with y for height before multiplying the side lengths." },
  ],
  writing: [{ file: "writing", caption: "Build six short sentence cards. Put a reason after each exact fact, then join the cards into a paragraph and revise one unclear sentence." }],
  science: [{ file: "science", caption: "An upward ray hits an up-right mirror and turns right. A down-right mirror turns that ray left. The dashed normal must turn with the mirror." }],
  french: [{ file: "french", caption: "Who, matching aller, unchanged action: tu vas dessiner; nous allons dessiner; elle va dessiner. The oral check still needs a parent observer." }],
  history_geography: [{ file: "history_geography", caption: "Name a feature, an action people actually take, and a possible result. Replace a vague phrase like good choices with an action a reader can picture." }],
  literature: [{ file: "literature", caption: "This invented clue card has a detail, a locator, competing explanations, and a reason to keep or change the idea. Use the same fields with your actual book, without spoilers." }],
  computer_science: [{ file: "computer_science", caption: "Choose a sci-fi escape, a mysterious museum, a dragon rescue, or your own world. Build a playable mission: collect an item, evade a reacting guard, and open the exit. Then add one creative upgrade." }],
};

const day29Pictures: typeof day27Pictures = {
  mathematics: [{ file: "math_half", caption: "Two matching triangles fill the rectangle. Each covers half of its area." }, { file: "mathematics", caption: "Use two corners on the same vertical side for height. Their x addresses match; subtract their y addresses and count the gaps." }],
  writing: [{ file: "writing", caption: "The same lamp stays dark with A, lights with B, then stays dark with A again. The picture shows the comparison; the sentences explain what it suggests." }, { file: "writing_steps", caption: "Give each sentence a job: idea, exact results, reason, and another test." }],
  french: [{ file: "french", caption: "Ask with tu vas, then answer as yourself with je vais. For no, put ne and pas around vais." }],
  science: [{ file: "science_angles", caption: "The normal is a guide line at 90 degrees to the mirror. Incoming and outgoing angles are measured from it." }, { file: "science", caption: "The mirror tilt decides which way an upward ray turns. The dashed normal makes a 90-degree corner with the mirror." }],
  history_geography: [{ file: "history_geography", caption: "Consuls, Senate and assemblies had different roles. Sharing power did not mean everyone could vote." }],
  computer_science: [{ file: "hover-car-poster", caption: "Teacher-built Blender example: body, canopy, four engines and a rear wing. Build your own parts, then render and save a poster." }],
  literature: [{ file: "literature", caption: "Name an exact detail and location, compare explanations, then link your decision to the evidence. This model is invented, not a book spoiler." }],
};

/** Taught examples only. Assigned answers and grades never appear in these assets. */
export function LessonVisuals({ lesson }: { lesson: LessonView }) {
  const family = lesson.date === "2026-10-01" ? day27Pictures : lesson.date === "2026-10-02" ? day28Pictures : lesson.date === "2026-10-05" ? day29Pictures : null;
  if (!family) return null;
  const pictures = family[lesson.subject] ?? [];
  return <section className="lesson-pictures" aria-label="Pictures for this lesson">
    <h3>Look at the idea</h3>
    {pictures.map(({ file, caption }) => <figure key={file}>
      <img src={`/lesson-visuals/${lesson.date}/${file}${lesson.date === "2026-10-05" && ["mathematics","math_half","writing","french","history_geography"].includes(file) ? "-v2.jpg" : file === "hover-car-poster" ? ".jpg" : ".svg"}`} alt={caption} loading="lazy" />
      <figcaption>{caption}</figcaption>
      {lesson.date === "2026-10-05" && ["mathematics","math_half","writing","french","history_geography"].includes(file) && <a href={`/lesson-visuals/${lesson.date}/${file}-v2.jpg`} target="_blank" rel="noreferrer">Open full-size teaching picture ↗</a>}
    </figure>)}
  </section>;
}
