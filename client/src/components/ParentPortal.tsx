import type { SubmissionView } from "../../../shared/submissionRecord";
import "../styles/day30.css";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import "../styles/parent.css";

type SubjectGrade = {
  subject: string;
  score: number | null;
  display?: string;
  status: "reviewed" | "provisional" | "not_assessed" | "missing";
  note?: string;
};

type GradeDay = {
  date: string;
  day_number?: number;
  overall: number | null;
  overall_letter: string;
  note: string | null;
  subjects: SubjectGrade[];
  lesson_count: number;
  lesson_titles: Array<{ subject: string; title: string; unit: string }>;
  source: string | null;
};

type SubjectSummary = {
  subject: string;
  label: string;
  average: number | null;
  letter: string;
  graded_records: number;
  lessons_covered: number;
  lessons_total: number;
  progress_percent: number;
  current: { date: string; unit: string; lesson: string } | null;
  next: { date: string; unit: string; lesson: string } | null;
};

type OfficialCurriculum = {
  title: string;
  description: string;
  disclaimer: string;
  texas_context: { label: string; note: string; url: string };
  subjects: Array<{
    subject: string;
    label: string;
    basis: string;
    internal_source: string;
    sources: Array<{
      label: string;
      organization: string;
      url: string;
      role: string;
    }>;
    sequence: Array<{
      unit: number;
      title: string;
      topics: string[];
    }>;
  }>;
};

type Dashboard = {
  generated_at: string;
  school_year: string;
  grading_note: string;
  student: { preferred_name: string; grade_level: number };
  summary: { overall_average: number | null; overall_letter: string; graded_days: number; curriculum_days: number; today: string };
  days: GradeDay[];
  subjects: SubjectSummary[];
  transcript: Array<{ subject: string; course: string; grade: number | null; letter: string; graded_records: number; status: string }>;
  attendance: { instructional_days: number; present: number; partial: number; absent: number };
  ar: { semester_goal: number; earned: number; current_book: string; current_book_points: number; status: string } | null;
  portfolio: Array<{ title: string; subject: string; status: string; description: string; date?: string }>;
  course_descriptions: Array<{ subject: string; title: string; description: string }>;
  official_curriculum: OfficialCurriculum;
  submissions?: Array<SubmissionView & {date:string;subject:string;title:string}>;
};

type Tab = "submissions" | "overview" | "grades" | "curriculum" | "transcript" | "portfolio";
const subjectNames: Record<string,string> = {
  mathematics:"Math", literature:"Literature", writing:"Writing", science:"Science",
  history_geography:"History", french:"French", computer_science:"Builder Lab",
  art_design:"Art", pe:"PE",
};

