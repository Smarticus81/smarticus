import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { camera } from "./camera";
import { lessonWork, useLessonWork } from "./workStore";

/**
 * The camera, shown as a surface beside the whiteboard.
 *
 * Whatever the camera can see, Atticus can see too, at the same size, for as
 * long as it is on. A tutor that can look at his page without him watching the
 * same picture would be a different and worse thing, so the preview is not
 * optional and there is always a Close button next to it.
 */
export function CameraView({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const work = useLessonWork();
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const stream = camera.preview;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, []);

  async function handInPaper() {
    setError(null);
    setCaptured(false);
    const photo = await camera.captureFrame();
    if (!photo) {
      setError("The camera did not give a picture. Check it is still on, then try again.");
      return;
    }
    setCaptured(true);
    try {
      await lessonWork.submit({ mode: "paper", photos: [photo] });
    } catch {
      // The store holds the message and the panel prints it below.
    }
  }

  return (
    <section className="camera-panel" data-testid="camera">
      <div className="camera-top">
        <div>
          <span className="eyebrow">CAMERA</span>
          <p>Hold your page up so the whole thing is in the picture.</p>
        </div>
        <button className="text-button" onClick={onClose}>
          Close camera
        </button>
      </div>
      <video
        ref={videoRef}
        className="camera-frame"
        data-testid="camera-frame"
        muted
        playsInline
        aria-label="What your camera can see"
      />
      <div className="camera-actions">
        <button
          className="button dark"
          onClick={() => void handInPaper()}
          disabled={work.submitting}
        >
          <Icon name="check" size={16} />
          {work.submitting ? "Handing in…" : "Hand in this page"}
        </button>
        <small>Virgil can look through this camera while it is on.</small>
      </div>
      {captured && !work.error && !work.submitting && work.last?.mode === "paper" && (
        <p className="camera-status" role="status">
          That page is in. You can photograph another one if there is more.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {work.error && (
        <p className="inline-error" role="alert">
          {work.error}
        </p>
      )}
    </section>
  );
}
