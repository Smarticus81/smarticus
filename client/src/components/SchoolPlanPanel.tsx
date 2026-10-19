import type { SchoolContext } from "../../../shared/schoolContext";
import { subjectInfo } from "../lib/subjects";
import { Icon } from "./Icon";
import "../styles/school-plan.css";

function SourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  return <a href={url} target="_blank" rel="noreferrer">{children} ↗</a>;
}

export function SchoolPlanPanel({
  context,
}: {
  context: SchoolContext;
}) {
  return (
    <section className="school-plan" aria-label="School plan">
      <header className="school-plan-heading">
        <div>
          <span className="eyebrow">PRIVATE PARENT REFERENCE</span>
          <h2>School plan</h2>
          <p className="school-plan-source">{context.sourceName} · {context.schoolYear}</p>
        </div>
        <span className="school-plan-badge">{context.active ? "Private reference" : "Inactive reference"}</span>
      </header>
      <div className="school-plan-meta">
        <p><strong>Snapshot as of</strong> <time dateTime={context.asOf}>{context.asOf}</time></p>
        <p><strong>School time zone</strong> {context.timeZone ?? "Not confirmed"}</p>
      </div>
      {context.timezoneNote && <p className="school-plan-timezone">{context.timezoneNote}</p>}
      {context.summary && <p className="school-plan-summary">{context.summary}</p>}
      <p className="school-plan-boundary">This is a manually maintained reference. No automatic school sync. The school’s official records govern assignments, deadlines, grades, and completion.</p>
      <div className="school-course-grid">
        {context.courses.map((course) => {
          const subject = subjectInfo(course.subject);
          return <article className="school-course" key={course.id}>
            <div className="school-course-heading">
              <span className={`subject-icon ${subject.color}`}><Icon name={subject.icon} size={18} /></span>
              <h3>{course.label}</h3>
            </div>
            {course.focus && <p>{course.focus}</p>}
            {course.units.length > 0 && <ul className="school-unit-list" aria-label={`${course.label} units`}>{course.units.map((unit, index) => <li key={index}>{unit}</li>)}</ul>}
            {course.instructions.length > 0 && <details><summary>Tutoring guidance</summary><ul>{course.instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ul></details>}
            <div className="school-course-actions">
              {course.sourceUrl && <SourceLink url={course.sourceUrl}>Course source</SourceLink>}
            </div>
          </article>;
        })}
      </div>
      {(context.schedule.length > 0 || context.workload.length > 0 || context.cautions.length > 0 || context.sources.length > 0) && <details className="school-plan-details">
        <summary>Schedule, workload & sources <span>{context.schedule.length} schedule notes</span></summary>
        <div className="school-plan-detail-grid">
          {context.schedule.length > 0 && <section><h3>Schedule reference</h3><p className="school-plan-fineprint">Times are shown exactly as recorded, without local-time conversion. Check each item’s verification status.</p><ul className="school-reference-list">{context.schedule.map((item, index) => <li key={index}>
            <div><strong>{item.label}</strong><span className={`school-verification ${item.verification}`}>{item.verification}</span></div>
            <p>{item.when || "Time not recorded"}</p>
            <small>Time zone: {item.timeZone ?? "Not confirmed"}</small>
            {item.notes && <p>{item.notes}</p>}
            {item.sourceUrl && <SourceLink url={item.sourceUrl}>Schedule source</SourceLink>}
          </li>)}</ul></section>}
          {context.workload.length > 0 && <section><h3>Workload reference</h3><ul className="school-reference-list">{context.workload.map((item, index) => <li key={index}>
            <div><strong>{item.label}</strong><span className={`school-verification ${item.verification}`}>{item.verification}</span></div>
            <p>{item.detail}</p>
          </li>)}</ul></section>}
        </div>
        {context.cautions.length > 0 && <section className="school-plan-cautions"><h3>Keep in mind</h3><ul>{context.cautions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
        {context.sources.length > 0 && <section className="school-plan-sources"><h3>Checked sources</h3><ul>{context.sources.map((item, index) => <li key={index}><SourceLink url={item.url}>{item.label}</SourceLink><small>Checked <time dateTime={item.checkedAt}>{item.checkedAt}</time></small></li>)}</ul></section>}
      </details>}
    </section>
  );
}