async function parentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials:"include",
    headers:{ "Content-Type":"application/json", ...(init?.headers ?? {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? "Request failed");
  return body as T;
}

export function ParentPortal() {
  const [session, setSession] = useState<{authenticated:boolean;configured:boolean}|null>(null);
  const [dashboard, setDashboard] = useState<Dashboard|null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try { setDashboard(await parentRequest<Dashboard>("/api/parent/dashboard")); }
    catch (err) { setError(err instanceof Error ? err.message : "Dashboard could not load."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void parentRequest<{authenticated:boolean;configured:boolean}>("/api/parent/session")
      .then((value) => {
        setSession(value);
        if (value.authenticated) void loadDashboard();
        else setLoading(false);
      })
      .catch((err) => {
        setSession({authenticated:false,configured:true});
        setError(err instanceof Error ? err.message : "Smarticus must be unlocked first.");
        setLoading(false);
      });
  }, []);

  if (!session?.authenticated) {
    return <ParentLogin configured={session?.configured ?? true} error={error} onSuccess={() => {
      setSession({authenticated:true,configured:true});
      void loadDashboard();
    }} />;
  }

  return (
    <div className="parent-shell">
      <header className="parent-topbar no-print">
        <div className="parent-brand">
          <div className="parent-brand-mark">S</div>
          <div><strong>Smarticus Parent Records</strong><span>Atticus · Grade 6 · {dashboard?.school_year ?? "2026–27"}</span></div>
        </div>
        <div className="parent-actions">
          <a className="parent-button" href="/">Student view</a>
          <button className="parent-button" onClick={() => window.print()}>Print</button>
          <button className="parent-button danger" onClick={() => void parentRequest("/api/parent/logout",{method:"POST"}).then(() => window.location.reload())}>Lock</button>
        </div>
      </header>
      <div className="parent-layout">
        <nav className="parent-nav no-print" aria-label="Parent records">
          {(["overview","submissions","grades","curriculum","transcript","portfolio"] as Tab[]).map((item) => (
            <button className={tab===item ? "active" : ""} key={item} onClick={() => setTab(item)}>
              {item === "submissions" ? "Submitted work" : item === "overview" ? "Overview" : item === "grades" ? "Daily grades" : item === "curriculum" ? "Curriculum" : item === "transcript" ? "Transcript" : "Portfolio"}
            </button>
          ))}
        </nav>
        <main className="parent-main">
          {loading && <div className="parent-card">Loading parent records…</div>}
          {error && <div className="parent-card parent-error">{error}</div>}
          {!loading && dashboard && tab === "overview" && <Overview dashboard={dashboard} setTab={setTab} />}
          {!loading && dashboard && tab === "submissions" && <SubmittedWork dashboard={dashboard} onRefresh={loadDashboard}/>}
          {!loading && dashboard && tab === "grades" && <Grades dashboard={dashboard} onRefresh={loadDashboard} />}
          {!loading && dashboard && tab === "curriculum" && <Curriculum dashboard={dashboard} />}
          {!loading && dashboard && tab === "transcript" && <Transcript dashboard={dashboard} />}
          {!loading && dashboard && tab === "portfolio" && <Portfolio dashboard={dashboard} />}
        </main>
      </div>
    </div>
  );
}

function ParentLogin({ configured, error, onSuccess }:{configured:boolean;error:string;onSuccess:()=>void}) {
  const [code,setCode]=useState("");
  const [message,setMessage]=useState(error);
  const [busy,setBusy]=useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    void parentRequest<{authenticated:boolean}>("/api/parent/login",{method:"POST",body:JSON.stringify({code})})
      .then(onSuccess)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Could not unlock parent records."))
      .finally(() => setBusy(false));
  };
  return <div className="parent-login">
    <form className="parent-login-card" onSubmit={submit}>
      <div className="parent-brand-mark">S</div>
      <h1>Parent records</h1>
      <p>Grades, curriculum progress, transcript printing, and portfolio records are separated from Atticus’s student workspace.</p>
      {!configured && <p className="parent-error">Parent access has not been configured on the server.</p>}
      <label><span className="parent-eyebrow">Parent access code</span><input value={code} onChange={(e)=>setCode(e.target.value)} inputMode="numeric" type="password" autoFocus /></label>
      {message && <p className="parent-error">{message}</p>}
      <button className="parent-button primary" disabled={busy || !configured}>{busy ? "Checking…" : "Open parent dashboard"}</button>
      <p><a href="/">Return to student view</a></p>
    </form>
  </div>;
}

