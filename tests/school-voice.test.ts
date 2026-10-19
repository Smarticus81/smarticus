import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, it } from "node:test";
import { SchoolContextSchema } from "../shared/schoolContext.js";
import { schoolVoiceToolNames } from "../shared/voice/schoolTools.js";
import { createSchoolToolExecutors } from "../client/src/voice/schoolTools.js";
import { assertSchoolSessionContext, negotiateSchoolSession, selectedSchoolAssignment, type SchoolTutorSession } from "../client/src/voice/schoolSession.js";
import { ScreenShare } from "../client/src/voice/screenShare.js";
import { whiteboard } from "../client/src/voice/whiteboardStore.js";
import type { LiveFunctionCall } from "../client/src/voice/liveEvents.js";
import type { LiveSessionResponse } from "../client/src/lib/api.js";
import { LiveVoiceSession } from "../client/src/voice/liveSession.js";
import { camera } from "../client/src/voice/camera.js";

// Synthetic fixtures only. No real learner records or school-portal content.
const context = SchoolContextSchema.parse({
  schemaVersion: 1, active: true, sourceName: "Example School", schoolYear: "2026-27",
  asOf: "2026-10-01T12:00:00Z", timeZone: null, timezoneNote: "Time zone is not confirmed.",
  summary: "Synthetic private school plan",
  courses: [{ id: "math", label: "Example Mathematics", subject: "mathematics", focus: "Fractions", units: ["Fractions"], instructions: ["Read the example."] }],
  assignments: [
    { id: "fractions-practice", courseId: "math", title: "Fraction practice", unit: "Fractions", kind: "practice", status: "current", instructions: ["Explain one half using a drawing."], tutoringFocus: "Equivalent fractions", sequence: 1, timingNote: "After the example" },
    { id: "other-work", courseId: "math", title: "Unselected assignment", unit: "Decimals", kind: "lesson", status: "next", instructions: ["UNSELECTED_ASSIGNMENT_ONLY"], tutoringFocus: "Decimals", sequence: 2, timingNote: "" },
  ],
  schedule: [{ label: "Example meeting", when: "Wednesday, time unconfirmed", timeZone: null, verification: "unconfirmed", notes: "Confirm with the school." }],
  workload: [], cautions: ["No due date was confirmed."], sources: [],
});
const school: SchoolTutorSession = { assignmentId: "fractions-practice", revision: 7, context };
const response: LiveSessionResponse = {
  sdp: "synthetic-answer", sessionId: "private-session", lessonId: "school:fractions-practice",
  lessonMarker: "[SELECTED_SCHOOL_ASSIGNMENT:fractions-practice]", voiceModel: "example-live", backendModel: "example-reasoning", voice: "example",
};
const call = (name: string): LiveFunctionCall => ({ name, callId: `test-${name}`, arguments: "{}", delegationId: "synthetic" });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; whiteboard.clear(); whiteboard.setOpen(false); });

it("accepts only the exact selected-school marker and ID", () => {
  assert.doesNotThrow(() => assertSchoolSessionContext(school, response));
  for (const changed of [
    { lessonId: "fractions-practice" },
    { lessonId: "school:other-work" },
    { lessonMarker: "[SELECTED_LESSON:fractions-practice]" },
    { lessonMarker: "[SELECTED_SCHOOL_ASSIGNMENT:other-work]" },
    { lessonMarker: `${response.lessonMarker} extra text` },
  ]) assert.throws(() => assertSchoolSessionContext(school, { ...response, ...changed }));
});

it("rejects inactive, missing, complete and skipped assignments before connecting", () => {
  assert.throws(() => selectedSchoolAssignment({ ...school, assignmentId: "missing" }));
  assert.throws(() => selectedSchoolAssignment({ ...school, context: { ...context, active: false } }));
  for (const status of ["complete", "skipped"] as const) {
    assert.throws(() => selectedSchoolAssignment({ ...school, context: { ...context, assignments: [{ ...context.assignments[0], status }] } }));
  }
});

it("negotiates only the authenticated private endpoint with ID, revision and SDP", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(response), { status: 200 });
  };
  assert.deepEqual(await negotiateSchoolSession(school, "synthetic-offer"), response);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/parent/school-tutor/live");
  assert.equal(requests[0].init?.credentials, "include");
  assert.equal(requests[0].init?.cache, "no-store");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { assignmentId: school.assignmentId, expectedRevision: 7, sdp: "synthetic-offer" });
});

