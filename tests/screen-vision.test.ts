import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../server/index.js";
import {
  clipDescription,
  SCREEN_DESCRIPTION_INSTRUCTIONS,
  SCREEN_DESCRIPTION_MAX_CHARS,
  screenDescriptionPrompt,
} from "../server/lib/openai.js";
import { DescribeScreenSchema } from "../shared/schemas/api.js";

/*
 * The route that puts a frame of the shared screen into words. The vision
 * call itself is the model's business; what is checked here is the request
 * shape, the body size the route accepts, and the text around the picture.
 */

const tinyJpeg = `data:image/jpeg;base64,${Buffer.from("not really a jpeg").toString("base64")}`;

describe("DescribeScreenSchema", () => {
  it("accepts an image data URL with the surface and an optional question", () => {
    const parsed = DescribeScreenSchema.safeParse({ image: tinyJpeg, surface: "monitor", question: null });
    assert.equal(parsed.success, true);
  });

  it("refuses anything that is not an image data URL", () => {
    for (const image of ["https://example.org/a.jpg", "data:text/html;base64,PGI+", "data:image/jpeg;base64,not base64!"]) {
      assert.equal(DescribeScreenSchema.safeParse({ image, surface: "monitor", question: null }).success, false, image);
    }
    assert.equal(DescribeScreenSchema.safeParse({ image: tinyJpeg, surface: "desk", question: null }).success, false);
  });
});

describe("screen description text", () => {
  it("tells the model what is shared and what the tutor asked", () => {
    assert.match(screenDescriptionPrompt({ surface: "monitor", question: null }), /whole screen/);
    assert.match(screenDescriptionPrompt({ surface: "browser", question: null }), /only his browser tab/);
    assert.match(screenDescriptionPrompt({ surface: "window", question: " Which mode is Blender in? " }), /The tutor wants to know: Which mode is Blender in\?$/);
    assert.match(SCREEN_DESCRIPTION_INSTRUCTIONS, /Blender/);
    assert.match(SCREEN_DESCRIPTION_INSTRUCTIONS, /word for word/);
  });

  it("clips a long description on a word so it fits a tool output", () => {
    assert.equal(clipDescription("  Blender is open\n in Object Mode.  "), "Blender is open in Object Mode.");
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const clipped = clipDescription(long);
    assert.ok(clipped.length <= SCREEN_DESCRIPTION_MAX_CHARS);
    assert.ok(clipped.endsWith("…"));
    const kept = clipped.slice(0, -1);
    assert.ok(long.startsWith(kept));
    assert.equal(long[kept.length], " ", "cut on a word boundary, not inside a word");
  });
});

describe("POST /api/vision/screen", () => {
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

  function post(body: unknown) {
    return fetch(`${baseUrl}/api/vision/screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a request without an image", async () => {
    const response = await post({ surface: "monitor", question: null });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Validation failed/);
  });

  it("takes a body far larger than the rest of the API, since a frame is a few hundred kilobytes", async () => {
    const frame = `data:image/jpeg;base64,${Buffer.alloc(600_000, 65).toString("base64")}`;
    const response = await post({ image: frame, surface: "monitor", question: "What is open?" });
    // Past validation and the body limit; without a key the route says so
    // instead of calling anything.
    assert.ok([503, 502, 200].includes(response.status), `status ${response.status}`);
    if (response.status === 503) {
      assert.match(await response.text(), /not configured/);
    }
  });

  it("still refuses a body beyond its own limit", async () => {
    const frame = `data:image/jpeg;base64,${Buffer.alloc(2_400_000, 65).toString("base64")}`;
    const response = await post({ image: frame, surface: "monitor", question: null });
    assert.equal(response.status, 413);
  });
});
