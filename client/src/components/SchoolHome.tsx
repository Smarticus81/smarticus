import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolAssignment, SchoolContext } from "../../../shared/schoolContext";
import { api, ApiError } from "../lib/api";
import type { SchoolPlanState } from "../lib/types";
import { subjectInfo } from "../lib/subjects";
import { Icon } from "./Icon";
import { SchoolLessonWorkspace } from "./SchoolLessonWorkspace";
import "../styles/school-home.css";

export function SchoolSourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  return <a href={url} target="_blank" rel="noreferrer">{children} <span aria-hidden="true">↗</span></a>;
}

export function schoolSnapshotTime(context: SchoolContext) {
  const zone = context.timeZone ?? "UTC";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short",
  }).format(new Date(context.asOf));
}

async function parentAccess(path: "login" | "logout", code?: string) {
  const response = await fetch(`/api/parent/${path}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: code === undefined ? undefined : JSON.stringify({ code }), signal: AbortSignal.timeout(30_000),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error ?? "Could not update school access.", response.status);
}

export function SchoolHome({ name, onBusyChange }: { name: string; onBusyChange: (busy: boolean) => void }) {
  const [plan, setPlan] = useState<SchoolPlanState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "locked" | "error">("loading");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState("all");
  const [code, setCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const unlockingRef = useRef(false);
  const readVersion = useRef(0);
  const mounted = useRef(true);
  const lockedLocally = useRef(false);
  const revision = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const clearPrivateView = useCallback((notice: string) => {
    ++readVersion.current;
    revision.current = null;
    setSelected(null);
    setPlan(null);
    setCode("");
    setCourseFilter("all");
    setStatus("locked");
    setMessage(notice);
    onBusyChange(false);
  }, [onBusyChange]);

  const load = useCallback(async (afterLogin = false) => {
    if (lockedLocally.current) return;
    const version = ++readVersion.current;
    try {
      const result = await api.parentSchoolContext();
      if (!mounted.current || version !== readVersion.current) return;
      if (revision.current !== null && revision.current !== result.revision) {
        setSelected(null);
        setMessage("Your school plan was updated. Choose an assignment to use the latest instructions.");
      } else if (afterLogin) setMessage("");
      revision.current = result.revision;
      setPlan(previous => previous?.revision === result.revision ? previous : result);
      if (!result.context?.active) setSelected(null);
      setStatus("ready");
    } catch (caught) {
      if (!mounted.current || version !== readVersion.current) return;
      if (caught instanceof ApiError && caught.status === 401) {
        clearPrivateView(afterLogin
          ? "The code was accepted, but this browser could not stay signed in. Ask your parent to check browser cookies and try again."
          : "Use the existing parent access code to open your schoolwork on this browser.");
      } else {
        setMessage("Your school plan couldn’t refresh. Check your connection and try again.");
        setStatus(current => current === "ready" ? "ready" : "error");
      }
    }
  }, [clearPrivateView]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; ++readVersion.current; onBusyChange(false); };
  }, [load, onBusyChange]);
  useEffect(() => {
    if (status !== "ready") return;
    const check = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [load, status]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selected, status]);

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    setUnlocking(true); setMessage("");
    try {
      await parentAccess("login", code);
      if (!mounted.current) return;
      setCode("");
      lockedLocally.current = false;
      await load(true); // An accepted code is not proof that the browser retained the existing session cookie.
    } catch (caught) {
      if (mounted.current) setMessage(caught instanceof Error ? caught.message : "Schoolwork couldn’t unlock. Try again.");
    } finally { unlockingRef.current = false; if (mounted.current) setUnlocking(false); }
  };
  const lock = () => {
    lockedLocally.current = true;
    clearPrivateView("Schoolwork is closed on this screen.");
    void parentAccess("logout").catch(() => {
      if (mounted.current) setMessage("Schoolwork is hidden here, but the server couldn’t confirm sign-out. Close this browser or try locking again before sharing it.");
    });
  };
  const accessLost = useCallback(() => {
    clearPrivateView("Your school session has ended. Ask your parent to unlock schoolwork again.");
  }, [clearPrivateView]);
  const context = plan?.context;
  const assignment = context?.assignments?.find(item => item.id === selected);

  if (status === "loading") return <div className="school-loading" role="status"><Icon name="book" size={30} /><p>Opening your school day…</p></div>;
  if (status === "locked") return <section className="school-locked">
    <div className="school-locked-intro">
      <span className="eyebrow">YOUR SCHOOL DAY</span>
      <h1 ref={heading} tabIndex={-1}>Your schoolwork,<br /><em>with Virgil.</em></h1>
      <p>Open your assignments, see your school schedule, and work through each step with your tutor.</p>
      <div className="school-locked-art" aria-hidden="true"><Icon name="book" size={72} /><span>Ask. Explore. Understand.</span></div>
    </div>
    <form className="school-unlock-form" onSubmit={event => void unlock(event)}>
      <Icon name="star" size={28} /><h2>Let’s open your school day.</h2>
      <p>Ask your parent to enter the existing parent access code. Your schoolwork will open right here.</p>
      <label htmlFor="school-access-code">Parent access code</label>
      <input id="school-access-code" type="password" inputMode="numeric" autoComplete="current-password" required value={code} onChange={event => setCode(event.target.value)} disabled={unlocking} />
      <button className="button dark" disabled={unlocking}>{unlocking ? "Opening schoolwork…" : "Unlock schoolwork"}<Icon name="arrow" size={18} /></button>
      {message && <p className="school-access-message" role="status">{message}</p>}
    </form>
  </section>;
  if (status === "error") return <section className="empty-state"><h1 ref={heading} tabIndex={-1}>Let’s reconnect.</h1><p role="alert">{message}</p><button className="button dark" onClick={() => void load()}>Try again</button></section>;

  return <div className="school-home">
    <div className="school-access-bar">
      <span>{context?.sourceName ?? "School day"}{context ? ` · ${context.schoolYear}` : ""}</span>
      <div><button className="text-button" onClick={() => void load()}>Refresh plan</button><button className="text-button" onClick={lock}>Lock schoolwork</button></div>
    </div>
    {message && <p className="school-update-notice" role="status">{message}</p>}
    {context?.active && assignment && plan ? <SchoolLessonWorkspace
      key={`${assignment.id}:${plan.revision}`} assignment={assignment} context={context} revision={plan.revision}
      onBack={() => setSelected(null)} onBusyChange={onBusyChange} onSchoolAccessLost={accessLost}
    /> : !context?.active ? <section className="school-empty">
      <span className="eyebrow">YOUR SCHOOL DAY</span><h1 ref={heading} tabIndex={-1}>A space for your schoolwork.</h1>
      <p>{context ? "Your saved school plan is paused." : "Your school plan hasn’t been added yet."} Once it’s ready, your assignments and schedule will appear here.</p>
      <a className="button dark" href="/parent">Open parent records<Icon name="arrow" size={17} /></a>
    </section> : <>
      <header className="school-day-heading">
        <div><span className="eyebrow">YOUR SCHOOL DAY</span><h1 ref={heading} tabIndex={-1}>Let’s make it click, {name}.</h1><p>Pick your schoolwork. Virgil will help you understand it, one step at a time.</p></div>
        <div className="school-heading-mark" aria-hidden="true"><Icon name="star" size={36} /></div>
      </header>
      <div className="school-day-grid">
        <section className="school-assignments" aria-label="School assignments">
          <div className="school-section-heading"><h2>Your schoolwork</h2><label><span className="sr-only">Filter schoolwork by course</span><select value={courseFilter} onChange={event => setCourseFilter(event.target.value)}><option value="all">All courses</option>{context.courses.map(course => <option key={course.id} value={course.id}>{course.label}</option>)}</select></label></div>
          <AssignmentGroups context={context} courseFilter={courseFilter} onSelect={setSelected} />
          <p className="school-fineprint">Work through assignments in the order shown. Meeting times are separate from assignment order. Check your school portal for due dates and hand in your work there.</p>
        </section>
        <aside className="school-schedule" aria-label="School schedule">
          <div className="school-section-heading"><h2>Your schedule</h2><Icon name="clock" size={19} /></div>
          <p className="school-schedule-zone">School time zone: <strong>{context.timeZone ?? "Not yet confirmed"}</strong></p>
          {context.timezoneNote && <p className="school-timezone-note">{context.timezoneNote}</p>}
          {context.schedule.length ? <ol className="school-schedule-list">{context.schedule.map((item, index) => <li key={index}>
            <h3>{item.label}</h3><p className="school-schedule-when">{item.when || "Check the school portal for the time."}</p>
            <p className="school-fineprint">{item.timeZone ?? "Time zone not confirmed"}{item.verification !== "verified" ? " · Confirm in your school portal" : ""}</p>
            {item.notes && <p>{item.notes}</p>}{item.sourceUrl && <SchoolSourceLink url={item.sourceUrl}>View schedule source</SchoolSourceLink>}
          </li>)}</ol> : <p>No meeting times are saved yet. Check your school portal for the latest schedule.</p>}
          <p className="school-fineprint">Times are shown as recorded, without time-zone conversion.</p>
        </aside>
      </div>
      <section className="school-course-reference"><h2>Your courses</h2><div className="school-reference-courses">{context.courses.map(course => {
        const subject = subjectInfo(course.subject);
        return <article key={course.id}><span className={`subject-icon ${subject.color}`}><Icon name={subject.icon} size={20} /></span><h3>{course.label}</h3>{course.focus && <p>{course.focus}</p>}{course.sourceUrl && <SchoolSourceLink url={course.sourceUrl}>Open school course</SchoolSourceLink>}</article>;
      })}</div></section>
      {(context.summary || context.workload.length > 0 || context.cautions.length > 0 || context.sources.length > 0) && <details className="school-plan-reference"><summary>Planning notes & sources</summary>
        {context.summary && <p>{context.summary}</p>}
        {context.workload.map((item, index) => <p key={index}><strong>{item.label}.</strong> {item.detail}{item.verification !== "verified" ? " Confirm in your school portal." : ""}</p>)}
        {context.cautions.length > 0 && <ul>{context.cautions.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        {context.sources.length > 0 && <ul>{context.sources.map((source, index) => <li key={index}><SchoolSourceLink url={source.url}>{source.label}</SchoolSourceLink></li>)}</ul>}
      </details>}
      <footer className="school-snapshot">Plan checked <time dateTime={context.asOf}>{schoolSnapshotTime(context)}</time>. This saved plan doesn’t sync automatically. Your school portal has the official assignments, due dates, and grades.</footer>
    </>}
  </div>;
}

function AssignmentGroups({ context, courseFilter, onSelect }: { context: SchoolContext; courseFilter: string; onSelect: (id: string) => void }) {
  const assignments = [...(context.assignments ?? [])].filter(item => courseFilter === "all" || item.courseId === courseFilter).sort((a, b) => a.sequence - b.sequence);
  if (!assignments.length) return <div className="school-assignment-empty"><Icon name="book" size={28} /><h3>No assignments saved{courseFilter !== "all" ? " for this course" : " yet"}.</h3><p>Open your school course below to check your assignment queue. A parent can add the exact instructions to your school plan.</p></div>;
  const group = (statuses: SchoolAssignment["status"][], label: string) => {
    const items = assignments.filter(item => statuses.includes(item.status));
    if (!items.length) return null;
    return <section className="school-assignment-group" aria-label={label}><h3>{label}</h3>{items.map(item => {
      const course = context.courses.find(candidate => candidate.id === item.courseId)!;
      const info = subjectInfo(course.subject);
      return <article className={`school-assignment-card school-assignment--${item.status}`} key={item.id}>
        <div className="school-assignment-course"><span className={`subject-icon ${info.color}`}><Icon name={info.icon} size={20} /></span><span>{course.label}</span><span className="school-assignment-kind">{item.kind}</span></div>
        <h4>{item.title}</h4>{item.unit && <p className="school-assignment-unit">{item.unit}</p>}
        <p className="school-assignment-preview">{item.instructions[0]}</p>
        {item.timingNote && <p className="school-assignment-timing"><Icon name="clock" size={14} />{item.timingNote}</p>}
        <div className="school-assignment-actions">{!["complete", "skipped"].includes(item.status) && <button className={`button ${item.status === "current" ? "dark" : "outline"}`} onClick={() => onSelect(item.id)}>Open assignment<Icon name="arrow" size={17} /></button>}{(item.sourceUrl || course.sourceUrl) && <SchoolSourceLink url={item.sourceUrl ?? course.sourceUrl!}>School source</SchoolSourceLink>}</div>
      </article>;
    })}</section>;
  };
  return <>{group(["current"], "Start here")}{group(["next"], "Up next")}{assignments.some(item => item.status === "later") && <details className="school-later-work"><summary>Later in your school plan</summary>{group(["later"], "Coming later")}</details>}{assignments.some(item => ["complete", "skipped"].includes(item.status)) && <details className="school-later-work"><summary>Earlier schoolwork</summary><p className="school-fineprint">Status comes from the saved school plan. Tutoring here doesn’t change school completion.</p>{group(["complete"], "Recorded complete")}{group(["skipped"], "Recorded skipped")}</details>}</>;
}
