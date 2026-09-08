import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LessonView, PracticeItem, WorkedExample } from "../../lib/types";
import { instructionBeats } from "../../lib/learning";
import { api } from "../../lib/api";
import { ChoiceGroup, JournalPrompt, Scene } from "./LearningPrimitives";

type Journal = {
  entries: Record<string, string>;
  write: (key: string, value: string) => void;
};
export function UnderstandPanel({
  lesson,
  journal,
  onExplore,
}: {
  lesson: LessonView;
  journal: Journal;
  onExplore: () => void;
}) {
  const beats = instructionBeats(lesson.written_instruction);
  const [beat, setBeat] = useState(0);
  return (
    <div className="understand-panel">
      <div className="intention-card">
        <span className="eyebrow">TODAY’S INTENTION</span>
        <h2>{lesson.learning_objectives[0] ?? lesson.lesson_title}</h2>
        <details>
          <summary>See the learning goals</summary>
          <ul>
            {lesson.learning_objectives.map((goal, i) => (
              <li key={i}>{goal}</li>
            ))}
          </ul>
        </details>
      </div>
      {lesson.previous_learning && (
        <details className="source-peek">
          <summary>Start with what you already know</summary>
          <p>{lesson.previous_learning}</p>
        </details>
      )}
      <section className="reading-focus">
        <div className="reading-meta">
          <span className="eyebrow">THE IDEA, A LITTLE AT A TIME</span>
          <span>
            {beats.length ? beat + 1 : 0} / {beats.length}
          </span>
        </div>
        <Scene id={String(beat)}>
          <div className="reading-beat">
            <p>
              {beats[beat] ??
                "Begin with the learning goals, then explore the examples below."}
            </p>
          </div>
        </Scene>
        <div className="beat-navigation">
          <button
            className="text-button"
            disabled={beat === 0}
            onClick={() => setBeat(beat - 1)}
          >
            ← Back
          </button>
          <div aria-label="Reading steps">
            {beats.map((_, i) => (
              <button
                key={i}
                aria-label={`Read idea ${i + 1}`}
                aria-current={beat === i ? "step" : undefined}
                onClick={() => setBeat(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            className="text-button"
            disabled={beat >= beats.length - 1}
            onClick={() => setBeat(beat + 1)}
          >
            Next idea →
          </button>
        </div>
      </section>
      <JournalPrompt
        label="Pause. How would you explain that in your own words?"
        value={journal.entries[`understand-${beat}`] ?? ""}
        onChange={(value) => journal.write(`understand-${beat}`, value)}
      />
      {lesson.why_it_matters && (
        <div className="relevance-note">
          <span>OUT IN THE WORLD</span>
          <p>{lesson.why_it_matters}</p>
        </div>
      )}
      {lesson.worked_examples.length > 0 && (
        <section className="example-collection">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LET’S THINK THROUGH AN EXAMPLE</span>
              <h3>Notice the how. Then the why.</h3>
            </div>
          </div>
          {lesson.worked_examples.map((example, i) => (
            <ExampleCard
              key={i}
              example={example}
              index={i}
              journal={journal}
            />
          ))}
        </section>
      )}
      <button className="button dark" onClick={onExplore}>
        Make the idea move <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
function ExampleCard({
  example,
  index,
  journal,
}: {
  example: WorkedExample;
  index: number;
  journal: Journal;
}) {
  const [step, setStep] = useState(0);
  return (
    <article className="example-walkthrough">
      <span className="eyebrow">WORKED EXAMPLE {index + 1}</span>
      <h4>{example.title}</h4>
      <p className="example-problem">{example.problem}</p>
      <JournalPrompt
        label="What would you try first?"
        value={journal.entries[`example-${index}`] ?? ""}
        onChange={(v) => journal.write(`example-${index}`, v)}
      />
      {step >= 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="example-step"
        >
          <span>THE REASONING</span>
          <p>{example.explanation}</p>
        </motion.div>
      )}
      {step >= 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="example-step example-solution"
        >
          <span>THE WORKED RESULT</span>
          <p>{example.solution}</p>
        </motion.div>
      )}
      <div className="learning-actions">
        <button
          className="text-button"
          disabled={step === 2}
          onClick={() => setStep(step + 1)}
        >
          {step === 0
            ? "Explore the reasoning →"
            : step === 1
              ? "Reveal the worked result →"
              : "Example explored"}
        </button>
        {step > 0 && (
          <button className="text-button" onClick={() => setStep(0)}>
            Cover it & try again
          </button>
        )}
      </div>
    </article>
  );
}

export function PracticePanel({
  lesson,
  answers,
  onAnswer,
  onFocus,
  onDiscuss,
}: {
  lesson: LessonView;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  onFocus: (focus: string) => void;
  onDiscuss: (focus: string) => void;
}) {
  const items: Array<PracticeItem & { key: string; group: string }> = [
    lesson.guided_practice,
    lesson.independent_practice,
    lesson.exit_ticket,
  ].flatMap((group, section) =>
    group.map((item) => ({
      ...item,
      key: `${section}-${item.id}`,
      group: ["Warm up", "On your own", "Check understanding"][section],
    })),
  );
  const [index, setIndex] = useState(0);
  const current = items[index];
  const count = items.filter((item) => answers[item.key]?.trim()).length;
  useEffect(() => {
    if (current)
      onFocus(
        `Practice: ${current.group}. Exact question ${current.id}: ${current.prompt}`,
      );
  }, [current?.id, current?.prompt, onFocus]);
  if (!current)
    return (
      <div className="intention-card">
        <h2>Explain it. Make it yours.</h2>
        <p>
          There are no assigned written questions in this lesson. Use your
          scratchpad, explore the model, or talk it through with Virgil.
        </p>
      </div>
    );
  return (
    <div className="practice-focus">
      <div className="practice-heading">
        <div>
          <span className="eyebrow">ONE QUESTION. YOUR WHOLE ATTENTION.</span>
          <h2>Take your time here.</h2>
        </div>
        <span>
          {count} / {items.length} drafts started
        </span>
      </div>
      <div className="question-map" aria-label="Choose a practice question">
        {items.map((item, i) => (
          <button
            key={item.key}
            onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}: ${item.group}${answers[item.key]?.trim() ? ", draft started" : ""}`}
            aria-current={index === i ? "step" : undefined}
            className={answers[item.key]?.trim() ? "has-draft" : ""}
          >
            {i + 1}
            <i />
          </button>
        ))}
      </div>
      <Scene id={current.key}>
        <QuestionCard
          key={current.key}
          lessonId={lesson.id}
          item={current}
          answer={answers[current.key] ?? ""}
          onAnswer={(v) => onAnswer(current.key, v)}
          onDiscuss={() =>
            onDiscuss(
              `Help me think through ${current.id}: ${current.prompt}\nMy current draft: ${answers[current.key] ?? "I haven’t written a draft yet."}`,
            )
          }
        />
      </Scene>
      <div className="practice-navigation">
        <button
          className="button outline"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          ← Previous
        </button>
        <span>
          {index + 1} of {items.length}
        </span>
        <button
          className="button dark"
          disabled={index === items.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next question →
        </button>
      </div>
      <p className="learning-fineprint">
        Your drafts stay on this device. A written answer isn’t automatically
        graded or counted as mastery.
      </p>
    </div>
  );
}
function QuestionCard({
  lessonId,
  item,
  answer,
  onAnswer,
  onDiscuss,
}: {
  lessonId: string;
  item: PracticeItem & { key: string; group: string };
  answer: string;
  onAnswer: (value: string) => void;
  onDiscuss: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  async function guidance() {
    setLoading(true);
    setError(false);
    try {
      const support = await api.tool.answerSupport(lessonId, item.id);
      setHint(support.hint);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <article className="focused-question">
      <span className="question-group">{item.group}</span>
      <label htmlFor={`answer-${item.key}`}>
        <h3>{item.prompt}</h3>
      </label>
      <textarea
        id={`answer-${item.key}`}
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        rows={6}
        placeholder="Show how you’re thinking. A first step is enough to begin."
      />
      <div className="learning-actions">
        <button
          className="text-button"
          onClick={() => void guidance()}
          disabled={loading}
        >
          {loading ? "Finding a nudge…" : "A little nudge"}
        </button>
        <button className="text-button" onClick={onDiscuss}>
          Talk this through with Virgil ↗
        </button>
      </div>
      {item.hint && (
        <details className="hint">
          <summary>Lesson hint</summary>
          <p>{item.hint}</p>
        </details>
      )}
      {hint && (
        <p className="model-insight" role="status">
          {hint}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          The hint couldn’t load. Try again in a moment.
        </p>
      )}
    </article>
  );
}

export function WordsPanel({
  lesson,
  journal,
}: {
  lesson: LessonView;
  journal: Journal;
}) {
  const [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false);
  const reduced = useReducedMotion();
  const words = lesson.vocabulary,
    word = words[index];
  if (!word)
    return (
      <div className="intention-card">
        <h2>No new words to collect today.</h2>
        <p>Try explaining one of the lesson’s ideas in everyday language.</p>
      </div>
    );
  const move = (next: number) => {
    setIndex(next);
    setRevealed(false);
  };
  return (
    <div className="word-studio">
      <span className="eyebrow">
        WORD {index + 1} OF {words.length}
      </span>
      <h2>Recall first. Reveal second.</h2>
      <p>Say what it means out loud, or jot down your version.</p>
      <Scene id={word.term}>
        <motion.button
          className={`recall-card ${revealed ? "is-revealed" : ""}`}
          onClick={() => setRevealed(!revealed)}
          animate={{ rotateX: revealed && !reduced ? [0, 5, 0] : 0 }}
          transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
          aria-pressed={revealed}
        >
          <span>{revealed ? word.term : "WHAT DOES THIS MEAN?"}</span>
          <strong>{revealed ? word.definition : word.term}</strong>
          <small>
            {revealed
              ? "Tap to cover the meaning"
              : "Tap to reveal the meaning"}
          </small>
        </motion.button>
      </Scene>
      <JournalPrompt
        label="My explanation or example"
        value={journal.entries[`word-${word.term}`] ?? ""}
        onChange={(v) => journal.write(`word-${word.term}`, v)}
      />
      <ChoiceGroup
        label="How does this word feel?"
        values={["New to me", "Coming together", "I can use it"]}
        selected={journal.entries[`word-confidence-${word.term}`] ?? ""}
        onChange={(v) => journal.write(`word-confidence-${word.term}`, v)}
      />
      <div className="practice-navigation">
        <button
          className="button outline"
          disabled={index === 0}
          onClick={() => move(index - 1)}
        >
          ← Previous word
        </button>
        <button
          className="button dark"
          disabled={index === words.length - 1}
          onClick={() => move(index + 1)}
        >
          Next word →
        </button>
      </div>
      <p className="learning-fineprint">
        These are your reflections, not a vocabulary grade.
      </p>
    </div>
  );
}

export function ReflectPanel({
  lesson,
  journal,
}: {
  lesson: LessonView;
  journal: Journal;
}) {
  return (
    <div className="reflect-panel">
      <div className="reflection-heading">
        <span className="eyebrow">LET IT SETTLE</span>
        <h2>What makes sense now?</h2>
        <p>Understanding grows when you put it into your own words.</p>
      </div>
      <JournalPrompt
        label="Teach the big idea to someone who hasn’t learned it yet."
        value={journal.entries.teachback ?? ""}
        onChange={(v) => journal.write("teachback", v)}
      />
      <JournalPrompt
        label="Where could you use this outside the lesson?"
        value={journal.entries.transfer ?? ""}
        onChange={(v) => journal.write("transfer", v)}
      />
      <JournalPrompt
        label="What are you still wondering?"
        value={journal.entries.wonder ?? ""}
        onChange={(v) => journal.write("wonder", v)}
      />
      <section className="self-check">
        <h3>A check-in with yourself.</h3>
        {lesson.learning_objectives.map((objective, i) => (
          <ChoiceGroup
            key={i}
            label={objective}
            values={["Need another try", "Getting there", "Can explain it"]}
            selected={journal.entries[`confidence-${i}`] ?? ""}
            onChange={(v) => journal.write(`confidence-${i}`, v)}
          />
        ))}
      </section>
      <p className="learning-fineprint">
        Your confidence is a useful signal. Your tutor records mastery
        separately, using evidence of your understanding.
      </p>
    </div>
  );
}
