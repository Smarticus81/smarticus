import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Camera, describeCameraError } from "../client/src/voice/camera.js";

/*
 * The camera module against a pretend browser: enough of navigator, window and
 * document for Camera to run, with getUserMedia scripted per test. What is
 * checked here is the behaviour around the browser's answer, since the answer
 * itself is the browser's business.
 */

type Listener = () => void;

class FakeTrack {
  readyState: "live" | "ended" = "live";
  private readonly handlers = new Map<string, Set<Listener>>();
  constructor(readonly kind = "video") {}
  addEventListener(name: string, handler: Listener) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
  }
  stop() {
    this.readyState = "ended";
  }
  /** What the browser does when the device is unplugged or taken over. */
  end() {
    this.readyState = "ended";
    for (const handler of this.handlers.get("ended") ?? []) handler();
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks;
  }
}

class FakeVideo {
  srcObject: unknown = null;
  muted = false;
  playsInline = false;
  videoWidth = 0;
  videoHeight = 0;
  played = 0;
  play() {
    this.played += 1;
    return Promise.resolve();
  }
  addEventListener() {}
  removeEventListener() {}
}

function domError(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

const requests: MediaStreamConstraints[] = [];
let answer: (constraints: MediaStreamConstraints) => Promise<FakeStream>;
let videos: FakeVideo[] = [];

beforeEach(() => {
  requests.length = 0;
  videos = [];
  answer = async () => new FakeStream();
  // Node has its own read-only navigator; define over it rather than assign.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      mediaDevices: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          requests.push(constraints);
          return answer(constraints);
        },
      },
    },
  });
  (globalThis as { window: unknown }).window = {
    isSecureContext: true,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  (globalThis as { document: unknown }).document = {
    createElement: (tag: string) => {
      assert.equal(tag, "video");
      const video = new FakeVideo();
      videos.push(video);
      return video;
    },
  };
});

afterEach(() => {
  delete (globalThis as { navigator?: unknown }).navigator;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe("Camera.start", () => {
  it("opens with the rear-camera preference and reports itself on", async () => {
    const camera = new Camera();
    const seen: boolean[] = [];
    camera.onChange((state) => seen.push(state.active));
    await camera.start();
    assert.equal(camera.active, true);
    assert.equal(camera.error, null);
    assert.equal(requests.length, 1);
    assert.deepEqual((requests[0].video as MediaTrackConstraints).facingMode, { ideal: "environment" });
    assert.deepEqual(seen, [false, true]);
    assert.equal(videos[0].muted, true);
    assert.equal(videos[0].played, 1);
    assert.equal(videos[0].srcObject, camera.preview);
  });

  it("asks again with no preferences when the preferred request is refused by the device", async () => {
    answer = async (constraints) => {
      if (constraints.video !== true) throw domError("NotReadableError", "Could not start video source");
      return new FakeStream();
    };
    const camera = new Camera();
    await camera.start();
    assert.equal(camera.active, true);
    assert.equal(camera.error, null);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].video, true);
  });

  it("keeps the reason when the camera cannot open, and does not retry a refusal of permission", async () => {
    answer = async () => {
      throw domError("NotAllowedError", "Permission denied");
    };
    const camera = new Camera();
    const states: Array<{ starting: boolean; error: string | null }> = [];
    camera.onChange((state) => states.push({ starting: state.starting, error: state.error }));
    await assert.rejects(camera.start(), (error: Error) => error.name === "NotAllowedError");
    assert.equal(camera.active, false);
    assert.equal(requests.length, 1);
    assert.match(camera.error ?? "", /address bar/);
    assert.deepEqual(states, [
      { starting: true, error: null },
      { starting: false, error: camera.error },
    ]);
    // Trying again clears the old message before the browser answers.
    answer = async () => new FakeStream();
    await camera.start();
    assert.equal(camera.error, null);
    assert.equal(camera.active, true);
  });

  it("explains a device the browser could not start after the plain request also fails", async () => {
    answer = async () => {
      throw domError("NotReadableError", "Device in use");
    };
    const camera = new Camera();
    await assert.rejects(camera.start());
    assert.equal(requests.length, 2);
    assert.match(camera.error ?? "", /Another app may be using it/);
  });

  it("shares one request between two presses of the button", async () => {
    let release: (stream: FakeStream) => void = () => undefined;
    answer = () => new Promise((resolve) => (release = resolve));
    const camera = new Camera();
    const first = camera.start();
    const second = camera.start();
    assert.equal(first, second);
    assert.equal(camera.getSnapshot().starting, true);
    release(new FakeStream());
    await first;
    assert.equal(requests.length, 1);
    assert.equal(camera.active, true);
  });

  it("turns off when the track ends on its own, and on stop", async () => {
    const stream = new FakeStream();
    let handed = false;
    answer = async () => (handed ? new FakeStream() : ((handed = true), stream));
    const camera = new Camera();
    await camera.start();
    stream.tracks[0].end();
    assert.equal(camera.active, false);
    assert.equal(camera.preview, null);

    await camera.start();
    assert.equal(camera.active, true);
    camera.stop();
    assert.equal(camera.active, false);
    assert.equal(camera.preview, null);
    assert.equal(videos.at(-1)?.srcObject, null);
  });

  it("refuses outside a secure context with a reason", async () => {
    (globalThis as { window: { isSecureContext: boolean } }).window.isSecureContext = false;
    const camera = new Camera();
    await assert.rejects(camera.start());
    assert.equal(requests.length, 0);
    assert.match(camera.error ?? "", /HTTPS or localhost/);
  });
});

describe("Camera.captureFrame", () => {
  it("gives nothing while the camera is off", async () => {
    const camera = new Camera();
    assert.equal(await camera.captureFrame(), null);
  });
});

describe("describeCameraError", () => {
  it("names the fix for each kind of refusal", () => {
    assert.match(describeCameraError(domError("NotAllowedError")), /Allow/);
    assert.match(describeCameraError(domError("NotFoundError")), /No camera was found/);
    assert.match(describeCameraError(domError("NotReadableError")), /Another app/);
    assert.match(describeCameraError(domError("OverconstrainedError")), /different camera/);
    assert.match(describeCameraError(domError("TimeoutError")), /unanswered/);
    assert.match(describeCameraError(new Error("boom")), /boom/);
    assert.match(describeCameraError("?"), /could not open/);
  });
});
