import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./lib/api";
import type { LessonView } from "./lib/types";

const VoiceTutor = lazy(() =>
  import("./voice/VoiceTutor").then((module) => ({ default: module.VoiceTutor })),
);

export default function App() {
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);

  useEffect(() => {
    void api
      .currentLesson()
      .then((current) => {
        if (!current) throw new Error("The curriculum has not been initialized.");
        setLesson(current);
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

  if (needsAuthentication) {
    return <LoginScreen />;
  }

  if (lesson) {
    return (
      <Suspense fallback={<LoadingScreen message="Preparing voice tutor" />}>
        <VoiceTutor lessonId={lesson.id} lessonTitle={lesson.lesson_title} />
      </Suspense>
    );
  }

  return <LoadingScreen message={error ?? "Loading your lesson"} error={Boolean(error)} />;
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
