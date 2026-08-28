import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../server/index.js";

describe("HTTP health endpoint", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected an IP socket");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns liveness metadata and security headers", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as { status: string; service: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "healthy");
    assert.equal(body.service, "atticus-tutor");
    assert.ok(response.headers.get("x-request-id"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-powered-by"), null);
  });

  it("does not route unknown API paths to the SPA", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /API route not found/);
  });

  it("returns a client error for malformed JSON", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid request body/);
  });
});
