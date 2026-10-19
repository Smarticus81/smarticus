import { useEffect, useRef, useState } from "react";
import { camera } from "../voice/camera";

/** A live preview only. School paper never enters the archive's photo/submission store. */
export function SchoolCameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const play = () => {
    const video = videoRef.current;
    if (video) void video.play().then(() => setPlaybackFailed(false)).catch(() => setPlaybackFailed(true));
  };
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = camera.preview;
    play();
    return () => { video.srcObject = null; };
  }, []);
  return <section className="school-camera-preview" aria-label="Schoolwork camera">
    <div><h3>Your paper, in view</h3><button className="text-button" onClick={() => camera.stop()}>Close camera</button></div>
    <video ref={videoRef} muted playsInline aria-label="What your camera can see" />
    {playbackFailed && <p role="alert">The camera preview couldn’t play. <button className="text-button" onClick={play}>Try preview again</button></p>}
    <p>Hold up your page and ask Virgil to explain it. This preview doesn’t save or submit a photo.</p>
  </section>;
}
