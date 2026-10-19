import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "node:test";

const sentinel = "SYNTHETIC_PRIVATE_SCHOOL_TUTOR_CONTENT";

it("school voice and vision enforce existing private access, revision checks, no public writes or private error leaks", async () => {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test", DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic",
    PARENT_ACCESS_CODE: "synthetic-parent-code", APP_ACCESS_PASSWORD: "",
    OPENAI_API_KEY: "synthetic-never-transmitted", GEMINI_API_KEY: "synthetic-never-transmitted",
    XAI_API_KEY: "", ELEVENLABS_API_KEY: "", AUTO_INGEST_CURRICULUM: "false",
    DOTENV_CONFIG_PATH: "tests/no-local-config.env",
  };
  delete childEnv.PRIVATE_SCHOOL_CONTEXT_JSON;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    let reads = 0, publicAccess = 0, liveCalls = 0, visionCalls = 0;
    let failLive = false, failVision = false, failRead = false;
    const context = {
      schemaVersion: 1, active: true, sourceName: "Synthetic school", schoolYear: "2026-27",
      asOf: "2026-10-01T12:00:00Z", timeZone: null, timezoneNote: "Unconfirmed school timezone.", summary: "",
      courses: [{ id: "math", label: "Mathematics", subject: "mathematics", focus: "Ratios", units: [], instructions: [] }],
      assignments: [{ id: "ratios", courseId: "math", title: "${sentinel}", unit: "Ratios", kind: "lesson", status: "current", instructions: ["Explain ratios."], tutoringFocus: "Different visual examples.", sequence: 0, timingNote: "" }],
      schedule: [], workload: [], cautions: [], sources: [],
    };
    globalThis.prisma = new Proxy({}, { get(_target, property) {
      if (property === "privateSchoolContext") return { findUnique: async () => {
        reads++;
        if (failRead) throw new Error("Database input: ${sentinel}");
        return { content: context, revision: 4, updatedAt: new Date("2026-10-01T12:00:00Z") };
      }};
      publicAccess++;
      throw new Error("Unexpected public storage access: " + String(property));
    }});
    const { createApp } = await import("./server/index.ts");
    const { getOpenAI, createLiveSession } = await import("./server/lib/openai.ts");
    const sdk = getOpenAI();
    sdk.live.create = async (body, options) => {
      liveCalls++;
      if (failLive) throw new Error("insufficient_quota; echoed context: ${sentinel}");
      assert.equal(body.session.store, false);
      assert.match(options.headers["OpenAI-Safety-Identifier"], /^[a-f0-9]{64}$/);
      if (body.session.instructions === "PUBLIC_DEFAULT_TEST") {
        assert.equal(body.session.delegation.responses.tools.some(tool => tool.type === "web_search"), true);
      } else {
        assert.ok(body.session.instructions.includes("[SELECTED_SCHOOL_ASSIGNMENT:ratios]"));
        assert.ok(body.session.delegation.responses.instructions.includes("${sentinel}"));
        assert.equal(body.session.delegation.responses.tools.some(tool => tool.type === "web_search"), false);
        assert.equal(body.session.delegation.responses.tools.length, 14);
        for (const tool of body.session.delegation.responses.tools) assert.doesNotMatch(tool.name, /submit|record|search|browse_web|mastery|student_snapshot/);
        assert.equal(body.session.input, undefined);
      }
      return { session: { id: "synthetic-live-session" }, transport: { sdp: "v=0 synthetic answer" } };
    };
    sdk.responses.create = async body => {
      visionCalls++;
      if (failVision) throw new Error("Vision input: ${sentinel}");
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      return { output_text: "Synthetic shared page shows a ratio model." };
    };
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const baseUrl = "http://127.0.0.1:" + server.address().port;
    let cookie = "";
    const post = (path, body, authenticated = true) => fetch(baseUrl + path, {
      method: "POST", headers: { "content-type": "application/json", ...(authenticated && cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const liveBody = { assignmentId: "ratios", expectedRevision: 4, sdp: "v=0\\r\\no=synthetic-offer-1234567890" };
    const visionBody = { assignmentId: "ratios", expectedRevision: 4, image: "data:image/jpeg;base64," + Buffer.alloc(600000, 65).toString("base64"), surface: "monitor", question: null };
    try {
      for (const path of ["/api/parent/school-tutor/live", "/api/parent/school-tutor/vision"]) {
        const response = await post(path, path.endsWith("vision") ? visionBody : liveBody, false);
        assert.equal(response.status, 401);
        assert.equal((await response.text()).includes("${sentinel}"), false);
      }
      assert.equal(reads, 0);
      const login = await post("/api/parent/login", { code: "synthetic-parent-code" }, false);
      assert.equal(login.status, 200);
      cookie = login.headers.get("set-cookie").split(";")[0];

      for (const path of ["/api/parent/school-tutor/live", "/api/parent/school-tutor/vision"]) {
        const body = path.endsWith("vision") ? visionBody : liveBody;
        assert.equal((await post(path, { ...body, expectedRevision: 3 })).status, 409);
        assert.equal((await post(path, { ...body, assignmentId: "missing" })).status, 404);
        context.assignments[0].status = "complete";
        assert.equal((await post(path, body)).status, 409);
        context.assignments[0].status = "skipped";
        assert.equal((await post(path, body)).status, 409);
        context.assignments[0].status = "current";
        context.active = false;
        assert.equal((await post(path, body)).status, 422);
        context.active = true;
        const invalid = await post(path, { ...body, leakedField: "${sentinel}" });
        assert.equal(invalid.status, 400);
        assert.equal((await invalid.text()).includes("${sentinel}"), false);
      }
      assert.equal(liveCalls, 0);
      assert.equal(visionCalls, 0);

      const live = await post("/api/parent/school-tutor/live", liveBody);
      assert.equal(live.status, 200);
      const receipt = await live.json();
      assert.equal(receipt.lessonId, "school:ratios");
      assert.equal(receipt.lessonMarker, "[SELECTED_SCHOOL_ASSIGNMENT:ratios]");
      assert.equal(receipt.sessionId, "synthetic-live-session");
      assert.equal(JSON.stringify(receipt).includes("${sentinel}"), false);
      const vision = await post("/api/parent/school-tutor/vision", visionBody);
      assert.equal(vision.status, 200);
      assert.equal((await vision.json()).description, "Synthetic shared page shows a ratio model.");
      assert.equal((await post("/api/parent/school-tutor/vision", { ...visionBody, image: "data:image/jpeg;base64," + "A".repeat(3200000) })).status, 413);
      assert.equal((await post("/api/parent/school-tutor/live", { ...liveBody, sdp: "v=0" + "a".repeat(110000) })).status, 413);

      failLive = true;
      failVision = true;
      for (const [path, body] of [["/api/parent/school-tutor/live", liveBody], ["/api/parent/school-tutor/vision", visionBody]]) {
        const response = await post(path, body);
        assert.equal(response.status, 502);
        const error = await response.json();
        assert.equal("fallbacks" in error, false);
        assert.equal(JSON.stringify(error).includes("${sentinel}"), false);
      }
      failRead = true;
      const readError = await post("/api/parent/school-tutor/live", liveBody);
      assert.equal(readError.status, 502);
      assert.equal((await readError.text()).includes("${sentinel}"), false);
      const contextError = await fetch(baseUrl + "/api/parent/school-context", { headers: { cookie } });
      assert.equal(contextError.status, 500);
      assert.equal((await contextError.text()).includes("${sentinel}"), false);
      failLive = false;
      await createLiveSession({ sdp: liveBody.sdp, safetyIdentifier: "a".repeat(64), voiceInstructions: "PUBLIC_DEFAULT_TEST", backendInstructions: "Synthetic", tools: [] });
      assert.equal(publicAccess, 0);
      assert.equal(liveCalls, 3);
      assert.equal(visionCalls, 2);
      console.log("school endpoints validated without public storage access");
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  `,
  ], { env: childEnv, timeout: 20_000, maxBuffer: 1_000_000 });
  assert.match(stdout, /school endpoints validated without public storage access/);
  assert.equal((stdout + stderr).includes(sentinel), false);
});
