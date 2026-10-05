import { HoverBuilderLesson } from "./HoverBuilderLesson";
import type { LessonView } from "../../lib/types";
import { LessonVisuals } from "./LessonVisuals";

const subjects: Record<string, { number: string; name: string; time: string; line: string }> = {
  mathematics: { number: "01", name: "Mathematics", time: "9:30–10:20", line: "Measure the space." },
  writing: { number: "02", name: "Writing", time: "10:30–11:20", line: "Make your reason clear." },
  french: { number: "03", name: "French", time: "11:20–11:45", line: "Say what you will do." },
  science: { number: "04", name: "Science", time: "11:45–12:20", line: "Follow the light." },
  history_geography: { number: "05", name: "History & geography", time: "1:00–1:35", line: "Meet the people in power." },
  computer_science: { number: "06", name: "AI Builder", time: "1:35–2:35", line: "Build HOVER ONE." },
  literature: { number: "07", name: "Literature", time: "2:45–3:20", line: "Follow a clue carefully." },
};

/** Complete teaching and examples precede every response prompt in this edition. */
export function Day29Lesson({ lesson, onExplore }: { lesson: LessonView; onExplore: () => void }) {
  if (lesson.subject === "computer_science") return <HoverBuilderLesson />;
  const subject = subjects[lesson.subject];
  return <div className="day29-lesson">
    <header className="day29-title-page">
      {({writing:"lamp-study.jpg",french:"french-conversation.jpg",history_geography:"rome-republic.jpg"} as Record<string,string>)[lesson.subject] && <img className="day29-cover-art day29-relevant-art" src={`/lesson-visuals/2026-10-05/${({writing:"lamp-study.jpg",french:"french-conversation.jpg",history_geography:"rome-republic.jpg"} as Record<string,string>)[lesson.subject]}`} alt={lesson.subject === "writing" ? "The same recognizable desk lamp with an unlit bulb and a lit replacement bulb." : lesson.subject === "french" ? "Two classmates talking at an art table, with the boy holding a drawing pencil." : "Reconstructed scenes of Roman consuls, senators and male citizen assemblies."} />}

      <div className="day29-title-copy">
        <span className="eyebrow">MONDAY · DAY 29 · CHAPTER {subject.number}</span>
        <p className="day29-subject">{subject.name} <span>{subject.time}</span></p>
        <h2>{subject.line}</h2>
        <p>{lesson.learning_objectives[0]}</p>
        <div className="day29-route" aria-label="Lesson order"><span>1 · Learn</span><span>2 · See examples</span><span>3 · Your turn</span></div>
      </div>
    </header>

    <section className="day29-section" aria-labelledby="day29-learn">
      <span className="eyebrow">01 / LEARN THE IDEA</span>
      <h3 id="day29-learn">{lesson.lesson_title}</h3>
      <p className="day29-purpose">{lesson.why_it_matters}</p>
      <LessonVisuals lesson={lesson} />
      <div className="day29-vocabulary">
        {lesson.vocabulary.map(word => <div key={word.term}><strong>{word.term}</strong><p>{word.definition}</p></div>)}
      </div>
      <div className="day29-instruction">
        {lesson.written_instruction.split(/\n+/).filter(Boolean).map((paragraph, index) => {
          if (paragraph.startsWith("VIDEO LINK: ")) return <p key={index}><a href={paragraph.slice(12).trim()} target="_blank" rel="noreferrer">Watch the history video ↗</a></p>;
          return <p key={index}>{paragraph}</p>;
        })}
      </div>
    </section>

    <section className="day29-section" aria-labelledby="day29-models">
      <span className="eyebrow">02 / SEE HOW IT WORKS</span>
      <h3 id="day29-models">Follow a complete example.</h3>
      <p>Read the result and the reason. The practice comes next.</p>
      {lesson.worked_examples.map((example, index) => <article className="day29-model" key={example.title}>
        <span className="eyebrow">EXAMPLE {index + 1}</span>
        <h4>{example.title}</h4>
        <p>{example.problem}</p>
        <div className="day29-result"><strong>Worked result</strong><p>{example.solution}</p></div>
        <p><strong>Why it works:</strong> {example.explanation}</p>
      </article>)}
    </section>

    <section className="day29-next" aria-label="Teaching complete">
      <div><span className="eyebrow">03 / YOUR TURN</span><h3>Ready to try the idea?</h3><p>You can come back to these examples while you practise.</p></div>
      {<button className="button dark" onClick={onExplore}>Try it yourself <span aria-hidden="true">→</span></button>}
    </section>
  </div>;
}