function Overview({dashboard,setTab}:{dashboard:Dashboard;setTab:(tab:Tab)=>void}) {
  return <>
    <span className="parent-eyebrow">Parent dashboard</span>
    <h1>{dashboard.student.preferred_name}’s academic picture</h1>
    <p className="parent-subtitle">A living Grade {dashboard.student.grade_level} record: what has been graded, where each course is now, and what comes next.</p>
    {dashboard.summary.today === "2026-10-06" && <section className="parent-card"><span className="parent-eyebrow">Tuesday · 9:30–3:30 · All online</span><h2>Today’s work comes straight here.</h2><p>Seven lessons include teaching before practice. Atticus types his answers and clicks Hand in my answers in each class. Local drafts stay on his device until handed in.</p><p>AI Builder continues the saved HOVER ONE car. Its progress update does not mark the whole project finished. French speaking results stay pending until a parent listens.</p><button className="parent-button" onClick={()=>setTab("submissions")}>Review submitted answers →</button></section>}
    <div className="parent-kpis">
      <Kpi label="Running average" value={dashboard.summary.overall_average === null ? "—" : `${dashboard.summary.overall_average}% · ${dashboard.summary.overall_letter}`} />
      <Kpi label="Formally graded days" value={String(dashboard.summary.graded_days)} />
      <Kpi label="Instructional days" value={String(dashboard.attendance.instructional_days)} />
      <Kpi label="AR semester progress" value={dashboard.ar ? `${dashboard.ar.earned}/${dashboard.ar.semester_goal} pts` : "—"} />
    </div>
    <div className="parent-grid">
      <section className="parent-card">
        <h2>Curriculum right now</h2>
        {dashboard.subjects.slice(0,7).map((subject) => <SubjectMini key={subject.subject} subject={subject} />)}
        <button className="parent-button" onClick={()=>setTab("curriculum")}>Full curriculum roadmap</button>
      </section>
      <section>
        <div className="parent-card">
          <h2>Recent grades</h2>
          {[...dashboard.days].reverse().filter((day)=>day.subjects.length).slice(0,4).map((day)=>
            <div key={day.date} style={{padding:"10px 0",borderBottom:"1px solid #edf0ea"}}>
              <strong>{formatDate(day.date)}</strong><span style={{float:"right"}}>{day.overall === null ? "Reviewed" : `${day.overall}% · ${day.overall_letter}`}</span>
              <div className="grade-chip-wrap" style={{marginTop:8}}>{day.subjects.slice(0,5).map((g)=><GradeChip key={g.subject} grade={g}/>)}</div>
            </div>
          )}
          <button className="parent-button" style={{marginTop:14}} onClick={()=>setTab("grades")}>All daily grades</button>
        </div>
        <div className="parent-card">
          <h2>Reading</h2>
          <p><strong>{dashboard.ar?.current_book ?? "No current book"}</strong></p>
          <p>{dashboard.ar ? `${dashboard.ar.current_book_points} points pending at completion · semester target ${dashboard.ar.semester_goal}` : "Reading tracker not configured."}</p>
        </div>
      </section>
    </div>
  </>;
}

function Kpi({label,value}:{label:string;value:string}) {
  return <div className="parent-kpi"><small>{label}</small><strong>{value}</strong></div>;
}

function SubjectMini({subject}:{subject:SubjectSummary}) {
  return <div className="subject-row">
    <div><strong>{subject.label}</strong><div className="subject-path">{subject.current?.unit ?? "Course plan"}</div></div>
    <div className="subject-grade">{subject.average === null ? "—" : subject.letter}</div>
    <div>
      <div className="progress-track"><span style={{width:`${subject.progress_percent}%`}} /></div>
      <div className="subject-path">{subject.lessons_covered}/{subject.lessons_total} lessons · Next: {subject.next?.lesson ?? "course plan complete"}</div>
    </div>
  </div>;
}

function Grades({dashboard,onRefresh}:{dashboard:Dashboard;onRefresh:()=>Promise<void>}) {
  return <>
    <span className="parent-eyebrow">Daily academic record</span>
    <h1>Grades by school day</h1>
    <p className="parent-subtitle">Every curriculum day remains visible. Days without a formal numeric review stay marked as ungraded instead of receiving invented scores.</p>
    {[...dashboard.days].reverse().map((day)=><GradeDayCard key={day.date} day={day} onRefresh={onRefresh}/>)}
  </>;
}