it("does not request a public/fallback route when the private provider is unavailable", async () => {
  const paths: string[] = [];
  globalThis.fetch = async url => {
    paths.push(String(url));
    return new Response(JSON.stringify({ error: "Provider unavailable", fallbacks: ["gemini", "grok"] }), { status: 402 });
  };
  await assert.rejects(negotiateSchoolSession(school, "synthetic-offer"));
  assert.deepEqual(paths, ["/api/parent/school-tutor/live"]);
});

it("provides the closed safe catalog and selected context without public lookups", async () => {
  globalThis.fetch = async () => { assert.fail("Private context tools must not fetch public records"); };
  const tools = createSchoolToolExecutors({ ...school, screenShare: new ScreenShare() });
  assert.deepEqual(Object.keys(tools).sort(), [...schoolVoiceToolNames].sort());
  for (const blocked of ["__proto__", "constructor", "browse_web", "search_curriculum", "search_web", "get_student_snapshot", "get_mastery_state", "record_verbal_check", "record_misconception", "record_mastery", "save_tutor_note", "mark_lesson_completed", "submit_lesson_work", "get_lesson_questions"]) {
    assert.equal(tools[blocked], undefined, `${blocked} must be unreachable`);
  }
  for (const name of ["get_current_lesson", "get_assignment_instructions", "get_worked_examples", "get_allowed_answer_support", "navigate_lesson", "look_at_screen"]) {
    const result = JSON.stringify(await tools[name]({ lesson_id: "old-public-lesson", assignment_id: "other-work", subject: "science" }, call(name)));
    assert.match(result, /fractions-practice/);
    assert.match(result, /Explain one half using a drawing/);
    assert.equal(result.includes("UNSELECTED_ASSIGNMENT_ONLY"), false);
  }
  const schedule = JSON.stringify(await tools.get_today_schedule({}, call("get_today_schedule")));
  assert.match(schedule, /unconfirmed/);
  assert.match(schedule, /2026-10-01/);
  assert.match(schedule, /Time zone is not confirmed/);
  const boundary = JSON.stringify(await tools.get_allowed_answer_support({}, call("get_allowed_answer_support")));
  assert.match(boundary, /must stay independent/);
  assert.match(boundary, /no answers, hints, choice elimination or correctness feedback/);
});

it("sends oversized shared images only to the private vision endpoint", async () => {
  const paths: string[] = [];
  globalThis.fetch = async (url, init) => {
    paths.push(String(url));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      assignmentId: "fractions-practice", expectedRevision: 7,
      image: "data:image/jpeg;base64,U1lOVEhFVElD", surface: "browser", question: "Read the fraction",
    });
    return new Response(JSON.stringify({ description: "Synthetic fraction drawing" }), { status: 200 });
  };
  const screenShare = { active: true, surface: "browser", captureFrame: async () => "data:image/jpeg;base64,U1lOVEhFVElD" } as ScreenShare;
  const tools = createSchoolToolExecutors({ ...school, screenShare, imageAllowance: () => 0 });
  const result = await tools.look_at_screen({ reason: "Read the fraction" }, call("look_at_screen"));
  assert.deepEqual(paths, ["/api/parent/school-tutor/vision"]);
  assert.match(JSON.stringify(result), /Synthetic fraction drawing/);
});

it("closes access on private vision 401 and hides unsafe error bodies", async () => {
  let accessLost = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "UNSAFE_PROVIDER_DETAIL" }), { status: 401 });
  const screenShare = { active: true, surface: "window", captureFrame: async () => "data:image/jpeg;base64,U1lOVEhFVElD" } as ScreenShare;
  const tools = createSchoolToolExecutors({ ...school, screenShare, imageAllowance: () => 0, onAccessLost: () => { accessLost++; } });
  const result = await tools.look_at_screen({}, call("look_at_screen"));
  assert.equal(accessLost, 1);
  assert.equal(JSON.stringify(result).includes("UNSAFE_PROVIDER_DETAIL"), false);
});

