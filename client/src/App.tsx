import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiError } from "./lib/api";
import type { LessonView, ScheduleView, StudentSnapshot } from "./lib/types";
import { friendlyDate, localDate, subjectInfo } from "./lib/subjects";
import { Icon, type IconName } from "./components/Icon";
import { LessonWorkspace } from "./components/LessonWorkspace";
import { DiscoveryLab } from "./components/DiscoveryLab";

type Page = "today" | "subjects" | "lab" | "progress";
const navigation: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "today", label: "My day", icon: "home" },
  { id: "subjects", label: "My subjects", icon: "compass" },
  { id: "lab", label: "Discovery lab", icon: "flask" },
  { id: "progress", label: "My progress", icon: "chart" },
];

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return navigation.find((item) => item.id === requested)?.id ?? "today";
  });
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [snapshot, setSnapshot] = useState<StudentSnapshot | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("date");
    return requested &&
      /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
      !Number.isNaN(Date.parse(requested))
      ? requested
      : localDate();
  });
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const loadVersion = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const load = useCallback(async (selectedDate: string) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.todaySchedule(selectedDate);
      if (version === loadVersion.current) setSchedule(result);
    } catch (caught) {
      if (version !== loadVersion.current) return;
      if (caught instanceof ApiError && caught.status === 401)
        setNeedsAuthentication(true);
      else
        setError(
          "Your learning plan couldn’t load. Try again in a moment, or explore the Discovery Lab.",
        );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);
  const loadProgress = useCallback(() => {
    setProgressError(false);
    void api
      .studentSnapshot()
      .then(setSnapshot)
      .catch(() => setProgressError(true));
  }, []);
  useEffect(() => {
    void load(date);
  }, [date, load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    url.searchParams.set("view", page);
    window.history.replaceState(null, "", url);
  }, [date, page]);
  useEffect(() => {
    void api
      .scheduleDates()
      .then(setDates)
      .catch(() => undefined);
    loadProgress();
  }, [loadProgress]);
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [page, lesson]);
  const navigate = (next: Page) => {
    if (lesson) {
      setLesson(null);
      void load(date);
      loadProgress();
    }
    setPage(next);
    setSearch("");
    setFilter("all");
  };
  const closeLesson = () => {
    setLesson(null);
    void load(date);
    loadProgress();
  };
  const openLesson = (candidate: LessonView) => {
    if (voiceBusy || selectingRef.current) return;
    selectingRef.current = true;
    setSelectionPending(true);
    setSelectionError(null);
    void api
      .selectLesson(candidate.id)
      .then(setLesson)
      .catch(() =>
        setSelectionError(
          "That lesson couldn’t open. Try again so Virgil has the right lesson context.",
        ),
      )
      .finally(() => {
        selectingRef.current = false;
        setSelectionPending(false);
      });
  };
  const lessons = schedule?.lessons ?? [];
  const nextLesson =
    lessons.find((item) => ["started", "in_progress"].includes(item.status)) ??
    lessons.find((item) => item.status !== "completed") ??
    lessons[0];
  const completed = lessons.filter(
    (item) => item.status === "completed",
  ).length;
  const name =
    snapshot?.student.preferredName ??
    schedule?.student?.preferredName ??
    "Atticus";
  const visibleLessons = lessons.filter(
    (item) =>
      (filter === "all" || item.subject === filter) &&
      `${item.lesson_title} ${subjectInfo(item.subject).label}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (needsAuthentication) return <LoginScreen />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            if (!voiceBusy && !selectionPending) navigate("today");
          }}
          aria-label="Smarticus home"
        >
          <span className="brand-mark">
            <Icon name="star" size={25} />
          </span>
          smarticus<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">YOUR LEARNING UNIVERSE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              disabled={voiceBusy || selectionPending}
              aria-label={item.label}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "lab" && <span className="new-label">TRY IT</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="star" size={23} />
            <p>
              Big ideas start with
              <br />
              <strong>“What if?”</strong>
            </p>
            <span>Keep asking, {name}.</span>
          </div>
          <div className="profile">
            <div className="avatar">{name[0]}</div>
            <div>
              <strong>{name}’s space</strong>
              <span>Grade {snapshot?.student.gradeLevel ?? 6} · 2026–27</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Your space</span>
            <Icon name="chevron" size={13} />
            <strong>
              {lesson
                ? "Lesson studio"
                : navigation.find((item) => item.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-date">
              <Icon name="sun" size={16} />
              {friendlyDate(localDate(), true)}
            </span>
            <div className="avatar avatar-small" aria-label={name}>
              {name[0]}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          aria-busy={selectionPending}
          className={`main-content ${lesson ? "main-content--lesson" : ""}`}
        >
          {selectionPending && (
            <p className="session-notice" role="status">
              Opening your lesson…
            </p>
          )}
          {selectionError && (
            <p className="inline-error" role="alert">
              {selectionError}
            </p>
          )}
          {lesson ? (
            <LessonWorkspace
              key={lesson.id}
              lesson={lesson}
              onBack={closeLesson}
              onBusyChange={setVoiceBusy}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "today"
                      ? "A LITTLE CURIOSITY. A LOT OF POSSIBILITY."
                      : page === "subjects"
                        ? "SO MANY WAYS TO SEE THE WORLD"
                        : page === "lab"
                          ? "LESS SCROLLING. MORE EXPERIMENTING."
                          : "LOOK HOW FAR YOU’RE GOING"}
                  </span>
                  <h1>
                    {page === "today" ? (
                      <>
                        Hey, {name}
                        <span className="greeting-spark">✳</span>
                      </>
                    ) : page === "subjects" ? (
                      "Find your next big idea."
                    ) : page === "lab" ? (
                      "Wonder. Try. Discover."
                    ) : (
                      "Small steps. Real growth."
                    )}
                  </h1>
                  <p>
                    {page === "today"
                      ? "Ready to make a little more sense of the world?"
                      : page === "subjects"
                        ? "Pick a subject and see where it takes you."
                        : page === "lab"
                          ? "A space to play with ideas. Change something and see what happens."
                          : "Understanding takes practice. Every question is a step forward."}
                  </p>
                </div>
                {(page === "today" || page === "subjects") && (
                  <label className="date-picker">
                    <Icon name="book" size={17} />
                    <span className="sr-only">Learning day</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => {
                        if (event.target.value) setDate(event.target.value);
                      }}
                    />
                  </label>
                )}
              </div>
              {(page === "today" || page === "subjects") && loading ? (
                <div
                  className="skeleton-grid"
                  role="status"
                  aria-label="Loading your learning plan"
                >
                  <div className="skeleton skeleton-hero" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : (page === "today" || page === "subjects") && error ? (
                <div className="empty-state">
                  <Icon name="compass" size={36} />
                  <h2>Let’s reconnect.</h2>
                  <p role="alert">{error}</p>
                  <button
                    className="button primary"
                    onClick={() => void load(date)}
                  >
                    Try again <Icon name="arrow" />
                  </button>
                </div>
              ) : null}
              {page === "today" && !loading && !error && (
                <>
                  <div className="home-top-grid">
                    <section className="hero-card">
                      <div className="hero-copy">
                        <span className="pill">
                          <span className="tiny-dot" />
                          {nextLesson
                            ? completed === lessons.length
                              ? "PLAN COMPLETE"
                              : "YOUR NEXT CHAPTER"
                            : "OPEN SPACE, OPEN MIND"}
                        </span>
                        <h2>
                          {nextLesson ? (
                            <>
                              Big thinking.
                              <br />
                              <em>One lesson away.</em>
                            </>
                          ) : (
                            <>
                              A day to wonder.
                              <br />
                              <em>Room to explore.</em>
                            </>
                          )}
                        </h2>
                        <p>
                          {nextLesson
                            ? subjectInfo(nextLesson.subject).label +
                              " · " +
                              nextLesson.lesson_title
                            : "Take a breather, revisit a learning day, or follow your curiosity into the lab."}
                        </p>
                        <button
                          className="button dark"
                          onClick={() =>
                            nextLesson
                              ? openLesson(nextLesson)
                              : navigate("lab")
                          }
                        >
                          {nextLesson
                            ? ["started", "in_progress"].includes(
                                nextLesson.status,
                              )
                              ? "Continue learning"
                              : completed === lessons.length
                                ? "Revisit a lesson"
                                : "Let’s get into it"
                            : "Explore the lab"}
                          <Icon name="arrow" size={19} />
                        </button>
                        {nextLesson && (
                          <span className="hero-footnote">
                            <Icon name="clock" size={14} />
                            {nextLesson.estimated_minutes} min · Go at your own
                            pace
                          </span>
                        )}
                      </div>
                      <OrbitArt />
                    </section>
                    <section className="day-card">
                      <div className="section-top">
                        <h3>Your learning day</h3>
                        <Icon name="sun" size={20} />
                      </div>
                      <div
                        className="progress-ring"
                        style={
                          {
                            "--progress": `${lessons.length ? (completed / lessons.length) * 100 : 0}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <strong>
                            {completed}
                            <span>/{lessons.length}</span>
                          </strong>
                          <small>lessons complete</small>
                        </div>
                      </div>
                      <h4>
                        {completed && completed === lessons.length
                          ? "Look at you go."
                          : "A little progress, every day."}
                      </h4>
                      <p>
                        {lessons.length
                          ? "Take your time. Understanding is the goal."
                          : "Your next discovery is waiting in the lab."}
                      </p>
                      <div className="day-meta">
                        <span>{friendlyDate(date, true)}</span>
                        <span>
                          {lessons.length
                            ? `${lessons.reduce((sum, item) => sum + item.estimated_minutes, 0)} min planned`
                            : "No assigned lessons"}
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className="content-grid">
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>
                            Your learning path{" "}
                            <span className="count-badge">
                              {lessons.length}
                            </span>
                          </h2>
                          <p>
                            {date === localDate()
                              ? "Today’s plan"
                              : friendlyDate(date)}{" "}
                            · Choose where to begin
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("subjects")}
                        >
                          All subjects <Icon name="arrow" size={16} />
                        </button>
                      </div>
                      {lessons.length > 0 ? (
                        <div className="lesson-list">
                          {lessons.map((item, index) => (
                            <LessonRow
                              key={item.id}
                              lesson={item}
                              index={index}
                              onOpen={() => openLesson(item)}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyPlan dates={dates} onDate={setDate} />
                      )}
                    </section>
                    <aside className="home-aside">
                      <section className="tutor-promo">
                        <div className="section-top">
                          <span className="eyebrow">
                            MEET YOUR THINKING PARTNER
                          </span>
                          <Icon name="headphones" size={18} />
                        </div>
                        <div className="virgil-face">
                          <i />
                          <i />
                        </div>
                        <h3>A question? Ask Virgil.</h3>
                        <p>
                          Talk it through, get a fresh example, or untangle a
                          tricky idea. Your AI tutor is here to help you think.
                        </p>
                        <button
                          className="button outline"
                          onClick={() =>
                            nextLesson
                              ? openLesson(nextLesson)
                              : navigate("subjects")
                          }
                        >
                          {nextLesson
                            ? "Open lesson & talk"
                            : "Find a learning day"}
                          <Icon name="arrow" size={17} />
                        </button>
                      </section>
                      <button
                        className="lab-teaser"
                        onClick={() => navigate("lab")}
                      >
                        <span className="eyebrow">THE CURIOSITY CORNER</span>
                        <div className="mini-rays" aria-hidden="true">
                          ↗
                        </div>
                        <h3>
                          Can you bend
                          <br />a beam of light?
                        </h3>
                        <span>
                          Step into the reflection lab{" "}
                          <Icon name="arrow" size={17} />
                        </span>
                      </button>
                    </aside>
                  </div>
                </>
              )}
              {page === "subjects" && !loading && !error && (
                <>
                  <div className="subject-toolbar">
                    <div className="filter-chips" aria-label="Filter subjects">
                      <button
                        className={filter === "all" ? "selected" : ""}
                        aria-pressed={filter === "all"}
                        onClick={() => setFilter("all")}
                      >
                        All subjects
                      </button>
                      {[...new Set(lessons.map((item) => item.subject))].map(
                        (subject) => (
                          <button
                            key={subject}
                            className={filter === subject ? "selected" : ""}
                            aria-pressed={filter === subject}
                            onClick={() => setFilter(subject)}
                          >
                            {subjectInfo(subject).label}
                          </button>
                        ),
                      )}
                    </div>
                    <label className="search-input">
                      <Icon name="search" size={18} />
                      <input
                        placeholder="Find a lesson…"
                        aria-label="Search lessons"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                  </div>
                  {lessons.length === 0 ? (
                    <EmptyPlan dates={dates} onDate={setDate} />
                  ) : visibleLessons.length === 0 ? (
                    <div className="empty-state">
                      <h2>No matches yet.</h2>
                      <p>Try another subject or a shorter search.</p>
                      <button
                        className="button outline"
                        onClick={() => {
                          setFilter("all");
                          setSearch("");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <div className="subject-grid">
                      {visibleLessons.map((item) => {
                        const info = subjectInfo(item.subject);
                        return (
                          <button
                            className="subject-card"
                            key={item.id}
                            onClick={() => openLesson(item)}
                          >
                            <div className={`subject-art ${info.color}`}>
                              <Icon name={info.icon} size={56} />
                              <span className="art-circle" />
                              <span className="art-star">✳</span>
                              <span className="subject-status">
                                {item.status === "completed"
                                  ? "Completed"
                                  : `${item.estimated_minutes} min`}
                              </span>
                            </div>
                            <div className="subject-card-body">
                              <span className="eyebrow">{info.label}</span>
                              <h2>{item.lesson_title}</h2>
                              <p>{info.description}</p>
                              <span className="subject-open">
                                Open lesson <Icon name="arrow" size={18} />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {page === "lab" && <DiscoveryLab />}
              {page === "progress" && (
                <Progress
                  snapshot={snapshot}
                  error={progressError}
                  onRetry={loadProgress}
                />
              )}
              <footer className="page-footer">
                <span>
                  <Icon name="star" size={14} />
                  Made for your wonderfully curious mind.
                </span>
                <span>SMARTICUS · {schedule?.school_year ?? "2026–27"}</span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  index,
  onOpen,
}: {
  lesson: LessonView;
  index: number;
  onOpen: () => void;
}) {
  const info = subjectInfo(lesson.subject);
  return (
    <button className="lesson-row" onClick={onOpen}>
      <span className="lesson-number">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className={`subject-icon ${info.color}`}>
        <Icon name={info.icon} size={23} />
      </span>
      <span className="lesson-row-copy">
        <span>{info.label}</span>
        <strong>{lesson.lesson_title}</strong>
      </span>
      <span className="lesson-time">
        <Icon name="clock" size={14} />
        {lesson.estimated_minutes} min
      </span>
      <span
        className={`lesson-state ${lesson.status === "completed" ? "complete" : ""}`}
      >
        {lesson.status === "completed" ? (
          <Icon name="check" size={17} />
        ) : (
          <Icon name="arrow" size={17} />
        )}
      </span>
    </button>
  );
}
function EmptyPlan({
  dates,
  onDate,
}: {
  dates: string[];
  onDate: (date: string) => void;
}) {
  return (
    <div className="empty-state">
      <Icon name="book" size={32} />
      <h2>A little room for curiosity.</h2>
      <p>
        There’s no learning plan on this date.{" "}
        {dates.length
          ? "Revisit an available day below."
          : "When a learning plan is added, your lessons will appear here."}
      </p>
      <div className="available-dates">
        {dates.slice(0, 8).map((date) => (
          <button
            className="button outline"
            key={date}
            onClick={() => onDate(date)}
          >
            {friendlyDate(date, true)}
            <Icon name="arrow" size={15} />
          </button>
        ))}
      </div>
    </div>
  );
}
function Progress({
  snapshot,
  error,
  onRetry,
}: {
  snapshot: StudentSnapshot | null;
  error: boolean;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div className="empty-state">
        <h2>Progress couldn’t load.</h2>
        <p>Your learning records haven’t been changed.</p>
        <button className="button primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  if (!snapshot)
    return (
      <div
        className="skeleton skeleton-hero"
        role="status"
        aria-label="Loading progress"
      />
    );
  const secure = snapshot.mastery.filter((record) =>
    ["mastered", "proficient"].includes(record.status),
  ).length;
  const labels: Record<string, string> = {
    mastered: "Mastered",
    proficient: "Feeling solid",
    developing: "Building understanding",
    needs_reteach: "Worth another look",
    not_assessed: "Ready to explore",
  };
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="subject-icon lime">
            <Icon name="star" />
          </span>
          <strong>{secure}</strong>
          <span>Secure skills in recent records</span>
        </div>
        <div className="stat-card">
          <span className="subject-icon lavender">
            <Icon name="compass" />
          </span>
          <strong>{snapshot.mastery.length}</strong>
          <span>Recent skill records</span>
        </div>
        <div className="stat-card">
          <span className="subject-icon peach">
            <Icon name="mic" />
          </span>
          <strong>
            {
              snapshot.recentSessions.filter((session) => session.endedAt)
                .length
            }
          </strong>
          <span>Finished sessions in recent history</span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Your skills, taking shape</h2>
          <p>
            Based on your most recent learning records. Practice is part of the
            process.
          </p>
        </div>
      </div>
      {snapshot.mastery.length ? (
        <div className="mastery-grid">
          {snapshot.mastery.map((record) => (
            <article className="mastery-card" key={record.id}>
              <div className="section-top">
                <span
                  className={`subject-icon ${subjectInfo(record.subject).color}`}
                >
                  <Icon name={subjectInfo(record.subject).icon} />
                </span>
                <span
                  className={`skill-status ${["mastered", "proficient"].includes(record.status) ? "secure" : ""}`}
                >
                  {labels[record.status] ?? "In progress"}
                </span>
              </div>
              <span className="eyebrow">
                {subjectInfo(record.subject).label}
              </span>
              <h3>
                {record.standard
                  .replace(/^(?:[A-Z0-9.]+-)+/, "")
                  .replaceAll("-", " ")}
              </h3>
              {record.evidence && <p>{record.evidence}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Your story starts here.</h2>
          <p>
            Work through a lesson with Virgil to build a picture of what you
            understand.
          </p>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Recent conversations</h2>
          <p>A look back at what you’ve been exploring.</p>
        </div>
      </div>
      <div className="recent-sessions">
        {snapshot.recentSessions.length ? (
          snapshot.recentSessions.map((session) => (
            <div className="session-row" key={session.id}>
              <span
                className={`subject-icon ${subjectInfo(session.subject).color}`}
              >
                <Icon name="mic" />
              </span>
              <div>
                <strong>{session.lessonTitle}</strong>
                <p>
                  {subjectInfo(session.subject).label} ·{" "}
                  {friendlyDate(session.startedAt.slice(0, 10), true)}
                </p>
              </div>
              <span className="skill-status">
                {session.endedAt ? "Finished" : "Started"}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">
            Your conversations will appear here after you start learning with
            Virgil.
          </p>
        )}
      </div>
    </>
  );
}
function OrbitArt() {
  return (
    <div className="orbit-art" aria-hidden="true">
      <div className="orbit-path orbit-path-one" />
      <div className="orbit-path orbit-path-two" />
      <div className="orbit-path orbit-path-three" />
      <div className="planet-core">
        <span>?</span>
      </div>
      <div className="orbit-token token-math">
        <Icon name="math" size={28} />
      </div>
      <div className="orbit-token token-science">
        <Icon name="flask" size={29} />
      </div>
      <div className="orbit-token token-book">
        <Icon name="book" size={25} />
      </div>
      <span className="orbit-spark spark-one">✳</span>
      <span className="orbit-spark spark-two">✦</span>
      <span className="orbit-dot dot-one" />
      <span className="orbit-dot dot-two" />
      <div className="orbit-caption">THINK OUTSIDE THE ORBIT</div>
    </div>
  );
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
    <main className="login-stage">
      <div className="login-art">
        <span className="brand">
          <span className="brand-mark">
            <Icon name="star" size={25} />
          </span>
          smarticus.
        </span>
        <h1>
          A world of ideas.
          <br />
          <em>One curious mind.</em>
        </h1>
        <OrbitArt />
        <p>Your space to ask, explore, and figure things out.</p>
      </div>
      <form className="login-panel" onSubmit={(event) => void submit(event)}>
        <span className="eyebrow">WELCOME TO YOUR SPACE</span>
        <h2>Hey, Atticus.</h2>
        <p>
          Let’s see what you’ll discover today. Enter your family password to
          get started.
        </p>
        <label htmlFor="access-password">Family password</label>
        <input
          id="access-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          autoFocus
        />
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? "Opening your space…" : "Let’s explore"}
          <Icon name="arrow" />
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <span className="login-note">
          A private learning space, made for you.
        </span>
      </form>
    </main>
  );
}
