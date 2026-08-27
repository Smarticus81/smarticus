import type { ScheduleView } from "./types";

const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export const api = {
  todaySchedule: (date?: string) => request<ScheduleView>(`/api/schedule/today${date ? `?date=${date}` : ""}`),
  clientSecret: (lesson_id: string) =>
    request<{ value: string; lessonId: string; sessionModel: string; instructions: string }>("/api/realtime/client-secret", {
      method: "POST",
      body: JSON.stringify({ lesson_id }),
    }),
  endSession: (payload: { session_id: string; summary?: string; transcript?: unknown[] }) =>
    request("/api/realtime/session/end", { method: "POST", body: JSON.stringify(payload) }),
  tool: {
    lessonStarted: (lesson_id: string) =>
      request<{ sessionId: string }>("/api/tools/lesson-started", { method: "POST", body: JSON.stringify({ lesson_id }) }),
    lessonCompleted: (lesson_id: string) =>
      request("/api/tools/lesson-completed", { method: "POST", body: JSON.stringify({ lesson_id }) }),
    verbalCheck: (body: unknown) => request("/api/tools/verbal-check", { method: "POST", body: JSON.stringify(body) }),
    misconception: (body: unknown) => request("/api/tools/misconception", { method: "POST", body: JSON.stringify(body) }),
    mastery: (body: unknown) => request("/api/tools/mastery", { method: "POST", body: JSON.stringify(body) }),
    tutorNote: (body: unknown) => request("/api/tools/tutor-note", { method: "POST", body: JSON.stringify(body) }),
    searchCurriculum: (body: unknown) => request("/api/search/curriculum", { method: "POST", body: JSON.stringify(body) }),
    workedExamples: (lessonId: string) => request(`/api/tools/worked-examples/${lessonId}`),
    answerSupport: (lessonId: string, itemId: string) => request(`/api/tools/answer-support/${lessonId}/${itemId}`),
    assignment: (assignmentId: string) => request(`/api/tools/assignment/${assignmentId}`),
  },
};