function GradeDayCard({day,onRefresh}:{day:GradeDay;onRefresh:()=>Promise<void>}) {
  const [editing,setEditing]=useState(false);
  const defaultSubjects = ["mathematics","literature","writing","science","history_geography","french","computer_science"];
  const [grades,setGrades]=useState<SubjectGrade[]>(() => defaultSubjects.map((subject) => day.subjects.find((g)=>g.subject===subject) ?? ({subject,score:null,status:"missing"} as SubjectGrade)));
  const [note,setNote]=useState(day.note ?? "");
  const save = async () => {
    await parentRequest(`/api/parent/grades/${day.date}`,{
      method:"PUT",
      body:JSON.stringify({ day_number:day.day_number, note:note || undefined, subjects:grades }),
    });
    setEditing(false);
    await onRefresh();
  };
  return <details className="grade-day">
    <summary>
      <div><strong>{formatDate(day.date)}</strong> {day.day_number ? <span>· Day {day.day_number}</span> : null}<div className="subject-path">{day.lesson_count} planned lessons</div></div>
      <strong>{day.overall === null ? (day.subjects.length ? "Reviewed" : "Not formally graded") : `${day.overall}% · ${day.overall_letter}`}</strong>
    </summary>
    <div className="grade-day-body">
      <div className="grade-chip-wrap">{day.subjects.map((grade)=><GradeChip key={grade.subject} grade={grade}/>)}</div>
      {day.note && <p>{day.note}</p>}
      <div className="parent-review-notes">
        {day.subjects.filter((grade) => grade.note).map((grade) => <section key={grade.subject}>
          <h3>{subjectNames[grade.subject] ?? grade.subject}</h3>
          <p>{grade.note}</p>
        </section>)}
      </div>
      <div className="print-hide" style={{marginTop:14}}>
        <button className="parent-button" onClick={()=>setEditing((value)=>!value)}>{editing ? "Cancel editing" : "Edit grades"}</button>
      </div>
      {editing && <div className="print-hide">
        {grades.map((grade,index)=><div className="grade-edit-grid" key={grade.subject}>
          <strong>{subjectNames[grade.subject] ?? grade.subject}</strong>
          <input type="number" min="0" max="100" placeholder="Score" value={grade.score ?? ""} onChange={(e)=>{
            const next=[...grades]; next[index]={...grade,score:e.target.value===""?null:Number(e.target.value),display:undefined}; setGrades(next);
          }}/>
          <select value={grade.status} onChange={(e)=>{const next=[...grades];next[index]={...grade,status:e.target.value as SubjectGrade["status"]};setGrades(next);}}>
            <option value="reviewed">Reviewed</option><option value="provisional">Provisional</option><option value="not_assessed">Not assessed</option><option value="missing">Missing</option>
          </select>
          <textarea rows={1} placeholder="Note" value={grade.note ?? ""} onChange={(e)=>{const next=[...grades];next[index]={...grade,note:e.target.value};setGrades(next);}}/>
        </div>)}
        <textarea rows={2} placeholder="Day note" value={note} onChange={(e)=>setNote(e.target.value)} />
        <button className="parent-button primary" onClick={()=>void save()}>Save daily record</button>
      </div>}
    </div>
  </details>;
}

function GradeChip({grade}:{grade:SubjectGrade}) {
  const shown = grade.score !== null ? `${grade.score}%` : grade.display ?? (grade.status === "not_assessed" ? "N/A" : "—");
  return <span className={`grade-chip ${grade.status}`}>{subjectNames[grade.subject] ?? grade.subject}<strong>{shown}</strong>{grade.status === "provisional" ? " · provisional" : grade.status === "not_assessed" ? " · not assessed" : grade.status === "missing" ? " · incomplete" : ""}</span>;
}

