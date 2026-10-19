import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { SchoolAssignment, SchoolContext } from "../../../shared/schoolContext";
import { subjectInfo } from "../lib/subjects";
import { Icon } from "./Icon";
import { camera, useCamera } from "../voice/camera";
import { SchoolCameraView } from "./SchoolCameraView";
import { Whiteboard } from "../voice/Whiteboard";
import { whiteboard, useWhiteboard } from "../voice/whiteboardStore";
import "../styles/lessons.css";

const VoiceTutor = lazy(() => import("../voice/VoiceTutor").then(module => ({ default: module.VoiceTutor })));

/** Schoolwork is deliberately separate from the archived lesson submission/journal workflow. */
export function SchoolLessonWorkspace({ assignment, context, revision, onBack, onBusyChange, onSchoolAccessLost }: {
  assignment: SchoolAssignment;
  context: SchoolContext;
  revision: number;
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
  onSchoolAccessLost: () => void;
}) {
  const [voiceLoaded, setVoiceLoaded] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [notes, setNotes] = useState("");
  const board = useWhiteboard();
  const cameraState = useCamera();
  const course = context.courses.find(item => item.id === assignment.courseId)!;
  const subject = subjectInfo(course.subject);
  const schoolSession = useMemo(() => ({ assignmentId: assignment.id, revision, context }), [assignment.id, revision, context]);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    whiteboard.clear(); whiteboard.setOpen(false);
    return () => { camera.stop(); whiteboard.clear(); whiteboard.setOpen(false); onBusyChange(false); };
  }, [onBusyChange]);
  return <section className="school-workspace" aria-label="School assignment workspace" data-school-workspace>
    <button className="text-button school-back" onClick={onBack}><Icon name="back" size={17} />Back to school day</button>
    <header className="school-workspace-heading">
      <div className="school-assignment-course"><span className={`subject-icon ${subject.color}`}><Icon name={subject.icon} size={21} /></span><span>{course.label}</span></div>
      <h1 ref={titleRef} tabIndex={-1}>{assignment.title}</h1>{assignment.unit && <p>{assignment.unit}</p>}
      {assignment.timingNote && <p className="school-assignment-timing"><Icon name="clock" size={15} />{assignment.timingNote}</p>}
    </header>
    <div className="school-workspace-grid">
      <div className="school-instruction-column">
        <section className="school-instructions" data-school-assignment><span className="eyebrow">YOUR ASSIGNMENT</span><h2>What to do</h2><ol>{assignment.instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ol>
          {(assignment.sourceUrl || course.sourceUrl) && <a className="button outline" href={assignment.sourceUrl ?? course.sourceUrl} target="_blank" rel="noreferrer">Open in your school portal<span aria-hidden="true">↗</span></a>}
        </section>
        {assignment.tutoringFocus && <section className="school-tutor-focus"><h2>Let’s work on understanding.</h2><p>{assignment.tutoringFocus}</p></section>}
        {assignment.kind === "assessment" && <p className="school-assessment-note">Virgil can help you prepare, explain concepts, and practice a similar example. Answer graded assessment questions yourself.</p>}
        <label className="school-scratchpad"><span>Try it out</span><small>A place to think or jot down a question. Notes clear when you leave this assignment.</small><textarea rows={6} value={notes} onChange={event => setNotes(event.target.value)} placeholder="What do you know so far? Where are you stuck?" /></label>
        <p className="school-fineprint">Hand in your answers in your school portal. Working with Virgil here doesn’t submit the assignment or change its school status.</p>
      </div>
      <div className="school-tutor-column">
        <section className="voice-panel school-voice-panel" aria-label="Assignment tutor">
          {voiceLoaded ? <Suspense fallback={<p role="status">Getting Virgil ready…</p>}><VoiceTutor
            key={`${assignment.id}:${revision}`} lessonId={`school:${assignment.id}`} lessonTitle={assignment.title}
            schoolSession={schoolSession} onSchoolAccessLost={onSchoolAccessLost} onBusyChange={onBusyChange} autoStart
            learningFocus={`School assignment: ${assignment.title}. ${assignment.tutoringFocus}`}
          /></Suspense> : <div className="school-voice-ready"><span className="eyebrow">VIRGIL · YOUR TUTOR</span><div className="school-virgil-mark" aria-hidden="true"><Icon name="star" size={42} /></div><h2>You don’t have to figure it out alone.</h2><p>Virgil can explain this assignment and work through a similar example with you.</p><button className="button dark" onClick={() => setVoiceLoaded(true)}><Icon name="mic" size={17} />Talk with Virgil</button><small>Review what goes to OpenAI before starting. Your microphone stays off until you agree.</small></div>}
        </section>
        <button className="button outline school-board-toggle" aria-pressed={board.open} onClick={() => whiteboard.setOpen(!board.open)}><Icon name="pen" size={17} />{board.open ? "Hide whiteboard" : "Open whiteboard"}</button>
        <button className="button outline school-board-toggle" aria-pressed={cameraState.active} disabled={cameraState.starting} onClick={() => cameraState.active ? camera.stop() : void camera.start().catch(() => undefined)}><Icon name="camera" size={17} />{cameraState.active ? "Close camera" : cameraState.starting ? "Opening camera…" : "Open camera"}</button>
        {cameraState.active && <SchoolCameraView />}
        {cameraState.error && <p className="inline-error" role="alert">{cameraState.error}</p>}
        {board.open && <div className="school-whiteboard"><Whiteboard onClose={() => whiteboard.setOpen(false)} /></div>}
      </div>
    </div>
  </section>;
}
