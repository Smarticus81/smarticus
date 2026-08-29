import type { LessonView, ScheduleView } from "./types";

const API_BASE = "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? "Request failed", res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (password: string) =>
    request<{ authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  todaySchedule: (date?: string) =>
    request<ScheduleView>(`/api/schedule/today${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  currentLesson: (subject?: string) =>
    request<LessonView | null>(`/api/lessons/current${subject ? `/${encodeURIComponent(subject)}` : ""}`),
  studentSnapshot: () => request("/api/student/snapshot"),
  previousFeedback: (subject: string) =>
    request(`/api/feedback/previous/${encodeURIComponent(subject)}`),
  masteryState: (subject: string, standard?: string) =>
    request(
      `/api/mastery/${encodeURIComponent(subject)}${standard ? `?standard=${encodeURIComponent(standard)}` : ""}`,
    ),
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
    searchWeb: (query: string) =>
      request("/api/search/web", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
    workedExamples: (lessonId: string) => request(`/api/tools/worked-examples/${encodeURIComponent(lessonId)}`),
    answerSupport: (lessonId: string, itemId: string) =>
      request(`/api/tools/answer-support/${encodeURIComponent(lessonId)}/${encodeURIComponent(itemId)}`),
    assignment: (assignmentId: string) => request(`/api/tools/assignment/${encodeURIComponent(assignmentId)}`),
  },
};