function Curriculum({dashboard}:{dashboard:Dashboard}) {
  const live = new Map(dashboard.subjects.map((item)=>[item.subject,item]));
  return <>
    <details className="parent-visual-review">
      <summary>Monday AI Builder: HOVER ONE — setup and downloads</summary>
      <p>1:35–2:35. Atticus builds a seven-part hover-car in Blender and exports a poster. The camera, lights and stage are supplied; he creates the car.</p>
      <p>Before class, install Blender 5.2 Windows ARM for his Snapdragon laptop. Follow the PDF’s Cycles CPU settings, render the empty stage, then save and reopen a temporary test file. The scene was tested in Blender remotely; his laptop still needs this check. No GitHub or new child account is needed.</p>
      <p><a href="/lesson-visuals/2026-10-05/Hover-Studio.blend" download>Starting studio</a> · <a href="/lesson-visuals/2026-10-05/Atticus_AI_Builder_2026-10-05.pdf" download>Illustrated lesson and parent setup PDF</a></p>
      <p>Save .blend and .png files in Documents → Atticus-AI-Builder. Next session animates this same car. Setup failures are not a student grade; Monday remains ungraded until work is reviewed.</p>
    </details>
    <details className="parent-visual-review">
      <summary>Monday, October 5: updated teaching pictures</summary>
      <p>These are taught examples. The pictures show the actual lesson ideas before Atticus attempts his questions.</p>
      <div className="parent-visual-grid">{[{file:"mathematics",title:"Count the height gaps"},{file:"math_half",title:"Two triangles make a rectangle"},{file:"writing",title:"Compare the same lamp"},{file:"french",title:"Follow the conversation"},{file:"history_geography",title:"Meet Rome’s decision-makers"}].map(item=><a key={item.file} href={`/lesson-visuals/2026-10-05/${item.file}-v2.jpg`} target="_blank" rel="noreferrer"><img src={`/lesson-visuals/2026-10-05/${item.file}-v2.jpg`} alt={item.title} loading="lazy"/><strong>{item.title} ↗</strong></a>)}</div>
    </details>
    <div className="curriculum-title-row">
      <div>
        <span className="parent-eyebrow">Full Grade 6 curriculum</span>
        <h1>{dashboard.official_curriculum.title}</h1>
        <p className="parent-subtitle">{dashboard.official_curriculum.description}</p>
      </div>
      <button className="parent-button primary no-print" onClick={()=>window.print()}>
        Print curriculum roadmap
      </button>
    </div>

    <section className="curriculum-truth-card">
      <strong>What “official” means here</strong>
      <p>{dashboard.official_curriculum.disclaimer}</p>
      <a href={dashboard.official_curriculum.texas_context.url} target="_blank" rel="noreferrer">
        {dashboard.official_curriculum.texas_context.label} ↗
      </a>
      <p className="curriculum-source-note">{dashboard.official_curriculum.texas_context.note}</p>
    </section>

    <div className="curriculum-source-legend">
      <span><i className="legend-dot live" /> Current Smarticus position</span>
      <span><i className="legend-dot source" /> Published standards/framework source</span>
      <span><i className="legend-dot roadmap" /> Smarticus year sequence</span>
    </div>

    {dashboard.official_curriculum.subjects.map((course)=>{
      const subject = live.get(course.subject);
      return <section className="parent-card curriculum-course" key={course.subject}>
        <div className="curriculum-course-head">
          <div>
            <span className="parent-eyebrow">{course.sources[0]?.role ?? "Course framework"}</span>
            <h2>{course.label}</h2>
            <p>{course.basis}</p>
          </div>
          {subject && <div className="curriculum-grade-box">
            <small>Running grade</small>
            <strong>{subject.average === null ? "—" : `${subject.average}%`}</strong>
            <span>{subject.letter}</span>
          </div>}
        </div>

        {subject && <div className="curriculum-live-position">
          <div>
            <span className="parent-eyebrow">Where he is now</span>
            <strong>{subject.current?.lesson ?? "Not started"}</strong>
            <p>{subject.current?.unit ?? "No current unit loaded"}</p>
          </div>
          <div>
            <span className="parent-eyebrow">Coming next in Smarticus</span>
            <strong>{subject.next?.lesson ?? "No later daily lesson loaded yet"}</strong>
            <p>{subject.next?.unit ?? ""}</p>
          </div>
          <div>
            <span className="parent-eyebrow">Loaded daily progress</span>
            <strong>{subject.lessons_covered}/{subject.lessons_total}</strong>
            <div className="progress-track"><span style={{width:`${subject.progress_percent}%`}} /></div>
          </div>
        </div>}

        <div className="curriculum-sequence">
          {course.sequence.map((unit)=>(
            <div className="curriculum-unit" key={unit.unit}>
              <div className="curriculum-unit-number">{String(unit.unit).padStart(2,"0")}</div>
              <div>
                <h3>{unit.title}</h3>
                <div className="curriculum-topic-list">
                  {unit.topics.map((topic)=><span key={topic}>{topic}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="curriculum-sources">
          <div className="curriculum-sources-head">
            <strong>Standards & curriculum sources</strong>
            <a className="internal-syllabus-link" href={course.internal_source} target="_blank" rel="noreferrer">
              View Smarticus syllabus ↗
            </a>
          </div>
          {course.sources.map((source)=>(
            <a className="curriculum-source-link" key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <span className="source-badge">SOURCE</span>
              <span>
                <strong>{source.label}</strong>
                <small>{source.organization} · {source.role}</small>
              </span>
              <span className="source-arrow">↗</span>
            </a>
          ))}
        </div>
      </section>;
    })}
  </>;
}

function Transcript({dashboard}:{dashboard:Dashboard}) {
  const desc = new Map(dashboard.course_descriptions.map((item)=>[item.subject,item.description]));
  return <div className="transcript-only">
    <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
      <button className="parent-button primary" onClick={()=>window.print()}>Print / Save as PDF</button>
    </div>
    <section className="parent-card">
      <div className="transcript-header">
        <span className="parent-eyebrow">Parent-issued homeschool academic record</span>
        <h1>Atticus Homeschool · Grade {dashboard.student.grade_level}</h1>
        <p>School Year {dashboard.school_year}</p>
      </div>
      <div className="transcript-meta">
        <div><small>Student</small><strong>{dashboard.student.preferred_name}</strong></div>
        <div><small>Grade</small><strong>{dashboard.student.grade_level}</strong></div>
        <div><small>Instructional days to date</small><strong>{dashboard.attendance.instructional_days}</strong></div>
        <div><small>Current running average</small><strong>{dashboard.summary.overall_average ?? "—"}{dashboard.summary.overall_average !== null ? `% · ${dashboard.summary.overall_letter}` : ""}</strong></div>
      </div>
      <table className="parent-table"><thead><tr><th>Course</th><th>Current grade</th><th>Letter</th><th>Graded records</th><th>Status</th></tr></thead>
        <tbody>{dashboard.transcript.map((row)=><tr key={row.subject}><td><strong>{row.course}</strong>{desc.get(row.subject) ? <div>{desc.get(row.subject)}</div> : null}</td><td>{row.grade === null ? "—" : `${row.grade}%`}</td><td>{row.letter}</td><td>{row.graded_records}</td><td>{row.status}</td></tr>)}</tbody>
      </table>
      <h2 style={{marginTop:28}}>Reading & portfolio</h2>
      <p>AR semester goal: {dashboard.ar?.semester_goal ?? "—"} points. Current book: {dashboard.ar?.current_book ?? "—"}.</p>
      <p>{dashboard.grading_note}</p>
      <p><strong>Record status:</strong> In-progress homeschool academic record, not an accredited-school transcript. Receiving schools determine placement and acceptance of homeschool records.</p>
    </section>
  </div>;
}

function Portfolio({dashboard}:{dashboard:Dashboard}) {
  return <>
    <span className="parent-eyebrow">Portfolio</span><h1>Projects and evidence</h1>
    <div className="portfolio-grid">{dashboard.portfolio.map((item,index)=><div className="portfolio-item" key={`${item.title}-${index}`}>
      <span className="status-pill">{item.status.replaceAll("_"," ")}</span><h3>{item.title}</h3><p>{item.description}</p>{item.date && <small>{formatDate(item.date)}</small>}
    </div>)}</div>
  </>;
}

function formatDate(value:string) {
  return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
}

export function SubmittedWork({dashboard,onRefresh}:{dashboard:Pick<Dashboard,"submissions"|"summary">;onRefresh:()=>void}) {
 const [date,setDate]=useState(dashboard.summary.today);
 const submissions=(dashboard.submissions??[]).filter(s=>!date||s.date===date);
 return <section className="parent-card"><span className="parent-eyebrow">Online hand-ins</span><h1>Submitted work</h1><p>Open a hand-in to read the exact questions and answers. Newer versions appear first. These are submissions awaiting review; handing in is not an automatic grade.</p><div className="parent-submission-filter"><label>Lesson date <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="parent-button" onClick={()=>setDate("")}>All recent dates</button><button className="parent-button" onClick={onRefresh}>Refresh hand-ins</button></div><p className="parent-submission-note">Showing up to the 100 most recent hand-ins. Empty answer boxes remain visible and are not automatically scored zero.</p>{!submissions.length&&<p>No hand-ins for this date yet. Drafts appear here after Atticus clicks Hand in my answers.</p>}
 {submissions.map((s,index)=><details className="parent-submission" key={s.id}><summary>{subjectNames[s.subject]??s.subject} · {s.title}<br/><small>{formatDate(s.date)} · Sent {new Date(s.submitted_at).toLocaleString()} · {s.answered}/{s.total} written responses{!submissions.slice(0,index).some(prior=>prior.lesson_id===s.lesson_id)?" · Latest version":" · Earlier version"}</small></summary>{s.subject==="computer_science"&&s.date==="2026-10-06"&&<p>Ongoing project · progress update only.</p>}{s.note&&<p><strong>Student note:</strong> {s.note}</p>}{s.photos>0&&<p>{s.photos} photograph(s) saved with this hand-in.</p>}<ol>{s.answers.map(a=><li key={a.section+":"+a.item_id}><strong>{a.item_id} · {a.prompt}</strong><div className="parent-submitted-answer">{a.answer.trim()?a.answer:"No written answer submitted."}</div></li>)}</ol></details>)}
 </section>;
}
