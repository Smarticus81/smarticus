import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { LessonView } from "./lib/types";
import { VoiceTutor } from "./voice/VoiceTutor";

export default function App() {
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .todaySchedule()
      .then((schedule) => {
        const current =
          schedule.lessons.find(
            (candidate) =>
              candidate.status === "started" ||
              candidate.status === "in_progress",
          ) ??
          schedule.lessons.find((candidate) => candidate.status !== "completed") ??
          schedule.lessons[0];
        if (!current) throw new Error("No lesson is scheduled.");
        setLesson(current);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the current lesson.",
        );
      });
  }, []);

  if (lesson) {
    return <VoiceTutor lessonId={lesson.id} lessonTitle={lesson.lesson_title} />;
  }

  return (
    <main className="voice-stage">
      <div className="voice-ambient voice-ambient--one" />
      <div className="voice-ambient voice-ambient--two" />
      <div className="wave-surface wave-surface--loading" aria-label="Loading lesson">
        <span className="voice-orb voice-orb--connecting" />
      </div>
      <section className="voice-hud" aria-live="polite">
        <span className={`voice-status-dot ${error ? "voice-status-dot--error" : ""}`} />
        <span>{error ?? "Loading your lesson"}</span>
      </section>
    </main>
  );
}
