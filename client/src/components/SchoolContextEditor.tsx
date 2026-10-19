import { useEffect, useRef, useState } from "react";
import { SchoolContextSchema, type SchoolContext } from "../../../shared/schoolContext";
import { api, ApiError } from "../lib/api";
import type { SchoolPlanState } from "../lib/types";
import { SchoolPlanPanel } from "./SchoolPlanPanel";

const serialize = (context: SchoolContext | null) => context ? JSON.stringify(context, null, 2) : "";

function starterContext(): SchoolContext {
  return {
    schemaVersion: 1,
    active: false,
    sourceName: "School reference",
    schoolYear: "2026-27",
    asOf: "",
    timeZone: null,
    timezoneNote: "Confirm the school time zone before relying on any times.",
    summary: "",
    courses: [{ id: "course-1", label: "Course 1", subject: "mathematics", focus: "", units: [], instructions: [] }],
    schedule: [],
    workload: [],
    cautions: [],
    sources: [],
  };
}

export function SchoolContextEditor() {
  const [saved, setSaved] = useState<SchoolPlanState | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [success, setSuccess] = useState("");
  const [review, setReview] = useState<SchoolContext | null>(null);
  const [conflict, setConflict] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const mounted = useRef(true);
  const saving = useRef(false);
  const requestVersion = useRef(0);
  const fileVersion = useRef(0);
  const dirty = draft !== serialize(saved?.context ?? null);

  const load = async () => {
    if (saving.current) return;
    const version = ++requestVersion.current;
    ++fileVersion.current;
    setLoading(true);
    setReview(null);
    setError("");
    try {
      const result = await api.parentSchoolContext();
      if (!mounted.current || version !== requestVersion.current) return;
      setSaved(result);
      setDraft(serialize(result.context));
      setReview(null);
      setConflict(false);
      setReplacing(false);
      setIssues([]);
      setSuccess("");
    } catch (caught) {
      if (!mounted.current || version !== requestVersion.current) return;
      setError(caught instanceof ApiError && caught.status === 401
        ? "Parent access is locked. Unlock parent records again to view or save the school reference."
        : "The school reference could not load. Your draft has not been changed.");
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; ++requestVersion.current; ++fileVersion.current; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (value: string) => {
    ++fileVersion.current;
    setDraft(value);
    setReview(null);
    setIssues([]);
    setSuccess("");
    if (!conflict) setError("");
    setReplacing(false);
  };
  const validate = () => {
    if (loading || saving.current || !saved || conflict) return;
    ++fileVersion.current;
    setReplacing(false);
    setError("");
    setSuccess("");
    setIssues([]);
    setReview(null);
    let value: unknown;
    try { value = JSON.parse(draft); }
    catch { setError("This is not valid JSON. Check commas, quotes, and brackets, then try again."); return; }
    const result = SchoolContextSchema.safeParse(value);
    if (!result.success) {
      setError("The school reference needs a few corrections before it can be saved.");
      setIssues(result.error.issues.map((issue) => `${issue.path.join(".") || "context"}: ${issue.message}`));
      return;
    }
    setReview(result.data);
  };
  const save = async () => {
    if (!review || !saved || saving.current || conflict || loading || replacing) return;
    ++fileVersion.current;
    saving.current = true;
    setReplacing(false);
    setBusy(true);
    setError("");
    try {
      const result = await api.saveSchoolContext(saved.revision, review);
      if (!mounted.current) return;
      setSaved(result);
      setDraft(serialize(result.context));
      setReview(null);
      setSuccess(`School reference saved as revision ${result.revision}. ${result.context?.active ? "This snapshot is available in parent records only." : "The reference is marked inactive in parent records."}`);
    } catch (caught) {
      if (!mounted.current) return;
      setReview(null);
      if (caught instanceof ApiError && caught.status === 409) {
        setConflict(true);
        setError("A newer revision was saved elsewhere. Your draft is still here and nothing was overwritten. Copy any edits you want to keep, then load the latest saved version before reviewing and saving again.");
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError("Parent access is locked. Your draft is still here. Unlock parent records before trying again.");
      } else {
        setError("The save could not be confirmed. Your draft is still here. Load the latest saved version to check whether the update reached the server before saving again.");
        setConflict(true);
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section aria-label="Manage school reference">
    <span className="parent-eyebrow">Private parent reference</span>
    <h1>School plan</h1>
    <p className="parent-subtitle">Keep a checked school snapshot in your private parent records. Importing or editing a file does not save it until you review and confirm.</p>
    <p className="school-practice-notice">No automatic sync. School assignments, submissions, grades, and completion stay in the official school system. This reference is available only in the existing parent-protected records. It is not sent to the student workspace or voice tutor.</p>
    {loading && <p role="status">Loading school reference…</p>}
    {saved && <p className="school-editor-help">Saved revision {saved.revision}{saved.updatedAt && <> · Saved at <time dateTime={saved.updatedAt}>{saved.updatedAt}</time></>} · {saved.context?.active ? "Active" : "Inactive"}</p>}
    {saved?.context && <details className="parent-card"><summary>View saved school reference</summary><SchoolPlanPanel context={saved.context} /></details>}
    <div className="parent-card school-editor" aria-busy={busy || loading}>
      <h2>{saved?.context ? "Update school reference" : "Import a school reference"}</h2>
      <p className="school-editor-help" id="school-json-help">Paste a version 1 SchoolContext object, or choose a JSON file. Use the actual source-check time for asOf and checkedAt. Set unknown time zones to null; distinguish verified, reported, and unconfirmed schedule or workload notes. Do not include passwords, access tokens, or unnecessary student details.</p>
      <fieldset disabled={busy || loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label htmlFor="school-json-file">Import JSON from this device</label>
        <input id="school-json-file" type="file" accept="application/json,.json" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setReview(null);
          const version = ++fileVersion.current;
          if (file.size > 100_000) { setError("Choose a JSON file smaller than 100 KB."); return; }
          try {
            const value = await file.text();
            if (mounted.current && version === fileVersion.current) edit(value);
          } catch { if (mounted.current && version === fileVersion.current) setError("That file could not be read. Try pasting its JSON instead."); }
        }} />
        <label htmlFor="school-json">School context JSON</label>
        <textarea id="school-json" aria-describedby="school-json-help" spellCheck={false} maxLength={100_000} value={draft} onChange={(event) => edit(event.target.value)} />
        <div className="school-editor-actions">
          <button className="parent-button primary" disabled={!saved || !dirty || conflict || !draft.trim()} onClick={validate}>Validate & review</button>
          {!draft && <button className="parent-button" onClick={() => edit(serialize(starterContext()))}>Use starter template</button>}
          <button className="parent-button" onClick={() => { setReview(null); if (dirty) setReplacing(true); else void load(); }}>{conflict ? "Load latest saved version" : "Reload saved version"}</button>
        </div>
      </fieldset>
      {dirty && <p className="school-editor-help">Unsaved changes. Choosing another parent tab keeps this draft in this browser tab.</p>}
      {error && <div className="school-editor-error" role="alert"><p>{error}</p>{issues.length > 0 && <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}</div>}
      {success && <p className="school-editor-success" role="status">{success}</p>}
      {replacing && <div className="school-save-review" role="group" aria-label="Replace unsaved draft">
        <h3>Replace the unsaved draft?</h3>
        <p>Loading the saved version will replace the JSON in this editor. Copy any changes you want to keep first.</p>
        <div className="school-editor-actions"><button className="parent-button primary" disabled={loading || busy} onClick={() => void load()}>Replace draft with saved version</button><button className="parent-button" disabled={loading || busy} onClick={() => setReplacing(false)}>Keep editing</button></div>
      </div>}
      {review && <div className="school-save-review" role="group" aria-label="Confirm school reference save">
        <h3>Review before saving</h3>
        <p><strong>{review.sourceName}</strong> · {review.schoolYear} · {review.courses.length} course{review.courses.length === 1 ? "" : "s"} · {review.active ? "Active" : "Inactive"}</p>
        <p>Snapshot as of {review.asOf}. Time zone: {review.timeZone ?? "Not confirmed"}.</p>
        <p>This will replace revision {saved?.revision} of the private parent reference. {review.active ? "The snapshot will be marked active in parent records only." : "The snapshot will be marked inactive in parent records."} It does not update the school’s records.</p>
        <details><summary>Preview this revision</summary><SchoolPlanPanel context={review} /></details>
        <div className="school-editor-actions"><button className="parent-button primary" disabled={busy || loading || replacing} onClick={() => void save()}>{busy ? "Saving…" : "Confirm save"}</button><button className="parent-button" disabled={busy} onClick={() => setReview(null)}>Keep editing</button></div>
      </div>}
    </div>
  </section>;
}
