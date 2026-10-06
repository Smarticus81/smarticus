/**
 * Optional screen sharing so the tutor's vision model can see exactly what the
 * learner sees. Frames are captured only when a tool asks for one.
 *
 * What the picker offers matters more than anything else here. The Monday
 * builder lesson happens in Blender, a desktop program outside the browser,
 * and the tutor can only see it if the learner is allowed to share his whole
 * screen or that window. So the request names no preferred surface and leaves
 * the choice to him; the surface he picked is reported so the tutor knows
 * whether other programs can be in the picture at all.
 */

/** What getDisplayMedia is capturing, as the browser reports it. */
export type ShareSurface = "monitor" | "window" | "browser" | "unknown";

/** How long to wait for the first frame before giving up on a capture. */
const FIRST_FRAME_TIMEOUT_MS = 3_000;

/**
 * Capture width for the model. A whole screen holds far smaller text than a
 * browser tab (a Blender panel's numbers, a menu entry), so it gets more
 * pixels; a tab shows large lesson text and needs fewer.
 */
const CAPTURE_WIDTH: Record<ShareSurface, number> = {
  monitor: 1600,
  window: 1600,
  browser: 1280,
  unknown: 1280,
};

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

  /** Which surface is shared right now; "unknown" when the browser does not say. */
  get surface(): ShareSurface {
    const track = this.stream?.getVideoTracks().find((entry) => entry.readyState === "live");
    if (!track) return "unknown";
    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    switch (settings.displaySurface) {
      case "monitor":
      case "window":
      case "browser":
        return settings.displaySurface;
      default:
        return "unknown";
    }
  }

  /** One line on what the picture can contain, for the tutor and the panel. */
  static describeSurface(surface: ShareSurface): string {
    switch (surface) {
      case "monitor":
        return "his whole screen, so Blender or any other open program is in the picture";
      case "window":
        return "one program window, which is the only thing in the picture";
      case "browser":
        return "only this browser tab, so Blender and other programs are not in the picture";
      default:
        return "his screen";
    }
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
      // Chrome hints. No preferCurrentTab: that narrows the picker to this
      // tab alone, and a desktop program can then never be shown. The learner
      // stays in control: this tab stays on offer, every kind of screen is on
      // offer, and he can switch what is shared from the browser's own bar.
      ...({
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      } as Record<string, unknown>),
    });
    this.stream = stream;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.video = video;
    // The live track is what makes the share "on", not playback of an element
    // outside the document, which some browsers never report as started.
    void video.play().catch(() => undefined);
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
  async captureFrame(maxWidth = CAPTURE_WIDTH[this.surface], quality = 0.72): Promise<string | null> {
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
