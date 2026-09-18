import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MotionConfig, motion } from "motion/react";
import type { LessonView } from "../lib/types";
import { api } from "../lib/api";
import { subjectInfo } from "../lib/subjects";
import { Icon } from "./Icon";
import { Scene } from "./lessons/LearningPrimitives";
import { LessonActivities } from "./lessons/LessonActivities";
import {
  PracticePanel,
  ReflectPanel,
  UnderstandPanel,
  WordsPanel,
} from "./lessons/LessonPanels";
import { useLearningJournal } from "./lessons/useLearningJournal";
import { VirgilAvatar } from "../voice/VirgilAvatar";
import { Whiteboard } from "../voice/Whiteboard";
import { Reader } from "../voice/Reader";
import { CameraView } from "../voice/CameraView";
import { camera } from "../voice/camera";
import { lessonWork } from "../voice/workStore";
import { reader, useReader } from "../voice/readerStore";
import {
  lessonNavigator,
  useWhiteboard,
  whiteboard,
  type LessonSection,
} from "../voice/whiteboardStore";
import "../styles/lessons.css";

const VoiceTutor = lazy(() =>
  import("../voice/VoiceTutor").then((module) => ({
    default: module.VoiceTutor,
  })),
);
const sections = [
  { id: "learn", title: "Understand", number: "01" },
  { id: "explore", title: "Explore", number: "02" },
  { id: "practice", title: "Practice", number: "03" },
  { id: "words", title: "Words", number: "04" },
  { id: "reflect", title: "Reflect", number: "05" },
] as const;
type LessonTab = (typeof sections)[number]["id"];

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
  const [voiceLoaded, setVoiceLoaded] = useState(false),
    [voiceBusy, setVoiceBusy] = useState(false),
    /**
     * The lesson text, its sections, the scratchpad and the materials all live
     * behind one menu, closed by default. Virgil and the shared board are the
     * lesson; everything else is reference material you reach for.
     */
    [menuOpen, setMenuOpen] = useState(false);
  const [completed, setCompleted] = useState(lesson.status === "completed"),
    [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [learningFocus, setLearningFocus] = useState(
    "Understanding the main idea.",
  );
  const tutorRef = useRef<HTMLDivElement>(null);
  const journeyRef = useRef<HTMLElement>(null);
  const board = useWhiteboard();
  const readerState = useReader();
  const [cameraOn, setCameraOn] = useState(camera.active);
  useEffect(() => camera.onChange(setCameraOn), []);
  useEffect(() => () => camera.stop(), []);
  const [practiceSelection, setPracticeSelection] = useState<
    { index: number; nonce: number } | undefined
  >(undefined);
  const journal = useLearningJournal(lesson.id);
  const info = subjectInfo(lesson.subject);
  const [initialDraft] = useState(() => {
    let notes = "";
    let savedAnswers: Record<string, string> = {};
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(`smarticus-draft-${lesson.id}`) ?? "{}",
      );
      notes = typeof stored?.notes === "string" ? stored.notes : "";
      savedAnswers = Object.fromEntries(
        Object.entries(stored?.answers ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    } catch {
      /* Local answers can still be recovered below. */
    }
    const answers: Record<string, string> = {};
    try {
      [
        lesson.guided_practice,
        lesson.independent_practice,
        lesson.exit_ticket,
      ].forEach((items, section) =>
        items.forEach((item) => {
          const value = localStorage.getItem(
            `virgil-response:${lesson.id}:${item.id}`,
          );
          if (value !== null) answers[`${section}-${item.id}`] = value;
        }),
      );
    } catch {
      /* Session drafts remain usable when local storage is restricted. */
    }
    return { notes, answers: { ...answers, ...savedAnswers } };
  });
  const [notes, setNotes] = useState(initialDraft.notes),
    [answers, setAnswers] = useState(initialDraft.answers),
    [saveState, setSaveState] = useState("");
  useEffect(() => {
    let saved = true;
    try {
      sessionStorage.setItem(
        `smarticus-draft-${lesson.id}`,
        JSON.stringify({ notes, answers }),
      );
    } catch {
      saved = false;
    }
    try {
      [
        lesson.guided_practice,
        lesson.independent_practice,
        lesson.exit_ticket,
      ].forEach((items, section) =>
        items.forEach((item) => {
          const value = answers[`${section}-${item.id}`];
          if (value !== undefined)
            localStorage.setItem(
              `virgil-response:${lesson.id}:${item.id}`,
              value,
            );
        }),
      );
    } catch {
      saved = false;
    }
    setSaveState(
      saved
        ? "Practice saved on this device. Scratchpad stays in this tab."
        : "A draft couldn’t save. Copy your work before leaving.",
    );
  }, [notes, answers, lesson]);
  useEffect(() => {
    onBusyChange(voiceBusy || completing);
  }, [voiceBusy, completing, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const changeSection = (next: LessonTab) => {
    if (next === tab) return;
    setTab(next);
    setLearningFocus(
      `Learning section: ${sections.find((section) => section.id === next)?.title}. Lesson: ${lesson.lesson_title}.`,
    );
  };
  const changeSectionRef = useRef(changeSection);
  changeSectionRef.current = changeSection;
  const practiceCount =
    lesson.guided_practice.length +
    lesson.independent_practice.length +
    lesson.exit_ticket.length;

  /**
   * Teach the Hand in button, and Virgil, how to read and send this lesson's
   * answers. Both go through one path, so a submission Virgil makes and one
   * Atticus makes are the same submission.
   */
  const answersRef = useRef(answers);
  answersRef.current = answers;
  useEffect(() => {
    lessonWork.reset();
    const sections = [
      ["guided_practice", lesson.guided_practice],
      ["independent_practice", lesson.independent_practice],
      ["exit_ticket", lesson.exit_ticket],
    ] as const;
    const collect = () =>
      sections.flatMap(([section, items], sectionIndex) =>
        items.map((item) => ({
          item_id: item.id,
          section,
          prompt: item.prompt,
          answer: answersRef.current[`${sectionIndex}-${item.id}`] ?? "",
        })),
      );
    lessonWork.register({
      collect,
      submit: async (request) =>
        api.tool.submitWork({
          lesson_id: lesson.id,
          mode: request.mode,
          // Paper work is the photograph; the typed boxes are not part of it.
          answers: request.mode === "paper" ? [] : collect(),
          photos: request.photos ?? [],
          ...(request.note ? { note: request.note } : {}),
        }),
    });
    return () => lessonWork.register(null);
  }, [lesson.id, lesson.guided_practice, lesson.independent_practice, lesson.exit_ticket]);
  useEffect(() => {
    // Let the voice tutor move the interface: open a section, jump to a question.
    lessonNavigator.register(({ section, questionNumber }) => {
      const target = sections.find((entry) => entry.id === (section as LessonSection));
      if (!target) return `Unknown section "${section}".`;
      changeSectionRef.current(target.id);
      // Opening a section the learner cannot see is not navigation. The menu
      // comes forward with it, and the answer says so.
      setMenuOpen(true);
      let detail = `Opened the ${target.title} section in the lesson menu.`;
      if (questionNumber && target.id === "practice") {
        if (questionNumber > practiceCount || practiceCount === 0) {
          detail += ` This lesson has ${practiceCount} practice questions, so question ${questionNumber} does not exist.`;
        } else {
          setPracticeSelection({ index: questionNumber - 1, nonce: Date.now() });
          detail += ` Showing practice question ${questionNumber} of ${practiceCount}.`;
        }
      }
      requestAnimationFrame(() =>
        journeyRef.current?.scrollIntoView({ behavior: "auto", block: "start" }),
      );
      return detail;
    });
    return () => lessonNavigator.register(null);
  }, [practiceCount]);
  useEffect(() => () => whiteboard.setOpen(false), []);
  const onQuestionFocus = useCallback(
    (value: string) => setLearningFocus(value),
    [],
  );
  const discuss = (value: string) => {
    setLearningFocus(value);
    // "Talk this through with Virgil" means look at Virgil, so the menu that
    // was covering him gets out of the way.
    setMenuOpen(false);
    setVoiceLoaded(true);
    requestAnimationFrame(() =>
      tutorRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" }),
    );
  };
  async function completeLesson() {
    setCompleting(true);
    setCompletionError(null);
    try {
      await api.tool.lessonCompleted(lesson.id);
      setCompleted(true);
    } catch {
      setCompletionError("Completion couldn’t save. Please try again.");
    } finally {
      setCompleting(false);
    }
  }
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: "spring", stiffness: 240, damping: 30 }}
    >
      <div
        className="lesson-workspace zen-workspace studio"
        data-menu={menuOpen ? "open" : "closed"}
      >
        <div className="studio-bar">
          <button
            className="text-button"
            disabled={voiceBusy || completing}
            onClick={onBack}
          >
            <Icon name="back" size={16} />
            My learning day
          </button>
          <header className="zen-lesson-header">
            <div className="lesson-kicker">
              <span className={`subject-icon ${info.color}`}>
                <Icon name={info.icon} size={17} />
              </span>
              {info.label}
            </div>
            <h1>{lesson.lesson_title}</h1>
            <p>{lesson.unit_title}</p>
          </header>
          <div className="studio-bar-actions">
            <button
              className="focus-switch"
              aria-pressed={board.open}
              onClick={() => whiteboard.setOpen(!board.open)}
            >
              <Icon name="pen" size={15} />
              {board.open ? "Hide whiteboard" : "Whiteboard"}
            </button>
            <button
              className="focus-switch"
              aria-pressed={cameraOn}
              onClick={() =>
                cameraOn ? camera.stop() : void camera.start().catch(() => undefined)
              }
            >
              <Icon name="camera" size={15} />
              {cameraOn ? "Close camera" : "Camera"}
            </button>
            <button
              className="studio-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="lesson-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="compass" size={15} />
              Lesson
            </button>
          </div>
        </div>
        {voiceBusy && (
          <p className="session-notice">
            Your voice session stays with you across lesson sections. End it
            before leaving this lesson.
          </p>
        )}
        <div className="virgil-stage" ref={tutorRef}>
          <div
            className="stage-surfaces"
            data-empty={!board.open && !readerState.open && !cameraOn}
          >
            {board.open && <Whiteboard onClose={() => whiteboard.setOpen(false)} />}
            {cameraOn && <CameraView onClose={() => camera.stop()} />}
            {readerState.open && <Reader onClose={() => reader.close()} />}
            {!board.open && !readerState.open && !cameraOn && (
              <div className="stage-empty">
                <p>
                  The board, the camera and the reading panel open when you or
                  Virgil need them.
                </p>
                <div className="stage-empty-actions">
                  <button
                    className="text-button"
                    onClick={() => whiteboard.setOpen(true)}
                  >
                    Open the whiteboard
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void camera.start().catch(() => undefined)}
                  >
                    Show Virgil my paper
                  </button>
                </div>
              </div>
            )}
          </div>
          <section className="voice-panel">
            {voiceLoaded ? (
              <Suspense fallback={<p role="status">Getting Virgil ready…</p>}>
                <VoiceTutor
                  lessonId={lesson.id}
                  lessonTitle={lesson.lesson_title}
                  learningFocus={learningFocus}
                  onBusyChange={setVoiceBusy}
                />
              </Suspense>
            ) : (
              <>
                <div className="companion-heading">
                  <span>VIRGIL</span>
                  <span className="companion-ready">Here for you</span>
                </div>
                <VirgilAvatar state="idle" />
                <h2>A little help, when you need it.</h2>
                <p>Ask why. Try a different example. Think out loud.</p>
                <button
                  className="button dark"
                  onClick={() => setVoiceLoaded(true)}
                >
                  <Icon name="mic" size={16} />
                  Talk with Virgil
                </button>
                <small>Your microphone stays off until you connect.</small>
              </>
            )}
          </section>
          <p className="studio-now">
            <span>Now</span> {learningFocus}
          </p>
        </div>
        {menuOpen && (
          <button
            className="lesson-menu-scrim"
            aria-label="Close the lesson menu"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside id="lesson-menu" className="lesson-menu" hidden={!menuOpen}>
          <div className="lesson-menu-head">
            <h2>Lesson</h2>
            <button className="text-button" onClick={() => setMenuOpen(false)}>
              Close
              <Icon name="close" size={15} />
            </button>
          </div>
          <section className="lesson-drawer">
            <nav
              ref={journeyRef}
              className="journey-nav"
              aria-label="Lesson sections"
            >
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => changeSection(section.id)}
                  aria-current={tab === section.id ? "step" : undefined}
                >
                  <span>{section.number}</span>
                  {section.title}
                  {tab === section.id && (
                    <motion.i
                      layoutId={`lesson-tab-${lesson.id}`}
                      className="journey-indicator"
                    />
                  )}
                </button>
              ))}
            </nav>
            <Scene id={tab}>
              {tab === "learn" ? (
                <UnderstandPanel
                  lesson={lesson}
                  journal={journal}
                  onExplore={() => changeSection("explore")}
                />
              ) : tab === "explore" ? (
                <LessonActivities
                  lesson={lesson}
                  journal={journal}
                  onFocus={onQuestionFocus}
                  onDiscuss={discuss}
                />
              ) : tab === "practice" ? (
                <PracticePanel
                  lesson={lesson}
                  answers={answers}
                  onAnswer={(id, value) =>
                    setAnswers((previous) => ({ ...previous, [id]: value }))
                  }
                  onFocus={onQuestionFocus}
                  onDiscuss={discuss}
                  selection={practiceSelection}
                />
              ) : tab === "words" ? (
                <WordsPanel lesson={lesson} journal={journal} />
              ) : (
                <>
                  <ReflectPanel lesson={lesson} journal={journal} />
                  <section className="zen-completion">
                    <span className="eyebrow">A GOOD PLACE TO PAUSE</span>
                    <h3>
                      {completed
                        ? "Lesson complete. Keep the curiosity."
                        : "Ready to close this chapter?"}
                    </h3>
                    <p>
                      You can come back to any idea. Completing a lesson doesn’t
                      automatically mark its skills as mastered.
                    </p>
                    <button
                      className="button dark"
                      onClick={() => void completeLesson()}
                      disabled={completed || voiceBusy || completing}
                    >
                      {completed
                        ? "Lesson completed"
                        : completing
                          ? "Saving…"
                          : "Mark lesson complete"}
                      <Icon name="check" size={17} />
                    </button>
                    {completionError && (
                      <p className="inline-error" role="alert">
                        {completionError}
                      </p>
                    )}
                  </section>
                </>
              )}
            </Scene>
            <div className="journal-status" role="status">
              <span className={journal.saved ? "" : "save-warning"} />
              {journal.saved
                ? "Your reflections are saved on this device."
                : "Your reflections couldn’t save. Copy them before leaving."}
            </div>
          </section>
          <details className="zen-scratchpad">
            <summary>
              <Icon name="pen" size={16} />
              My scratchpad
            </summary>
            <label className="sr-only" htmlFor="lesson-notes">
              Scratchpad notes
            </label>
            <textarea
              id="lesson-notes"
              placeholder="A thought worth keeping…"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <small role="status">{saveState}</small>
          </details>
          {lesson.materials.length > 0 && (
            <details className="zen-materials">
              <summary>
                Things to have nearby <span>{lesson.materials.length}</span>
              </summary>
              {lesson.materials.map((material, i) => (
                <p key={i}>
                  <Icon name="check" size={14} />
                  {material}
                </p>
              ))}
            </details>
          )}
        </aside>
      </div>
    </MotionConfig>
  );
}
