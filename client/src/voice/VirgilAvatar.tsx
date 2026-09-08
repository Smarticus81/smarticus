import { useEffect, useId, type RefObject } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { speechEnergy } from "./speechSignal";

export type AvatarState =
  "idle" | "connecting" | "listening" | "speaking" | "muted" | "error";
export function VirgilAvatar({
  state,
  analyser,
  active = false,
}: {
  state: AvatarState;
  analyser?: RefObject<AnalyserNode | null>;
  active?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const signal = useMotionValue(0);
  const energy = useSpring(signal, { stiffness: 950, damping: 52, mass: 0.4 });
  const mouthHeight = useTransform(energy, [0, 1], [1.6, 12]);
  const mouthWidth = useTransform(energy, [0, 1], [7, 12]);
  const auraScale = useTransform(energy, [0, 1], [1, 1.09]);
  const auraOpacity = useTransform(energy, [0, 1], [0.14, 0.5]);
  useEffect(() => {
    if (!active || reduced) {
      signal.set(0);
      return;
    }
    let frame = 0;
    let samples = new Uint8Array(0);
    const sample = () => {
      const source = analyser?.current;
      if (source && !document.hidden) {
        if (samples.length !== source.fftSize)
          samples = new Uint8Array(source.fftSize);
        source.getByteTimeDomainData(samples);
        signal.set(speechEnergy(samples));
      } else signal.set(0);
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(frame);
      signal.set(0);
    };
  }, [active, analyser, reduced, signal]);
  return (
    <div
      className={`virgil-avatar avatar-${state}`}
      data-testid="virgil-avatar"
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" fill="none">
        <defs>
          <radialGradient id={`orb-${id}`} cx=".33" cy=".24" r=".9">
            <stop stopColor="#f4f4da" />
            <stop offset=".55" stopColor="#d5dfb3" />
            <stop offset="1" stopColor="#a4b78f" />
          </radialGradient>
        </defs>
        <motion.circle
          cx="100"
          cy="100"
          r="83"
          stroke="#82986b"
          strokeWidth="1"
          style={{
            scale: auraScale,
            opacity: auraOpacity,
            transformOrigin: "100px 100px",
          }}
        />
        <circle cx="100" cy="100" r="73" stroke="#c7d1b8" strokeWidth=".6" />
        <motion.circle
          cx="100"
          cy="100"
          r="65"
          fill={`url(#orb-${id})`}
          animate={{ opacity: state === "muted" ? 0.58 : 1 }}
        />
        <motion.g
          animate={{
            scaleY: !reduced && state === "idle" ? [1, 1, 0.12, 1] : 1,
          }}
          transition={{
            duration: 5,
            times: [0, 0.94, 0.96, 1],
            repeat: Infinity,
          }}
          style={{ transformOrigin: "100px 92px" }}
        >
          <rect x="77" y="82" width="7" height="14" rx="3.5" fill="#3b503e" />
          <rect x="116" y="82" width="7" height="14" rx="3.5" fill="#3b503e" />
        </motion.g>
        <motion.ellipse
          data-testid="virgil-mouth"
          cx="100"
          cy="114"
          rx={mouthWidth}
          ry={mouthHeight}
          fill="#3b503e"
        />
        <circle cx="71" cy="107" r="6" fill="#b8ca9d" opacity=".4" />
        <circle cx="129" cy="107" r="6" fill="#b8ca9d" opacity=".4" />
        {state === "connecting" && (
          <motion.circle
            cx="100"
            cy="100"
            r="83"
            stroke="#667e59"
            strokeWidth="2"
            strokeDasharray="14 510"
            animate={{ rotate: reduced ? 0 : 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "100px 100px" }}
          />
        )}
      </svg>
    </div>
  );
}