it("drops a screen frame that resolves after Stop sharing or school session exit", async () => {
  const image = "data:image/jpeg;base64,U1lOVEhFVElD";
  globalThis.fetch = async () => { assert.fail("A late screen frame must not reach private vision"); };
  for (const imageBytes of [0, 10_000]) {
    for (const endSession of [false, true]) {
      let sharing = true, active = true, captures = 0;
      const screenShare = {
        get active() { return sharing; }, surface: "window",
        captureFrame: async () => { captures++; if (endSession) active = false; else sharing = false; return image; },
      } as ScreenShare;
      const tools = createSchoolToolExecutors({ ...school, screenShare, isActive: () => active, imageAllowance: () => imageBytes });
      const result = await tools.look_at_screen({}, call("look_at_screen"));
      assert.equal(captures, 1);
      assert.equal(JSON.stringify(result).includes(image), false);
      assert.match(JSON.stringify(result), /Screen sharing is off|session is closed/);
    }
  }
});

it("ignores late tool calls after exit without modifying the board or transmitting", async () => {
  globalThis.fetch = async () => { assert.fail("A closed school session must not send requests"); };
  const tools = createSchoolToolExecutors({ ...school, screenShare: new ScreenShare(), isActive: () => false });
  for (const name of Object.keys(tools)) {
    const result = await tools[name]({ steps: [{ kind: "text", x: 10, y: 10, text: "PRIVATE_SYNTHETIC" }] }, call(name));
    assert.match(JSON.stringify(result), /school session is closed/);
  }
  assert.equal(whiteboard.getSnapshot().ops.length, 0);
});

it("does not capture a preview-only school camera, even when the camera is active", async () => {
  const captureFrame = camera.captureFrame;
  Object.defineProperty(camera, "active", { configurable: true, value: true });
  camera.captureFrame = async () => { assert.fail("Preview-only camera must never be captured"); };
  globalThis.fetch = async () => { assert.fail("Preview-only camera must never be transmitted"); };
  try {
    for (const isCameraShared of [undefined, () => false]) {
      const tools = createSchoolToolExecutors({ ...school, screenShare: new ScreenShare(), isCameraShared });
      const result = await tools.look_through_camera({}, call("look_through_camera"));
      assert.match(JSON.stringify(result), /Camera sharing is off/);
    }
  } finally {
    camera.captureFrame = captureFrame;
    Reflect.deleteProperty(camera, "active");
  }
});

it("shares a camera frame only while the current school session and camera sharing remain active", async () => {
  const captureFrame = camera.captureFrame;
  const image = "data:image/jpeg;base64,U1lOVEhFVElD";
  Object.defineProperty(camera, "active", { configurable: true, value: true });
  globalThis.fetch = async () => { assert.fail("An allowed small image should use only the current session"); };
  let shared = true;
  let active = true;
  try {
    const tools = createSchoolToolExecutors({ ...school, screenShare: new ScreenShare(), isActive: () => active, isCameraShared: () => shared, imageAllowance: () => 10_000 });
    camera.captureFrame = async () => image;
    const allowed = await tools.look_through_camera({}, call("look_through_camera"));
    assert.deepEqual((allowed as { images: string[] }).images, [image]);
    for (const revoke of [() => { shared = false; }, () => { active = false; }]) {
      shared = true; active = true;
      camera.captureFrame = async () => { revoke(); return image; };
      const stopped = await tools.look_through_camera({}, call("look_through_camera"));
      assert.equal(JSON.stringify(stopped).includes(image), false);
      assert.match(JSON.stringify(stopped), /sharing ended|session is closed/);
    }
  } finally {
    camera.captureFrame = captureFrame;
    Reflect.deleteProperty(camera, "active");
  }
});

