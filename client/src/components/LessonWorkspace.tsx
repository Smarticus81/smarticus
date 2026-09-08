import { lazy, Suspense, useEffect, useState } from "react";
import type { LessonView } from "../lib/types";
import { api } from "../lib/api";
import { subjectInfo } from "../lib/subjects";
import { Icon } from "./Icon";

const VoiceTutor = lazy(() =>
  import("../voice/VoiceTutor").then((module) => ({
    default: module.VoiceTutor,
  })),
);
type LessonTab = "learn" | "practice" | "vocabulary";
type PracticeItem = { id: string; prompt: string; hint?: string };
type Example = {
  title: string;
  problem: string;
  solution: string;
  explanation: string;
};
function practiceItems(items: unknown[]): PracticeItem[] {
  return items.filter((item): item is PracticeItem =>
    Boolean(
      item && typeof item === "object" && "id" in item && "prompt" in item,
    ),
  );
}

export function LessonWorkspace({
  lesson,
  onBack,
  onBusyChange,
}: {
  lesson: LessonView;
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [tab, setTab] = useState<LessonTab>("learn");
  const [voiceLoaded, setVoiceLoaded] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [completed, setCompleted] = useState(lesson.status === "completed");
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [initialDraft] = useState(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(`smarticus-draft-${lesson.id}`) ?? "{}",
      );
      const legacyAnswers: Record<string, string> = {};
      [
        lesson.guided_practice,
        lesson.independent_practice,
        lesson.exit_ticket,
      ].forEach((items, section) => {
        items.forEach((item) => {
          const value = localStorage.getItem(
            `virgil-response:${lesson.id}:${item.id}`,
          );
          if (value !== null) legacyAnswers[`${section}-${item.id}`] = value;
        });
      });
      return {
        notes: typeof stored?.notes === "string" ? stored.notes : "",
        answers: {
          ...legacyAnswers,
          ...Object.fromEntries(
            Object.entries(stored?.answers ?? {}).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ),
        },
      };
    } catch {
      return { notes: "", answers: {} as Record<string, string> };
    }
  });
  const [notes, setNotes] = useState<string>(initialDraft.notes);
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialDraft.answers,
  );
  const [saveState, setSaveState] = useState(
    "Drafts stay in this browser tab.",
  );
  const info = subjectInfo(lesson.subject);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `smarticus-draft-${lesson.id}`,
        JSON.stringify({ notes, answers }),
      );
      [
        lesson.guided_practice,
        lesson.independent_practice,
        lesson.exit_ticket,
      ].forEach((items, section) => {
        items.forEach((item) => {
          const value = answers[`${section}-${item.id}`];
          if (value !== undefined)
            localStorage.setItem(
              `virgil-response:${lesson.id}:${item.id}`,
              value,
            );
        });
      });
      setSaveState(
        "Practice saved on this device. Notes stay in this tab. Not submitted for grading.",
      );
    } catch {
      setSaveState("Draft couldn’t be saved. Copy your work before leaving.");
    }
  }, [notes, answers, lesson.id]);
  useEffect(() => {
    onBusyChange(voiceBusy || completing);
  }, [voiceBusy, completing, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const updateAnswer = (id: string, answer: string) =>
    setAnswers((previous) => ({ ...previous, [id]: answer }));
  const completeLesson = async () => {
    setCompleting(true);
    setCompletionError(null);
    try {
      await api.tool.lessonCompleted(lesson.id);
      setCompleted(true);
    } catch {
      setCompletionError("Lesson completion couldn’t save. Please try again.");
    } finally {
      setCompleting(false);
    }
  };
  const examples = lesson.worked_examples.filter((item): item is Example =>
    Boolean(item && typeof item === "object" && "problem" in item),
  );
  return (
    <div className={`lesson-workspace ${focus ? "focus-mode" : ""}`}>
      <div className="lesson-topline">
        <button
          className="text-button"
          disabled={voiceBusy || completing}
          onClick={onBack}
        >
          <Icon name="back" size={17} />
          Back to my day
        </button>
        <button
          className="button outline compact"
          disabled={voiceBusy}
          onClick={() => setFocus(!focus)}
          aria-pressed={focus}
        >
          <Icon name="compass" size={16} />
          {focus ? "Show tutor panel" : "Focus view"}
        </button>
      </div>
      {voiceBusy && (
        <p className="session-notice">
          End your voice session below before leaving this lesson.
        </p>
      )}
      <header className="lesson-header">
        <span className={`subject-icon ${info.color}`}>
          <Icon name={info.icon} size={28} />
        </span>
        <div>
          <span className="eyebrow">
            {info.label} · LESSON {lesson.lesson_number}
          </span>
          <h1>{lesson.lesson_title}</h1>
          <p>
            {lesson.unit_title} <span>· {lesson.estimated_minutes} min</span>
          </p>
        </div>
      </header>
      <div className="lesson-layout">
        <section className="lesson-main">
          <div className="lesson-tabs" aria-label="Lesson sections">
            {(["learn", "practice", "vocabulary"] as const).map((item) => (
              <button
                key={item}
                aria-pressed={tab === item}
                className={tab === item ? "selected" : ""}
                onClick={() => setTab(item)}
              >
                <Icon
                  name={
                    item === "learn"
                      ? "book"
                      : item === "practice"
                        ? "pen"
                        : "star"
                  }
                  size={17}
                />
                {item === "learn"
                  ? "Explore the lesson"
                  : item === "practice"
                    ? "Give it a try"
                    : "Word cards"}
              </button>
            ))}
          </div>
          {tab === "learn" && (
            <div className="lesson-pane">
              <section className={`learning-goals ${info.color}`}>
                <span className="eyebrow">HERE’S WHERE WE’RE HEADED</span>
                <h2>By the end, you’ll be able to…</h2>
                <ul>
                  {lesson.learning_objectives.map((objective, index) => (
                    <li key={index}>
                      <span>{index + 1}</span>
                      {objective}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="reading-card">
                <span className="eyebrow">THE BIG IDEA</span>
                <h2>Let’s make it click.</h2>
                {lesson.previous_learning && (
                  <details className="hint">
                    <summary>Connect to what you already know</summary>
                    <p>{lesson.previous_learning}</p>
                  </details>
                )}
                <div className="prose">
                  {lesson.written_instruction
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
                {lesson.why_it_matters && (
                  <div className="why-callout">
                    <Icon name="star" />
                    <div>
                      <strong>Where this shows up in real life</strong>
                      <p>{lesson.why_it_matters}</p>
                    </div>
                  </div>
                )}
              </section>
              {examples.length > 0 && (
                <section className="reading-card">
                  <span className="eyebrow">SEE IT IN ACTION</span>
                  <h2>A little help getting started.</h2>
                  {examples.map((example, index) => (
                    <details className="worked-example" key={index}>
                      <summary>
                        <span className="example-number">{index + 1}</span>
                        <span>
                          <strong>{example.title}</strong>
                          <span>{example.problem}</span>
                        </span>
                        <Icon name="chevron" size={18} />
                      </summary>
                      <div className="example-content">
                        <span className="eyebrow">WORKED SOLUTION</span>
                        <h3>{example.solution}</h3>
                        <p>{example.explanation}</p>
                      </div>
                    </details>
                  ))}
                </section>
              )}
              <button
                className="button primary"
                onClick={() => setTab("practice")}
              >
                Ready to try it yourself?
                <Icon name="arrow" />
              </button>
            </div>
          )}
          {tab === "practice" && (
            <div className="lesson-pane">
              <div className="practice-intro">
                <span className="eyebrow">THINK IT THROUGH</span>
                <h2>Good thinking beats a quick answer.</h2>
                <p>
                  Show your steps, try an idea, and ask Virgil when you’re
                  stuck. These are your drafts; they aren’t automatically
                  graded.
                </p>
              </div>
              {[
                {
                  title: "Warm up with a little help",
                  items: practiceItems(lesson.guided_practice),
                },
                {
                  title: "Try it on your own",
                  items: practiceItems(lesson.independent_practice),
                },
                {
                  title: "Check your understanding",
                  items: practiceItems(lesson.exit_ticket),
                },
              ].map(
                (group, groupIndex) =>
                  group.items.length > 0 && (
                    <section key={group.title} className="practice-group">
                      <h3>{group.title}</h3>
                      {group.items.map((item, index) => {
                        const answerId = `${groupIndex}-${item.id}`;
                        return (
                          <article className="practice-card" key={item.id}>
                            <label htmlFor={`answer-${answerId}`}>
                              <span className="eyebrow">
                                QUESTION {index + 1}
                              </span>
                              <strong>{item.prompt}</strong>
                            </label>
                            <textarea
                              id={`answer-${answerId}`}
                              rows={4}
                              value={answers[answerId] ?? ""}
                              onChange={(event) =>
                                updateAnswer(answerId, event.target.value)
                              }
                              placeholder="Here’s how I’m thinking about it…"
                            />
                            {item.hint && (
                              <details className="hint">
                                <summary>Need a nudge?</summary>
                                <p>{item.hint}</p>
                              </details>
                            )}
                            <QuestionGuidance
                              lessonId={lesson.id}
                              itemId={item.id}
                            />
                          </article>
                        );
                      })}
                    </section>
                  ),
              )}
              {!lesson.guided_practice.length &&
                !lesson.independent_practice.length &&
                !lesson.exit_ticket.length && (
                  <div className="empty-state">
                    <h3>Try explaining the big idea in your own words.</h3>
                    <p>
                      There are no written questions for this lesson. Use your
                      scratchpad or talk it through with Virgil.
                    </p>
                  </div>
                )}
            </div>
          )}
          {tab === "vocabulary" && (
            <div className="lesson-pane">
              <div className="practice-intro">
                <span className="eyebrow">BUILD YOUR WORD POWER</span>
                <h2>Think first. Flip to check.</h2>
                <p>Explain the word out loud, then reveal its meaning.</p>
              </div>
              <div className="word-grid">
                {lesson.vocabulary.map((word) => (
                  <WordCard key={word.term} {...word} />
                ))}
              </div>
              {!lesson.vocabulary.length && (
                <p className="muted">No new vocabulary in this lesson.</p>
              )}
            </div>
          )}
          <section className="reading-card lesson-completion">
            <span className="eyebrow">YOUR LEARNING, YOUR PACE</span>
            <h2>{completed ? "Lesson complete." : "Finished your lesson?"}</h2>
            <p>
              Record your lesson as complete when you’re ready. Skill mastery is
              tracked separately.
            </p>
            <button
              className="button primary"
              onClick={() => void completeLesson()}
              disabled={completed || voiceBusy || completing}
            >
              {completed
                ? "Lesson completed"
                : completing
                  ? "Saving completion…"
                  : "Mark lesson complete"}
              <Icon name="check" size={17} />
            </button>
            {completionError && (
              <p className="inline-error" role="alert">
                {completionError}
              </p>
            )}
          </section>
        </section>
        <aside className="lesson-aside">
          <section className="voice-panel">
            {voiceLoaded ? (
              <Suspense fallback={<p role="status">Preparing Virgil…</p>}>
                <VoiceTutor
                  lessonId={lesson.id}
                  lessonTitle={lesson.lesson_title}
                  onBusyChange={setVoiceBusy}
                />
              </Suspense>
            ) : (
              <>
                <div className="section-top">
                  <span className="eyebrow">YOUR AI THINKING PARTNER</span>
                  <Icon name="headphones" />
                </div>
                <div className="virgil-face">
                  <i />
                  <i />
                </div>
                <h2>Hey, I’m Virgil.</h2>
                <p>
                  Let’s figure it out together. Ask for an explanation, a hint,
                  or a different way to think about it.
                </p>
                <button
                  className="button primary"
                  onClick={() => setVoiceLoaded(true)}
                >
                  <Icon name="mic" size={17} />
                  Set up voice chat
                </button>
                <small>Your microphone turns on only when you connect.</small>
              </>
            )}
          </section>
          <section className="scratchpad">
            <label htmlFor="lesson-notes">
              <Icon name="pen" size={18} />
              <strong>Your scratchpad</strong>
            </label>
            <textarea
              id="lesson-notes"
              placeholder="An idea, a question, a lightbulb moment…"
              rows={7}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <small role="status">{saveState}</small>
          </section>
          {lesson.materials.length > 0 && (
            <section className="materials">
              <span className="eyebrow">GRAB THESE BEFORE YOU START</span>
              {lesson.materials.map((material, index) => (
                <p key={index}>
                  <Icon name="check" size={15} />
                  {material}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
function QuestionGuidance({
  lessonId,
  itemId,
}: {
  lessonId: string;
  itemId: string;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGuidance = async () => {
    setLoading(true);
    setError(null);
    try {
      const support = await api.tool.answerSupport(lessonId, itemId);
      setHint(support.hint);
    } catch {
      setError("Guidance couldn’t load. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="question-guidance">
      <button
        className="text-button"
        onClick={() => void requestGuidance()}
        disabled={loading}
      >
        {loading ? "Getting guidance…" : "Get guidance"}
        <Icon name="compass" size={15} />
      </button>
      {hint && (
        <p className="lab-explanation" role="status">
          {hint}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function WordCard({ term, definition }: { term: string; definition: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      className={`word-card ${flipped ? "flipped" : ""}`}
      aria-pressed={flipped}
      onClick={() => setFlipped(!flipped)}
    >
      <span className="eyebrow">{flipped ? term : "WHAT DOES THIS MEAN?"}</span>
      <strong>{flipped ? definition : term}</strong>
      <span>
        {flipped ? "Back to word" : "Reveal meaning"}
        <Icon name="arrow" size={17} />
      </span>
    </button>
  );
}
