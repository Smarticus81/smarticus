import { useSyncExternalStore } from "react";

/**
 * The camera, so work done on paper can be seen and handed in.
 *
 * A whiteboard and a typed answer only cover the work done at the keyboard.
 * Most of a Grade 6 day is done on paper, and until the tutor can look at that
 * page it can neither help with it nor record that it was done.
 *
 * It is off until Atticus turns it on, it shows him the picture while it is on
 * so he can always see what is being looked at, and it stops with the session.
 * Frames are taken only when a tool or a submission asks for one; nothing is
 * streamed anywhere continuously.
 *
 * When the camera cannot open, the reason is kept here so every Camera button
 * can print it. A button that does nothing when pressed is indistinguishable
 * from a broken one, and the browser's own explanation lives in a console
 * nobody at the desk is reading.
 */

export interface CameraState {
  /** A live video track is open. */
  active: boolean;
  /** The browser has been asked and has not answered yet. */
  starting: boolean;
  /** Why the last attempt to open the camera failed, in plain words. */
  error: string | null;
}

/**
 * How long the permission prompt may sit unanswered. Long enough to find the
 * prompt and read it; short enough that an ignored one does not leave the
 * button stuck on "Opening…" for the rest of the lesson.
 */
const PERMISSION_TIMEOUT_MS = 30_000;

/** How long to wait for the first frame before giving up on a capture. */
const FIRST_FRAME_TIMEOUT_MS = 3_000;

/**
 * The rear camera where there is one, since the subject is a page on a desk.
 * A laptop has only the front camera and `ideal` falls back to it quietly.
 */
const PREFERRED_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 960 },
  },
  audio: false,
};

/**
 * The plainest possible request, tried when the preferred one is refused for
 * any reason other than permission. Some webcam drivers reject a request that
 * names a resolution or a facing mode even when they would happily open with
 * no preferences at all, and a page that cannot be photographed at 1280 wide
 * is still better photographed at whatever the camera offers.
 */
const FALLBACK_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };

/** What to tell Atticus for each way getUserMedia can refuse. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "The browser is blocking the camera for this site. Click the camera icon in the address bar, choose Allow, then press Camera again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found. Check one is plugged in and switched on, then press Camera again.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The camera could not start. Another app may be using it: close video calls and camera apps, then press Camera again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "This camera could not give a usable picture. Try a different camera if there is one.";
    case "TimeoutError":
      return "The browser's camera question went unanswered. Press Camera again and choose Allow when it asks.";
    default:
      return message
        ? `The camera could not open: ${message}`
        : "The camera could not open. Press Camera to try again.";
  }
}

function timeoutError(): Error {
  const error = new Error("Camera permission timed out.");
  error.name = "TimeoutError";
  return error;
}

/** Permission refusals are final for this attempt; anything else is worth one plain retry. */
function worthRetryingPlainly(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return !["NotAllowedError", "PermissionDeniedError", "SecurityError", "NotFoundError", "DevicesNotFoundError", "TimeoutError"].includes(name);
}

export class Camera {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private pending: Promise<void> | null = null;
  private state: CameraState = { active: false, starting: false, error: null };
  private readonly listeners = new Set<(state: CameraState) => void>();

  get active(): boolean {
    return Boolean(this.stream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  static get supported(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  /** The live stream, for a preview element. Null while the camera is off. */
  get preview(): MediaStream | null {
    return this.stream;
  }

  /** Why the last attempt failed, or null once one succeeds or a new one begins. */
  get error(): string | null {
    return this.state.error;
  }

  onChange(listener: (state: CameraState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** For useSyncExternalStore: the same object until something changes. */
  getSnapshot = (): CameraState => this.state;

  subscribe = (listener: () => void) => this.onChange(listener);

  private setState(patch: Partial<CameraState>) {
    const next = { ...this.state, ...patch, active: this.active };
    if (
      next.active === this.state.active &&
      next.starting === this.state.starting &&
      next.error === this.state.error
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  private notify() {
    this.setState({});
  }

  /**
   * Open the camera, or explain why it could not be opened.
   *
   * Rejects with the browser's own error after recording a readable version of
   * it in `error`, so a caller may ignore the rejection and let the panels show
   * the message. Pressing the button twice shares one request.
   */
  start(): Promise<void> {
    if (this.active) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.open().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async open(): Promise<void> {
    this.setState({ starting: true, error: null });
    try {
      if (!Camera.supported) {
        throw new Error("This browser cannot open a camera.");
      }
      if (!window.isSecureContext) {
        throw new Error("Camera access requires HTTPS or localhost.");
      }
      const stream = await this.request();
      this.stream = stream;
      stream.getVideoTracks().forEach((track) => {
        // Unplugging the camera, or another app taking it over, ends the track
        // without a word from us; the panel must close rather than show a frozen frame.
        track.addEventListener("ended", () => this.stop());
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.video = video;
      // Playback starting is not what makes the camera "on": the live track is.
      // Some browsers never settle play() on an element outside the document,
      // and the panel waiting on that would be a camera that never comes up.
      void video.play().catch(() => undefined);
      this.setState({ starting: false, error: null });
    } catch (error) {
      this.setState({ starting: false, error: describeCameraError(error) });
      throw error;
    }
  }

  private async request(): Promise<MediaStream> {
    try {
      return await this.requestWithin(PREFERRED_CONSTRAINTS);
    } catch (error) {
      if (!worthRetryingPlainly(error)) throw error;
      return this.requestWithin(FALLBACK_CONSTRAINTS);
    }
  }

  /** getUserMedia with a deadline on the permission prompt; a late answer is released. */
  private requestWithin(constraints: MediaStreamConstraints): Promise<MediaStream> {
    let timedOut = false;
    let timer = 0;
    const request = navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      if (timedOut) {
        stream.getTracks().forEach((track) => track.stop());
        throw timeoutError();
      }
      return stream;
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = window.setTimeout(() => {
        timedOut = true;
        reject(timeoutError());
      }, PERMISSION_TIMEOUT_MS);
    });
    return Promise.race([request, deadline]).finally(() => window.clearTimeout(timer));
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.notify();
  }

  /** Forget the last failure, for a panel that has shown it and been dismissed. */
  clearError() {
    this.setState({ error: null });
  }

  /**
   * JPEG data URL of the current frame.
   *
   * The default is generous because the subject is handwriting: too small and
   * a pencilled working-out becomes unreadable, which defeats the point.
   */
  async captureFrame(maxWidth = 1280, quality = 0.8): Promise<string | null> {
    const video = this.video;
    if (!this.active || !video) return null;
    if (!video.videoWidth) await firstFrame(video);
    if (!this.active || !video.videoWidth) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }
}

/** Resolve once the video has dimensions, or after a bounded wait without them. */
function firstFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("resize", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, FIRST_FRAME_TIMEOUT_MS);
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("resize", done);
    void video.play().catch(() => undefined);
  });
}

/** One camera for the session, shared by the preview, the tools and submitting. */
export const camera = new Camera();

export function useCamera(): CameraState {
  return useSyncExternalStore(camera.subscribe, camera.getSnapshot);
}
