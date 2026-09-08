import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "node:test";

it("loads the HTTP app without database configuration and validates it only when bootstrapping", async () => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", DOTENV_CONFIG_PATH: "tests/no-local-config.env" };
  delete childEnv.DATABASE_URL;
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import assert from "node:assert/strict";
     const { bootstrapDatabase } = await import("./scripts/bootstrap-database.ts");
     assert.equal(process.env.DATABASE_URL, undefined);
     await assert.rejects(bootstrapDatabase(), /DATABASE_URL is required/);
     const { createApp } = await import("./server/index.ts");
     assert.equal(typeof createApp(), "function");
     console.log("isolated startup passed");`,
  ], { env: childEnv, timeout: 15000 });
  assert.match(stdout, /isolated startup passed/);
});