it("requires a fresh affirmative UI action before any private connection work", () => {
  const voice = readFileSync(new URL("../client/src/voice/VoiceTutor.tsx", import.meta.url), "utf8");
  const connect = voice.slice(voice.indexOf("const connect ="), voice.indexOf("const toggleSchoolCameraShare ="));
  assert.match(connect, /async \(schoolConsentForThisAttempt = false\)/);
  const gate = connect.indexOf("if (schoolSession && !schoolConsentForThisAttempt)");
  assert.ok(gate > 0);
  assert.match(connect.slice(gate), /^if \(schoolSession && !schoolConsentForThisAttempt\) \{\s*setShowSchoolConsent\(true\);\s*return;/);
  assert.ok(gate < connect.indexOf("await api.parentSession()"));
  assert.ok(gate < connect.indexOf("await requestMicrophone()"));
  assert.equal(voice.match(/connect\(true\)/g)?.length, 1);
  assert.match(voice, /onClick=\{\(\) => void connect\(true\)\}>Agree and start this session/);
  assert.match(voice, /if \(!autoStart \|\| autoStartedRef.current\) return;\s*autoStartedRef.current = true;\s*void connect\(\)/);
  assert.doesNotMatch(voice, /defaultChecked|defaultValue="(?:yes|agree)"/);
});

it("keeps school UI away from public writes, fallback and browser persistence", () => {
  const voice = readFileSync(new URL("../client/src/voice/VoiceTutor.tsx", import.meta.url), "utf8");
  const tools = readFileSync(new URL("../client/src/voice/schoolTools.ts", import.meta.url), "utf8");
  const schoolSession = readFileSync(new URL("../client/src/voice/schoolSession.ts", import.meta.url), "utf8");
  assert.match(voice, /if \(schoolSession \|\| !current\(\)\) throw caught;\s*const fallbacks/);
  assert.match(voice, /if \(!schoolSession\) \{\s*const started = await api\.tool\.lessonStarted/);
  const end = voice.slice(voice.indexOf("const endSession ="), voice.indexOf("const connect ="));
  assert.match(end, /if \(isSchoolMode\) \{[^}]*return;\s*\}/);
  assert.ok(end.indexOf("if (isSchoolMode)") < end.indexOf("await api.endSession"));
  assert.match(voice, /schoolSession\s*\? createSchoolToolExecutors/);
  assert.match(voice, /window\.addEventListener\("focus", checkAccess\)/);
  assert.match(voice, /document\.addEventListener\("visibilitychange", checkAccess\)/);
  assert.match(voice, /if \(!cancelled && !session\.authenticated\) schoolAccessLost\(\)/);
  assert.match(voice, /not saved as school submissions/);
  assert.match(voice, /privateContext: Boolean\(schoolSession\)/);
  for (const source of [voice, tools, schoolSession]) {
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage|indexedDB)\s*\./);
  }
  assert.doesNotMatch(tools, /api\.(?:tool|todaySchedule|currentLesson|studentSnapshot|selectLesson|endSession)\b/);
  assert.doesNotMatch(tools, /createToolExecutors|lessonWork|lessonNavigator\s*\./);
});

it("does not log or echo private provider/listener/tool errors", async () => {
  const sentinel = "SYNTHETIC_PRIVATE_ERROR_DETAIL";
  const logs: unknown[][] = [];
  const errors: string[] = [];
  const frames: string[] = [];
  const warn = console.warn, error = console.error;
  console.warn = (...args) => { logs.push(args); };
  console.error = (...args) => { logs.push(args); };
  try {
    const session = new LiveVoiceSession({
      mediaStream: {} as MediaStream, audioElement: {} as HTMLAudioElement,
      negotiate: async () => ({ sdp: "synthetic", sessionId: "synthetic" }),
      privateContext: true,
      tools: { synthetic_tool: async () => { throw new Error(sentinel); } },
    });
    session.on("error", message => { errors.push(message); });
    session.on("server_event", () => { throw new Error(sentinel); });
    const internals = session as unknown as {
      handleMessage(data: unknown, started: (info: { sessionId: string }) => void): void;
      channel: { readyState: string; send: (data: string) => void };
      runTool(call: LiveFunctionCall): Promise<void>;
    };
    for (const message of [
      `input history is limited: ${sentinel}`,
      `function call output ${sentinel}`,
      sentinel,
    ]) internals.handleMessage(JSON.stringify({ type: "error", error: { message } }), () => undefined);
    internals.channel = { readyState: "open", send: () => { throw new Error(sentinel); } };
    session.send({ type: "synthetic" });
    // A fresh budget lets the tool result be captured and checked too.
    const toolSession = new LiveVoiceSession({
      mediaStream: {} as MediaStream, audioElement: {} as HTMLAudioElement,
      negotiate: async () => ({ sdp: "synthetic", sessionId: "synthetic" }), privateContext: true,
      tools: { synthetic_tool: async () => { throw new Error(sentinel); } },
    });
    const toolInternals = toolSession as unknown as typeof internals;
    toolInternals.channel = { readyState: "open", send: data => { frames.push(data); } };
    await toolInternals.runTool(call("synthetic_tool"));
    assert.ok(logs.length >= 3);
    assert.ok(errors.length >= 2);
    assert.ok(frames.some(frame => frame.includes("private tutor could not complete")));
    assert.equal(JSON.stringify({ logs, errors, frames }).includes(sentinel), false);
  } finally { console.warn = warn; console.error = error; }
});
