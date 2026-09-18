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
 */
export class Camera {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private readonly listeners = new Set<(active: boolean) => void>();

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

  onChange(listener: (active: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const active = this.active;
    for (const listener of this.listeners) listener(active);
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (!Camera.supported) {
      throw new Error("This browser cannot open a camera.");
    }
    if (!window.isSecureContext) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }
    // The rear camera where there is one, since the subject is a page on a desk.
    // A laptop has only the front camera and `ideal` falls back to it quietly.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    this.stream = stream;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    this.video = video;
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => this.stop());
    });
    this.notify();
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

  /**
   * JPEG data URL of the current frame.
   *
   * The default is generous because the subject is handwriting: too small and
   * a pencilled working-out becomes unreadable, which defeats the point.
   */
  async captureFrame(maxWidth = 1280, quality = 0.8): Promise<string | null> {
    const video = this.video;
    if (!this.active || !video || !video.videoWidth) return null;
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

/** One camera for the session, shared by the preview, the tools and submitting. */
export const camera = new Camera();
