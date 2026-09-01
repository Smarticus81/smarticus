import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "./lib/api";
import type {
  AnswerSupport,
  LessonView,
  PracticeItem,
  ScheduleView,
} from "./lib/types";

const VoiceTutor = lazy(() =>
  import("./voice/VoiceTutor").then((module) => ({ default: module.VoiceTutor })),
);

export default function App() {
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.todaySchedule(), api.currentLesson()])
      .then(([today, current]) => {
        if (!today.lessons.length) {
          throw new Error("No lessons are available for today.");
        }
        setSchedule(today);
        const selected =
          current && today.lessons.some((lesson) => lesson.id === current.id)
            ? current.id
            : today.lessons.find((lesson) => lesson.status !== "completed")?.id ??
              today.lessons[0].id;
        setSelectedLessonId(selected);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          setNeedsAuthentication(true);
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the current lesson.",
        );
      });
  }, []);

  const lesson = useMemo(
    () =>
      schedule?.lessons.find((candidate) => candidate.id === selectedLessonId) ??
      null,
    [schedule, selectedLessonId],
  );

  const selectLesson = useCallback(
    async (nextLesson: LessonView) => {
      if (voiceActive || nextLesson.id === selectedLessonId) return;
      setSelectionError(null);
      try {
        await api.selectLesson(nextLesson.id);
        setSelectedLessonId(nextLesson.id);
        document.querySelector(".lesson-workspace")?.scrollTo({ top: 0, behavior: "smooth" });
      } catch (caught) {
        setSelectionError(
          caught instanceof Error ? caught.message : "Unable to select that lesson.",
        );
      }
    },
    [selectedLessonId, voiceActive],
  );

  const completeLesson = useCallback(async () => {
    if (!lesson) return;
    setSelectionError(null);
    try {
      await api.tool.lessonCompleted(lesson.id);
      setSchedule((current) =>
        current
          ? {
              ...current,
              lessons: current.lessons.map((candidate) =>
                candidate.id === lesson.id
                  ? { ...candidate, status: "completed" }
                  : candidate,
              ),
            }
          : current,
      );
    } catch (caught) {
      setSelectionError(
        caught instanceof Error ? caught.message : "Unable to complete this lesson.",
      );
    }
  }, [lesson]);

  if (needsAuthentication) {
    return <LoginScreen />;
  }

  if (schedule && lesson) {
    return (
      <div className="learning-app">
        <header className="learning-header">
          <div>
            <span className="learning-kicker">Virgil · Grade {schedule.grade_level}</span>
            <h1>{formatSchoolDay(schedule.date, schedule.day_number)}</h1>
          </div>
          <p>{schedule.todays_goal}</p>
        </header>

        <aside className="schedule-panel" aria-label="Today’s schedule">
          <div className="panel-heading">
            <span>Today</span>
            <strong>{schedule.lessons.length} lessons</strong>
          </div>
          <nav className="schedule-list">
            {schedule.lessons.map((candidate) => {
              const selected = candidate.id === lesson.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={`schedule-item ${selected ? "schedule-item--active" : ""}`}
                  onClick={() => void selectLesson(candidate)}
                  disabled={voiceActive && !selected}
                  aria-current={selected ? "page" : undefined}
                >
                  <span className="schedule-item__number">
                    {String(candidate.lesson_number).padStart(2, "0")}
                  </span>
                  <span className="schedule-item__copy">
                    <strong>{subjectLabel(candidate.subject)}</strong>
                    <small>
                      {candidate.lesson_title} · {candidate.estimated_minutes} min
                    </small>
                  </span>
                  <span
                    className={`schedule-item__status schedule-item__status--${candidate.status}`}
                    aria-label={candidate.status}
                  />
                </button>
              );
            })}
          </nav>
          {voiceActive && (
            <p className="schedule-note">End the voice session before changing lessons.</p>
          )}
        </aside>

        <main className="lesson-workspace">
          {selectionError && <p className="inline-error">{selectionError}</p>}
          <LessonContent lesson={lesson} onComplete={completeLesson} />
        </main>

        <aside className="voice-panel">
          <div className="voice-panel__heading">
            <span>Voice tutor</span>
            <strong>{subjectLabel(lesson.subject)}</strong>
          </div>
          <Suspense fallback={<div className="voice-panel__loading">Preparing Virgil</div>}>
            <VoiceTutor
              key={lesson.id}
              lessonId={lesson.id}
              lessonTitle={lesson.lesson_title}
              embedded
              onConnectionChange={setVoiceActive}
            />
          </Suspense>
        </aside>
      </div>
    );
  }

  return <LoadingScreen message={error ?? "Loading your lesson"} error={Boolean(error)} />;
}

