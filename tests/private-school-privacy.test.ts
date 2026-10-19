import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "node:test";

const sentinel = "SYNTHETIC_PRIVATE_SCHOOL_CONTENT_MUST_NOT_BE_LOGGED";

async function isolated(script: string) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic",
    PARENT_ACCESS_CODE: "synthetic-parent-code",
    DOTENV_CONFIG_PATH: "tests/no-local-config.env",
  };
  delete childEnv.PRIVATE_SCHOOL_CONTEXT_JSON;
  return promisify(execFile)(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval", script,
  ], { env: childEnv, timeout: 15_000 });
}

it("the shared Prisma client does not print private arguments on validation failure", async () => {
  const { stdout, stderr } = await isolated(`
    import assert from "node:assert/strict";
    const { prisma, disconnectPrisma } = await import("./server/lib/prisma.ts");
    try {
      await assert.rejects(prisma.privateSchoolContext.create({ data: {
        id: "synthetic", content: { summary: "${sentinel}" },
        revision: "deliberately-invalid-type", parentEdited: true,
      }}), error => {
        assert.match(error.message, /${sentinel}/);
        return true;
      });
      console.log("validation failure was not logged");
    } finally { await disconnectPrisma(); }
  `);
  assert.match(stdout, /validation failure was not logged/);
  assert.equal((stdout + stderr).includes(sentinel), false);
});

it("private write failures replace unsafe provider errors before they escape", async () => {
  const { stdout, stderr } = await isolated(`
    import assert from "node:assert/strict";
    let writes = 0;
    globalThis.prisma = {
      $transaction: async work => work({ privateSchoolContext: {
        findUnique: async () => null,
        create: async () => {
          writes += 1;
          throw new Error("Simulated query arguments: ${sentinel}");
        },
      }}),
    };
    const { saveSchoolContext } = await import("./server/services/schoolContext.ts");
    await assert.rejects(saveSchoolContext({ summary: "${sentinel}" }, 0), error => {
      assert.equal(error.message, "The private school plan could not be saved. Existing records were kept.");
      assert.equal(String(error).includes("${sentinel}"), false);
      return true;
    });
    assert.equal(writes, 1);
    console.log("private write failure sanitized");
  `);
  assert.match(stdout, /private write failure sanitized/);
  assert.equal((stdout + stderr).includes(sentinel), false);
});

it("a concurrent initial import is skipped without logging its payload or failing startup", async () => {
  const { stdout, stderr } = await isolated(`
    import assert from "node:assert/strict";
    import { Prisma } from "@prisma/client";
    const context = {
      schemaVersion: 1, active: true, sourceName: "Example school", schoolYear: "2026-27",
      asOf: "2026-10-01T12:00:00Z", timeZone: null, timezoneNote: "",
      summary: "${sentinel}",
      courses: [{ id: "math", label: "Mathematics", subject: "mathematics", focus: "", units: [], instructions: [] }],
      schedule: [], workload: [], cautions: [], sources: [],
    };
    process.env.PRIVATE_SCHOOL_CONTEXT_JSON = JSON.stringify({ context, expectedRevision: 0, importId: "synthetic-import" });
    globalThis.prisma = {
      $transaction: async work => work({ privateSchoolContext: {
        findUnique: async () => null,
        create: async () => { throw new Prisma.PrismaClientKnownRequestError(
          "Simulated losing concurrent create: ${sentinel}", { code: "P2002", clientVersion: "test" },
        ); },
      }}),
    };
    const { bootstrapSchoolContext, saveSchoolContext, SchoolContextConflict } = await import("./server/services/schoolContext.ts");
    await bootstrapSchoolContext();
    await assert.rejects(saveSchoolContext(context, 0), SchoolContextConflict);
    console.log("concurrent bootstrap kept serving; parent save still conflicts");
  `);
  assert.match(stdout, /bootstrap skipped after concurrent update/);
  assert.match(stdout, /parent save still conflicts/);
  assert.equal((stdout + stderr).includes(sentinel), false);
});
