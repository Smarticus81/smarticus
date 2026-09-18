import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { speechEnergy } from "./speechSignal";
import type { VirgilScene } from "./virgilScene";

export type AvatarState =
  "idle" | "connecting" | "listening" | "speaking" | "muted" | "error";

/**
 * Virgil: a friendly robot scholar rendered in three.js.
 *
 * The scene itself lives in ./virgilScene and is imported dynamically, so the
 * three.js bundle only loads once the avatar is actually on screen. Until it
 * arrives — and on any device without WebGL — the flat face below stands in,
 * so the panel is never empty and never breaks.
 */
export function VirgilAvatar({
  state,
  analyser,
  active = false,
}: {
  state: AvatarState;
  analyser?: RefObject<AnalyserNode | null>;
  active?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<VirgilScene | null>(null);
  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const [live, setLive] = useState(false);
  const reduced = useReducedMotion() ?? false;

  stateRef.current = state;
  activeRef.current = active;

  useEffect(() => {
    sceneRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    let samples = new Uint8Array(0);

    async function start() {
      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!canvas || !host) return;
      // A device without WebGL should still see a face, not a blank square.
      if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) return;

      let scene: VirgilScene;
      try {
        const module = await import("./virgilScene");
        if (disposed) return;
        scene = module.createVirgilScene(canvas, { reducedMotion: reduced });
      } catch (error) {
        console.warn("Virgil's 3D scene could not start; using the flat face.", error);
        return;
      }
      sceneRef.current = scene;
      scene.setState(stateRef.current);
      setLive(true);

      const fit = () => {
        const rect = host.getBoundingClientRect();
        scene.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      };
      fit();
      observer = new ResizeObserver(fit);
      observer.observe(host);

      const loop = (now: number) => {
        frame = requestAnimationFrame(loop);
        let energy = 0;
        const source = analyser?.current;
        if (activeRef.current && source && !document.hidden && !reduced) {
          if (samples.length !== source.fftSize) samples = new Uint8Array(source.fftSize);
          source.getByteTimeDomainData(samples);
          energy = speechEnergy(samples);
        }
        scene.frame(energy, now);
      };
      frame = requestAnimationFrame(loop);
    }

    void start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setLive(false);
    };
  }, [analyser, reduced]);

  return (
    <div
      ref={hostRef}
      className={`virgil-avatar avatar-${state} ${live ? "is-3d" : "is-flat"}`}
      data-testid="virgil-avatar"
      // The scene drops its idle breathing, sway and tassel when this is on.
      // Reflecting it here makes an accessibility promise checkable from
      // outside, which comparing two WebGL frames cannot do.
      data-reduced-motion={reduced}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="virgil-canvas" data-testid="virgil-canvas" />
      {!live && <FlatVirgil state={state} />}
    </div>
  );
}

/** Stand-in face: the same character, flat, for the moment before the scene
 *  loads and for anything that cannot run WebGL. */
function FlatVirgil({ state }: { state: AvatarState }) {
  const resting = state === "muted";
  const glow = state === "error" ? "#ffcf8a" : "#8fe3ff";
  return (
    <svg className="virgil-flat" viewBox="0 0 200 200" fill="none" role="presentation">
      <rect x="18" y="52" width="164" height="132" rx="42" fill="#f4f6fa" />
      <rect x="38" y="74" width="124" height="94" rx="30" fill="#151d36" />
      <path d="M46 34h108l-54 26z" fill="#1b2340" />
      <rect x="40" y="26" width="120" height="12" rx="4" fill="#1b2340" />
      <circle cx="160" cy="44" r="5" fill="#f5b843" />
      {resting ? (
        <>
          <path d="M70 116c6 6 14 6 20 0" stroke={glow} strokeWidth="6" strokeLinecap="round" />
          <path d="M110 116c6 6 14 6 20 0" stroke={glow} strokeWidth="6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M70 118c6-10 14-10 20 0" stroke={glow} strokeWidth="6" strokeLinecap="round" />
          <path d="M110 118c6-10 14-10 20 0" stroke={glow} strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      <path d="M90 140c5 7 15 7 20 0" stroke={glow} strokeWidth="5" strokeLinecap="round" />
      <circle cx="26" cy="120" r="11" fill="#f4f6fa" />
      <circle cx="174" cy="120" r="11" fill="#f4f6fa" />
      <circle cx="26" cy="120" r="6" fill={glow} opacity=".85" />
      <circle cx="174" cy="120" r="6" fill={glow} opacity=".85" />
    </svg>
  );
}