function LessonContent({
  lesson,
  onComplete,
}: {
  lesson: LessonView;
  onComplete: () => Promise<void>;
}) {
  return (
    <article className="lesson-content">
      <header className="lesson-hero">
        <div className="lesson-hero__meta">
          <span>{subjectLabel(lesson.subject)}</span>
          <span>{lesson.estimated_minutes} minutes</span>
          <span>{lesson.unit_title}</span>
        </div>
        <h2>{lesson.lesson_title}</h2>
        <p>{lesson.why_it_matters}</p>
        <div className="lesson-objectives">
          {lesson.learning_objectives.map((objective) => (
            <span key={objective}>{objective}</span>
          ))}
        </div>
      </header>

      <LessonSection title="Learn" eyebrow="Lesson guide" defaultOpen>
        {lesson.previous_learning && (
          <div className="context-callout">
            <span>Building from</span>
            <p>{lesson.previous_learning}</p>
          </div>
        )}
        <p className="lesson-prose">{lesson.written_instruction}</p>
      </LessonSection>

      {lesson.vocabulary.length > 0 && (
        <LessonSection title="Vocabulary" eyebrow={`${lesson.vocabulary.length} key terms`}>
          <dl className="vocabulary-grid">
            {lesson.vocabulary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </LessonSection>
      )}

      {lesson.worked_examples.length > 0 && (
        <LessonSection title="Worked examples" eyebrow="Reveal each method">
          <div className="example-list">
            {lesson.worked_examples.map((example, index) => (
              <details className="example-card" key={`${example.title}-${index}`}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{example.title}</strong>
                  <small>{example.problem}</small>
                </summary>
                <div>
                  <strong>{example.solution}</strong>
                  <p>{example.explanation}</p>
                </div>
              </details>
            ))}
          </div>
        </LessonSection>
      )}

      {lesson.guided_practice.length > 0 && (
        <PracticeSection
          title="Guided practice"
          eyebrow="Work with support"
          lessonId={lesson.id}
          items={lesson.guided_practice}
          kind="guided"
        />
      )}

      {lesson.independent_practice.length > 0 && (
        <PracticeSection
          title="Independent practice"
          eyebrow="Show your reasoning"
          lessonId={lesson.id}
          items={lesson.independent_practice}
          kind="independent"
        />
      )}

      {lesson.exit_ticket.length > 0 && (
        <PracticeSection
          title="Exit ticket"
          eyebrow="Finish without answer keys"
          lessonId={lesson.id}
          items={lesson.exit_ticket}
          kind="exit"
        />
      )}

      <footer className="lesson-completion">
        <div>
          <span>Lesson status</span>
          <strong>{lesson.status === "completed" ? "Complete" : "Ready to learn"}</strong>
        </div>
        <button
          type="button"
          onClick={() => void onComplete()}
          disabled={lesson.status === "completed"}
        >
          {lesson.status === "completed" ? "Lesson completed" : "Mark lesson complete"}
        </button>
      </footer>
    </article>
  );
}

function LessonSection({
  title,
  eyebrow,
  defaultOpen = false,
  children,
}: {
  title: string;
  eyebrow: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="lesson-section"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </span>
        <span className="lesson-section__toggle">Open</span>
      </summary>
      <div className="lesson-section__body">{children}</div>
    </details>
  );
}

function PracticeSection({
  title,
  eyebrow,
  lessonId,
  items,
  kind,
}: {
  title: string;
  eyebrow: string;
  lessonId: string;
  items: PracticeItem[];
  kind: "guided" | "independent" | "exit";
}) {
  return (
    <LessonSection title={title} eyebrow={eyebrow}>
      <div className="practice-list">
        {items.map((item, index) => (
          <PracticeCard
            key={item.id}
            lessonId={lessonId}
            item={item}
            index={index}
            kind={kind}
          />
        ))}
      </div>
    </LessonSection>
  );
}

function PracticeCard({
  lessonId,
  item,
  index,
  kind,
}: {
  lessonId: string;
  item: PracticeItem;
  index: number;
  kind: "guided" | "independent" | "exit";
}) {
  const storageKey = `virgil-response:${lessonId}:${item.id}`;
  const [response, setResponse] = useState(() => localStorage.getItem(storageKey) ?? "");
  const [support, setSupport] = useState<AnswerSupport | null>(null);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  const updateResponse = (value: string) => {
    setResponse(value);
    localStorage.setItem(storageKey, value);
  };

  const requestSupport = async () => {
    setLoadingSupport(true);
    setSupportError(null);
    try {
      setSupport(await api.tool.answerSupport(lessonId, item.id));
    } catch (caught) {
      setSupportError(caught instanceof Error ? caught.message : "Guidance is unavailable.");
    } finally {
      setLoadingSupport(false);
    }
  };

  return (
    <article className={`practice-card practice-card--${kind}`}>
      <div className="practice-card__prompt">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <p>{item.prompt}</p>
      </div>
      <textarea
        value={response}
        onChange={(event) => updateResponse(event.target.value)}
        placeholder="Write your thinking here…"
        aria-label={`Response to ${item.prompt}`}
        rows={4}
      />
      <div className="practice-card__actions">
        <small>{response ? "Saved on this device" : "Your response saves as you type"}</small>
        <button type="button" onClick={() => void requestSupport()} disabled={loadingSupport}>
          {loadingSupport ? "Getting guidance…" : "Get guidance"}
        </button>
      </div>
      {support && (
        <div className="support-callout" role="status">
          <strong>{support.answerWithheld ? "Guidance" : "Feedback"}</strong>
          <p>{support.hint}</p>
        </div>
      )}
      {supportError && <p className="inline-error">{supportError}</p>}
    </article>
  );
}

function subjectLabel(subject: string) {
  const labels: Record<string, string> = {
    mathematics: "Mathematics",
    literature: "Literature",
    writing: "Writing",
    science: "Science",
    history_geography: "History & Geography",
    french: "French",
    computer_science: "Computer Science & AI",
    pe: "PE & Wellness",
    art_design: "Art & Design",
  };
  return labels[subject] ?? subject.replaceAll("_", " ");
}

function formatSchoolDay(date: string, dayNumber: number) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
  return `Day ${dayNumber} · ${formatted}`;
}

function LoginScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
      setSubmitting(false);
    }
  };

  return (
    <main className="voice-stage">
      <div className="voice-ambient voice-ambient--one" />
      <div className="voice-ambient voice-ambient--two" />
      <form className="login-panel" onSubmit={(event) => void submit(event)}>
        <h1>Atticus Tutor</h1>
        <p>Enter the family access password to continue.</p>
        <label htmlFor="access-password">Access password</label>
        <input
          id="access-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          autoFocus
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Continue"}
        </button>
        {error && <p className="voice-error">{error}</p>}
      </form>
    </main>
  );
}

function LoadingScreen({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="voice-stage">
      <div className="voice-ambient voice-ambient--one" />
      <div className="voice-ambient voice-ambient--two" />
      <div className="wave-surface wave-surface--loading" aria-label="Loading lesson">
        <span className="voice-orb voice-orb--connecting" />
      </div>
      <section className="voice-hud" aria-live="polite">
        <span className={`voice-status-dot ${error ? "voice-status-dot--error" : ""}`} />
        <span>{message}</span>
      </section>
    </main>
  );
}
