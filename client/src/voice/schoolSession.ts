import type { SchoolContext, SchoolAssignment } from "../../../shared/schoolContext";
import { api, type LiveSessionResponse } from "../lib/api";

/** Private context lives only in the mounted workspace's memory. */
export interface SchoolTutorSession {
  assignmentId: string;
  revision: number;
  context: SchoolContext;
}

export const SCHOOL_CONNECTION_ERROR = "The school tutor could not connect. Reopen School and try again.";

export function selectedSchoolAssignment(session: SchoolTutorSession): SchoolAssignment {
  const selected = session.context.assignments.find(item => item.id === session.assignmentId);
  if (!session.context.active || !selected || selected.status === "complete" || selected.status === "skipped") {
    throw new Error("Choose an available school assignment before connecting.");
  }
  return selected;
}

export function assertSchoolSessionContext(session: SchoolTutorSession, response: LiveSessionResponse): void {
  if (
    response.lessonId !== `school:${session.assignmentId}` ||
    response.lessonMarker !== `[SELECTED_SCHOOL_ASSIGNMENT:${session.assignmentId}]`
  ) throw new Error(SCHOOL_CONNECTION_ERROR);
}

/** This route sends only the selection/revision, never a browser-supplied plan. */
export async function negotiateSchoolSession(session: SchoolTutorSession, sdp: string): Promise<LiveSessionResponse> {
  selectedSchoolAssignment(session);
  const created = await api.schoolLiveSession(session.assignmentId, session.revision, sdp);
  assertSchoolSessionContext(session, created);
  return created;
}
