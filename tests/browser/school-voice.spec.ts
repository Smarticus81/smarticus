import { test, expect, type Page } from "@playwright/test";
import type { SchoolContext } from "../../shared/schoolContext";

test.use({
  launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone", "camera"],
});

const context: SchoolContext = {
  schemaVersion: 1, active: true, sourceName: "Synthetic School", schoolYear: "2026-27",
  asOf: "2026-10-01T12:00:00Z", timeZone: null, timezoneNote: "Time zone unconfirmed", summary: "Synthetic plan",
  courses: [{ id: "math", label: "Example Mathematics", subject: "mathematics", focus: "Fractions", units: [], instructions: [] }],
  assignments: [{ id: "fractions", courseId: "math", title: "Synthetic fraction lesson", unit: "Fractions", kind: "practice", status: "current", instructions: ["Draw one half."], tutoringFocus: "Explain the denominator", sequence: 1, timingNote: "" }],
  schedule: [], workload: [], cautions: [], sources: [],
};

type VoiceProbe = {
  streams: MediaStream[];
  microphoneRequests: number;
  sent: string[];
  channels: Array<{ onmessage: ((event: { data: string }) => void) | null; readyState: string }>;
};

async function openVoice(page: Page, options: { fail?: boolean; wrongMarker?: boolean } = {}) {
  let authenticated = true;
  const requests: Array<{ path: string; method: string; body: any }> = [];
  const webSockets: string[] = [];
  page.on("websocket", socket => { webSockets.push(socket.url()); });
  await page.addInitScript(() => {
    const probe: VoiceProbe = { streams: [], channels: [], microphoneRequests: 0, sent: [] };
    (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe = probe;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints?.audio) probe.microphoneRequests++;
      const stream = await getUserMedia(constraints);
      probe.streams.push(stream);
      return stream;
    };
    // Synthetic transport only. The actual VoiceTutor, negotiator, tools and
    // lifecycle still run, but no microphone audio reaches an AI provider.
    class FakePeer {
      iceGatheringState = "complete";
      localDescription: RTCSessionDescriptionInit | null = null;
      channel: { onmessage: ((event: { data: string }) => void) | null; readyState: string; send: (data: string) => void; close: () => void } | null = null;
      addTrack() {}
      createDataChannel() {
        const channel = { onmessage: null as ((event: { data: string }) => void) | null, readyState: "open", send: (data: string) => { probe.sent.push(data); }, close: () => { channel.readyState = "closed"; } };
        this.channel = channel;
        probe.channels.push(channel);
        return channel;
      }
      async createOffer() { return { type: "offer" as const, sdp: "synthetic-offer" }; }
      async setLocalDescription(value: RTCSessionDescriptionInit) { this.localDescription = value; }
      async setRemoteDescription() {
        this.channel?.onmessage?.({ data: JSON.stringify({ type: "session.started", session: { id: "synthetic-private-session" } }) });
      }
      close() { this.channel?.close(); }
    }
    window.RTCPeerConnection = FakePeer as unknown as typeof RTCPeerConnection;
  });
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    if (path === "/api/parent/session") return route.fulfill({ json: { authenticated, configured: true } });
    if (path === "/api/parent/logout") { authenticated = false; return route.fulfill({ status: 204 }); }
    if (path === "/api/parent/school-context") return authenticated
      ? route.fulfill({ json: { context, revision: 3, updatedAt: context.asOf, lessons: [] } })
      : route.fulfill({ status: 401, json: { error: "Access required" } });
    if (path === "/api/parent/school-tutor/live") {
      if (options.fail) return route.fulfill({ status: 402, json: { error: "SYNTHETIC_PRIVATE_PROVIDER_DETAIL", fallbacks: ["gemini", "grok", "elevenlabs"] } });
      return route.fulfill({ json: { sdp: "synthetic-answer", sessionId: "synthetic-private-session", lessonId: "school:fractions", lessonMarker: options.wrongMarker ? "[SELECTED_LESSON:fractions]" : "[SELECTED_SCHOOL_ASSIGNMENT:fractions]", voiceModel: "synthetic-live", backendModel: "synthetic-reasoner", voice: "synthetic" } });
    }
    if (path === "/api/parent/school-tutor/vision") return route.fulfill({ json: { description: "Synthetic camera frame" } });
    return route.fulfill({ status: 503, json: { error: "Unexpected route in synthetic private-voice test" } });
  });
  await page.goto("/tests/browser/school-context.html");
  await page.getByRole("region", { name: "Start here", exact: true }).getByRole("button", { name: "Open assignment" }).click();
  await page.getByRole("button", { name: "Talk with Virgil" }).click();
  await expect(page.getByRole("region", { name: "Share with OpenAI for this session?" })).toBeVisible();
  return { requests, webSockets, expire: () => { authenticated = false; } };
}

async function consent(page: Page) {
  await page.getByRole("button", { name: "Agree and start this session", exact: true }).click();
}

