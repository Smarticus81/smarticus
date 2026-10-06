import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ScreenShare } from "../client/src/voice/screenShare.js";

/*
 * Screen sharing against a pretend browser. What matters is the request made
 * to the browser and what is reported back about the answer: the picker must
 * be allowed to offer the whole screen, since the Monday builder lesson lives
 * in Blender outside the browser, and the tutor must be told which surface
 * was picked.
 */

class FakeTrack {
  readyState: "live" | "ended" = "live";
  constructor(private readonly displaySurface?: string) {}
  getSettings() {
    return this.displaySurface ? { displaySurface: this.displaySurface } : {};
  }
  addEventListener() {}
  stop() {
    this.readyState = "ended";
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks;
  }
}

const requests: unknown[] = [];
let answer: () => Promise<FakeStream>;

beforeEach(() => {
  requests.length = 0;
  answer = async () => new FakeStream([new FakeTrack("monitor")]);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      mediaDevices: {
        getDisplayMedia: (constraints: unknown) => {
          requests.push(constraints);
          return answer();
        },
      },
    },
  });
  (globalThis as { document: unknown }).document = {
    createElement: () => ({
      muted: false,
      playsInline: false,
      srcObject: null,
      videoWidth: 0,
      play: () => Promise.resolve(),
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  (globalThis as { window: unknown }).window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
});

afterEach(() => {
  delete (globalThis as { navigator?: unknown }).navigator;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
});

describe("ScreenShare.start", () => {
  it("lets the picker offer the whole screen, not only this tab", async () => {
    const share = new ScreenShare();
    await share.start();
    assert.equal(requests.length, 1);
    const request = requests[0] as Record<string, unknown>;
    assert.equal("preferCurrentTab" in request, false, "preferCurrentTab narrows the picker to this tab");
    assert.equal(request.selfBrowserSurface, "include");
    assert.equal(request.surfaceSwitching, "include");
    assert.equal(request.monitorTypeSurfaces, "include");
    assert.equal(request.audio, false);
    assert.equal(share.active, true);
  });

  it("reports which surface was picked, and unknown when the browser does not say", async () => {
    const share = new ScreenShare();
    await share.start();
    assert.equal(share.surface, "monitor");
    share.stop();
    assert.equal(share.surface, "unknown");

    answer = async () => new FakeStream([new FakeTrack("browser")]);
    await share.start();
    assert.equal(share.surface, "browser");
    share.stop();

    answer = async () => new FakeStream([new FakeTrack()]);
    await share.start();
    assert.equal(share.surface, "unknown");
  });

  it("tells listeners when sharing starts and stops", async () => {
    const share = new ScreenShare();
    const seen: boolean[] = [];
    share.onChange((active) => seen.push(active));
    await share.start();
    share.stop();
    assert.deepEqual(seen, [true, false]);
    assert.equal(await share.captureFrame(), null);
  });
});

describe("ScreenShare.describeSurface", () => {
  it("says whether a program such as Blender can be in the picture", () => {
    assert.match(ScreenShare.describeSurface("monitor"), /whole screen/);
    assert.match(ScreenShare.describeSurface("monitor"), /Blender/);
    assert.match(ScreenShare.describeSurface("browser"), /only this browser tab/);
    assert.match(ScreenShare.describeSurface("browser"), /not in the picture/);
    assert.match(ScreenShare.describeSurface("window"), /one program window/);
    assert.equal(ScreenShare.describeSurface("unknown"), "his screen");
  });
});
