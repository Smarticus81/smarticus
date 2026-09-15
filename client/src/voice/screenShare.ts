/**
 * Optional screen sharing so the tutor's vision model can see exactly what the
 * learner sees. Frames are captured only when a tool asks for one.
 */
export class ScreenShare {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private listeners = new Set<(active: boolean) => void>();

  get active(): boolean {
    return Boolean(this.stream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  static get supported(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
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
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5 },
      audio: false,
      // Chrome hints: prefer the current tab and keep the learner in control.
      ...({ preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "include" } as Record<string, unknown>),
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

  /** JPEG data URL of the current frame, downscaled for the model. */
  async captureFrame(maxWidth = 1280, quality = 0.72): Promise<string | null> {
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