async function microphoneRequests(page: Page) {
  return page.evaluate(() => (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe.microphoneRequests);
}

async function requestCameraTool(page: Page, callId: string) {
  await page.evaluate(callId => {
    const probe = (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe;
    probe.channels[probe.channels.length - 1].onmessage?.({ data: JSON.stringify({
      type: "response.event", delegation_id: `delegation-${callId}`,
      event: { type: "response.output_item.done", item: { type: "function_call", call_id: callId, name: "look_through_camera", arguments: "{}" } },
    }) });
  }, callId);
  await expect.poll(() => page.evaluate(callId => {
    const probe = (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe;
    return probe.sent.some(frame => { const event = JSON.parse(frame); return event.item?.call_id === callId; });
  }, callId)).toBe(true);
}

async function microphoneStates(page: Page) {
  return page.evaluate(() => (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe.streams.flatMap(stream => stream.getTracks().map(track => track.readyState)));
}

test("connected School voice keeps transcript in memory and ends without public session writes", async ({ page }) => {
  const mock = await openVoice(page);
  await consent(page);
  await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toEqual([{ path: "/api/parent/school-tutor/live", method: "POST", body: { assignmentId: "fractions", expectedRevision: 3, sdp: "synthetic-offer" } }]);
  await page.evaluate(() => {
    const probe = (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe;
    probe.channels[0].onmessage?.({ data: JSON.stringify({ type: "session.output_transcript.delta", delta: "SYNTHETIC_PRIVATE_CONVERSATION", start_ms: 0, end_ms: 1000 }) });
  });
  await expect(page.locator(".live-utterance")).toContainText("SYNTHETIC_PRIVATE_CONVERSATION");
  expect((await microphoneStates(page)).every(state => state === "live")).toBe(true);
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(page.locator(".voice-hud")).toContainText("School conversation ended");
  await expect(page.getByText("SYNTHETIC_PRIVATE_CONVERSATION", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Session saved. Nice thinking.", { exact: true })).toHaveCount(0);
  expect((await microphoneStates(page)).every(state => state === "ended")).toBe(true);
  expect(mock.requests.every(request => request.path.startsWith("/api/parent/"))).toBe(true);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

for (const hidden of [false, true]) {
  test(`expired parent access clears connected private voice when ${hidden ? "hidden" : "focused"}`, async ({ page }) => {
    const mock = await openVoice(page);
    await consent(page);
    await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: /Try it out/ }).fill("SYNTHETIC_PRIVATE_NOTE");
    mock.expire();
    await page.evaluate(hidden => {
      if (hidden) {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      } else window.dispatchEvent(new Event("focus"));
    }, hidden);
    await expect(page.getByRole("button", { name: "Unlock schoolwork", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Virgil voice tutor" })).toHaveCount(0);
    await expect(page.getByText("Synthetic fraction lesson", { exact: true })).toHaveCount(0);
    expect((await microphoneStates(page)).every(state => state === "ended")).toBe(true);
    expect(mock.requests.filter(request => request.path === "/api/parent/session").length).toBeGreaterThanOrEqual(2);
    expect(mock.requests.every(request => request.path.startsWith("/api/parent/"))).toBe(true);
  });
}

test("a quota error cannot send private context into a fallback or expose provider details", async ({ page }) => {
  const mock = await openVoice(page, { fail: true });
  await consent(page);
  await expect(page.getByRole("alert")).toContainText("school tutor could not connect");
  await expect(page.getByText("SYNTHETIC_PRIVATE_PROVIDER_DETAIL", { exact: false })).toHaveCount(0);
  await expect(page.locator(".voice-fallback-notice")).toHaveCount(0);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect(mock.requests.every(request => request.path.startsWith("/api/parent/"))).toBe(true);
  expect(mock.webSockets.filter(url => url.includes("/api/realtime/"))).toEqual([]);
  expect((await microphoneStates(page)).every(state => state === "ended")).toBe(true);
});

test("a public lesson marker cannot start a private school conversation", async ({ page }) => {
  const mock = await openVoice(page, { wrongMarker: true });
  await consent(page);
  await expect(page.getByRole("alert")).toContainText("school tutor could not connect");
  await expect(page.getByRole("button", { name: "End session", exact: true })).toHaveCount(0);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect((await microphoneStates(page)).every(state => state === "ended")).toBe(true);
});

test("private voice waits for informed consent, and Cancel leaves the assignment usable", async ({ page }) => {
  const mock = await openVoice(page);
  const permission = page.getByRole("region", { name: "Share with OpenAI for this session?" });
  await expect(permission).toContainText("Synthetic fraction lesson");
  await expect(permission).toContainText("microphone audio");
  await expect(permission).toContainText("schedule, workload notes and cautions");
  await expect(permission).toContainText("Opening the camera preview alone does not share it");
  await expect(permission.locator("input:checked, option:checked")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Share with OpenAI for this session?" })).toBeFocused();
  await page.screenshot({ path: "test-results/school-consent-desktop.png", fullPage: true });
  expect(await microphoneRequests(page)).toBe(0);
  expect(mock.requests.map(request => request.path)).toEqual(["/api/parent/school-context"]);
  await page.getByRole("textbox", { name: /Try it out/ }).fill("SYNTHETIC_UNSENT_NOTE");
  await permission.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(permission).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review and start tutoring", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: /Try it out/ })).toHaveValue("SYNTHETIC_UNSENT_NOTE");
  await page.getByRole("button", { name: "Open whiteboard", exact: true }).click();
  await expect(page.locator(".school-whiteboard")).toBeVisible();
  expect(await microphoneRequests(page)).toBe(0);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(0);
  await page.getByRole("button", { name: "Review and start tutoring", exact: true }).click();
  await expect(permission).toBeVisible();
  expect(await microphoneRequests(page)).toBe(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("a failed school connection requires a fresh affirmative choice before retrying", async ({ page }) => {
  const mock = await openVoice(page, { fail: true });
  await consent(page);
  await expect(page.getByRole("alert")).toContainText("school tutor could not connect");
  expect(await microphoneRequests(page)).toBe(1);
  await page.getByRole("button", { name: "Review and start tutoring", exact: true }).click();
  await expect(page.getByRole("region", { name: "Share with OpenAI for this session?" })).toBeVisible();
  expect(await microphoneRequests(page)).toBe(1);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await microphoneRequests(page)).toBe(1);
  await page.getByRole("button", { name: "Review and start tutoring", exact: true }).click();
  await consent(page);
  await expect.poll(() => mock.requests.filter(request => request.method === "POST").length).toBe(2);
  await expect(page.getByRole("alert")).toContainText("school tutor could not connect");
  expect(await microphoneRequests(page)).toBe(2);
});

test("ending and restarting never reuses consent or duplicates a double-clicked start", async ({ page }) => {
  const mock = await openVoice(page);
  await page.getByRole("button", { name: "Agree and start this session", exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect(await microphoneRequests(page)).toBe(1);
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await page.getByRole("button", { name: "Start another conversation", exact: true }).click();
  await expect(page.getByRole("region", { name: "Share with OpenAI for this session?" })).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect(await microphoneRequests(page)).toBe(1);
  expect((await microphoneStates(page)).every(state => state === "ended")).toBe(true);
  await consent(page);
  await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(2);
  expect(await microphoneRequests(page)).toBe(2);
});

test("an interrupted session must ask again before reconnecting", async ({ page }) => {
  const mock = await openVoice(page);
  await consent(page);
  await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const probe = (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe;
    probe.channels[0].onmessage?.({ data: JSON.stringify({ type: "session.closed", reason: "synthetic-disconnect" }) });
  });
  await expect(page.getByRole("alert")).toContainText("school conversation ended");
  await page.getByRole("button", { name: "Review and start tutoring", exact: true }).click();
  await expect(page.getByRole("region", { name: "Share with OpenAI for this session?" })).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  expect(await microphoneRequests(page)).toBe(1);
});

test("camera preview remains local until shared and permission resets for a new session", async ({ page }) => {
  const mock = await openVoice(page);
  const imageTransmissions = async () => mock.requests.filter(request => request.path.endsWith("/vision")).length
    + await page.evaluate(() => (window as unknown as { schoolVoiceProbe: VoiceProbe }).schoolVoiceProbe.sent.filter(frame => frame.includes("data:image/")).length);
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("region", { name: "Schoolwork camera" })).toBeVisible();
  expect(await microphoneRequests(page)).toBe(0);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(0);
  await consent(page);
  await expect(page.getByRole("button", { name: "End session", exact: true })).toBeVisible();
  await requestCameraTool(page, "preview-only");
  expect(await imageTransmissions()).toBe(0);
  await page.getByRole("button", { name: "Share camera with Virgil", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop sharing camera", exact: true })).toHaveAttribute("aria-pressed", "true");
  await requestCameraTool(page, "camera-shared");
  expect(await imageTransmissions()).toBe(1);
  await page.getByRole("button", { name: "Stop sharing camera", exact: true }).click();
  await requestCameraTool(page, "camera-stopped");
  expect(await imageTransmissions()).toBe(1);
  await page.getByRole("button", { name: "Share camera with Virgil", exact: true }).click();
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await page.getByRole("button", { name: "Start another conversation", exact: true }).click();
  await consent(page);
  await expect(page.getByRole("button", { name: "Share camera with Virgil", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("region", { name: "Schoolwork camera" })).toBeVisible();
  await requestCameraTool(page, "new-session-preview");
  expect(await imageTransmissions()).toBe(1);
});

test("the school consent choices fit a narrow viewport and returning to an assignment asks again", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await openVoice(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/school-consent-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Back to school day", exact: true }).click();
  await page.getByRole("region", { name: "Start here", exact: true }).getByRole("button", { name: "Open assignment" }).click();
  await page.getByRole("button", { name: "Talk with Virgil", exact: true }).click();
  await expect(page.getByRole("region", { name: "Share with OpenAI for this session?" })).toBeVisible();
  expect(await microphoneRequests(page)).toBe(0);
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(0);
});
