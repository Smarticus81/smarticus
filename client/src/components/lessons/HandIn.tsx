import { useState } from "react";
import { Icon } from "../Icon";
import { camera } from "../../voice/camera";
import { lessonWork, useLessonWork } from "../../voice/workStore";

function receipt(mode: "platform" | "paper", when: string): string {
  const time = new Date(when).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return mode === "paper"
    ? `Photo of your paper handed in at ${time}.`
    : `Answers handed in at ${time}.`;
}

/**
 * Handing the written work in.
 *
 * The answer boxes have always saved to this device and stopped there, so
 * finished work was not recorded anywhere anyone else could see. This is the
 * button that ends that, and it is deliberately plain about what it has and has
 * not sent: how many questions have something in them, and a timestamp once
 * they are in.
 */
export function HandIn() {
  const work = useLessonWork();
  const { answered, total } = lessonWork.progress();
  const [note, setNote] = useState("");
  const nothingYet = answered === 0;

  async function handIn() {
    try {
      await lessonWork.submit({
        mode: "platform",
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNote("");
    } catch {
      // The store holds the message; the panel below shows it.
    }
  }

  return (
    <section className="hand-in">
      <div className="hand-in-head">
        <span className="eyebrow">WHEN YOU ARE READY</span>
        <h3>Hand in today&rsquo;s work</h3>
      </div>
      <p className="hand-in-count">
        <strong>
          {answered} of {total}
        </strong>{" "}
        {total === 1 ? "question has" : "questions have"} something written.
        {answered < total && " You can hand in what you have and come back to the rest."}
      </p>
      <label className="sr-only" htmlFor="hand-in-note">
        Anything to say about this work
      </label>
      <textarea
        id="hand-in-note"
        className="hand-in-note"
        rows={2}
        placeholder="Anything you want to say about it? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="hand-in-actions">
        <button
          className="button dark"
          onClick={() => void handIn()}
          disabled={nothingYet || work.submitting}
        >
          <Icon name="check" size={16} />
          {work.submitting ? "Handing in…" : "Hand in my answers"}
        </button>
        <button
          className="text-button"
          onClick={() => void camera.start().catch(() => undefined)}
          disabled={work.submitting}
        >
          Did it on paper? Open the camera
        </button>
      </div>
      {nothingYet && (
        <p className="hand-in-hint">
          Write something in at least one answer box first, or photograph your
          paper with the camera.
        </p>
      )}
      {work.last && (
        <p className="hand-in-receipt" role="status">
          <Icon name="check" size={14} />
          {receipt(work.last.mode, work.last.submitted_at)}
        </p>
      )}
      {work.error && (
        <p className="inline-error" role="alert">
          {work.error}
        </p>
      )}
    </section>
  );
}
