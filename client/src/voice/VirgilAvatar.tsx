import { useEffect, useId, useMemo, type RefObject } from "react";
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

/**
 * Virgil, drawn as a rigged vector character so her face can actually move with
 * her voice: the mouth opens on the live audio envelope, the eyes blink, the
 * brows lift when she is listening, and she breathes. Everything is authored in
 * SVG rather than composited from a bitmap, which keeps her crisp at any size
 * and lets each feature be animated independently.
 */
/** Warm, muted palette matched to the studio's sage-and-cream surfaces. */
const INK = {
  skin: "#e8b791",
  skinShade: "#d89f74",
  skinDeep: "#c2885f",
  hair: "#2e2925",
  hairLift: "#453c33",
  blouse: "#2f4a37",
  blouseShade: "#243a2b",
  collar: "#3b5a44",
  glasses: "#a98a5d",
  lip: "#c47a68",
  lipDark: "#a85d4d",
  mouthIn: "#6d3a34",
  tooth: "#fbf7ef",
  eyeWhite: "#fdfaf4",
  iris: "#4a6b52",
  pupil: "#241f1c",
  brow: "#2e2925",
  blush: "#e5a98c",
};

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

  // Raw audio envelope, smoothed just enough to look like muscle rather than a meter.
  const signal = useMotionValue(0);
  const energy = useSpring(signal, { stiffness: 620, damping: 34, mass: 0.32 });

  const speaking = state === "speaking";
  const listening = state === "listening";

  // Jaw drop and lip spread. A real mouth widens a little as it opens, and the
  // lower lip travels further than the upper one.
  const mouthOpen = useTransform(energy, [0, 1], [0.06, 1]);
  const mouthHeight = useTransform(mouthOpen, (v) => 1.6 + v * 10.5);
  const mouthWidth = useTransform(mouthOpen, (v) => 13 - v * 2.4);
  const jawDrop = useTransform(mouthOpen, (v) => v * 3.4);
  const toothOpacity = useTransform(mouthOpen, [0.28, 0.62], [0, 0.9]);
  const lipPress = useTransform(mouthOpen, [0, 0.25], [1, 0.55]);

  // The whole head lifts fractionally on louder syllables; it reads as emphasis.
  const headLift = useTransform(energy, [0, 1], [0, -1.6]);
  const auraScale = useTransform(energy, [0, 1], [1, 1.06]);
  const auraOpacity = useTransform(energy, [0, 1], [0.1, 0.42]);

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
        if (samples.length !== source.fftSize) samples = new Uint8Array(source.fftSize);
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

  // Blinks land at irregular intervals; an exactly periodic blink looks robotic.
  const blink = useMemo(
    () =>
      reduced
        ? null
        : {
            animate: { scaleY: [1, 1, 0.08, 1, 1, 1, 0.08, 1] },
            transition: {
              duration: 7.4,
              times: [0, 0.32, 0.345, 0.37, 0.7, 0.86, 0.885, 0.91],
              repeat: Infinity,
            },
          },
    [reduced],
  );

  return (
    <div className={`virgil-avatar avatar-${state}`} data-testid="virgil-avatar" aria-hidden="true">
      <svg viewBox="0 0 200 200" fill="none" role="presentation">
        <defs>
          <radialGradient id={`halo-${id}`} cx=".5" cy=".45" r=".55">
            <stop offset=".55" stopColor="#cfdcc0" stopOpacity="0" />
            <stop offset="1" stopColor="#8fa77c" stopOpacity=".55" />
          </radialGradient>
          <linearGradient id={`cloth-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={INK.collar} />
            <stop offset="1" stopColor={INK.blouseShade} />
          </linearGradient>
          <clipPath id={`face-${id}`}>
            <ellipse cx="100" cy="92" rx="35" ry="41" />
          </clipPath>
          <clipPath id={`bust-${id}`}>
            <circle cx="100" cy="100" r="78" />
          </clipPath>
        </defs>

        {/* Speech halo: the only element that reacts at full amplitude, so the
            face itself can stay calm and human. */}
        <motion.circle
          cx="100"
          cy="100"
          r="80"
          fill={`url(#halo-${id})`}
          style={{ scale: auraScale, opacity: auraOpacity, transformOrigin: "100px 100px" }}
        />
        <circle cx="100" cy="100" r="76" stroke="#c3cfb4" strokeWidth=".8" opacity=".7" />

        <g clipPath={`url(#bust-${id})`}>
          <circle cx="100" cy="100" r="76" fill="#f6f2e8" />

          {/* Shoulders and blouse */}
          <motion.g
            animate={reduced ? undefined : { y: [0, -1.1, 0] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <path
              d="M44 182c2-27 22-41 56-41s54 14 56 41z"
              fill={`url(#cloth-${id})`}
            />
            <path d="M84 143l16 19 16-19-7-4-9 10-9-10z" fill="#f3efe4" opacity=".92" />
            <path d="M84 143l16 19-3 6-19-21z" fill={INK.blouse} />
            <path d="M116 143l-16 19 3 6 19-21z" fill={INK.blouse} />
            <circle cx="100" cy="176" r="2.1" fill="#8fa77c" opacity=".8" />
          </motion.g>

          {/* Head, with a slow breathing drift plus a lift on loud syllables */}
          <motion.g
            style={{ y: headLift }}
            animate={reduced ? undefined : { rotate: [-0.9, 0.9, -0.9], y: [0, -0.8, 0] }}
            transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Hair behind the face */}
            <path
              d="M58 92c0-30 18-49 42-49s42 19 42 49c0 13-2 22-5 27 1-12 0-22-4-27-6 7-20 10-33 10s-27-3-33-10c-4 5-5 15-4 27-3-5-5-14-5-27z"
              fill={INK.hair}
            />
            {/* Curls read better as many small overlapping shapes around the
                silhouette than as a few large ones, which look like a helmet. */}
            {[
              [64, 80, 7], [62, 90, 6.4], [66, 70, 7], [72, 61, 7.2], [80, 54, 7],
              [90, 50, 7.2], [100, 48, 7.4], [110, 50, 7.2], [120, 54, 7],
              [128, 61, 7.2], [134, 70, 7], [138, 80, 7], [136, 90, 6.4],
              [70, 52, 5.6], [130, 52, 5.6], [86, 46, 5.4], [114, 46, 5.4],
            ].map(([cx, cy, r], index) => (
              <circle key={index} cx={cx} cy={cy} r={r} fill={INK.hair} />
            ))}

            {/* Neck */}
            <path d="M88 118h24v22c0 6-24 6-24 0z" fill={INK.skinShade} />

            {/* Face */}
            <ellipse cx="100" cy="92" rx="35" ry="41" fill={INK.skin} />
            <g clipPath={`url(#face-${id})`}>
              <ellipse cx="100" cy="150" rx="40" ry="26" fill={INK.skinShade} opacity=".25" />
              <circle cx="76" cy="100" r="8" fill={INK.blush} opacity=".45" />
              <circle cx="124" cy="100" r="8" fill={INK.blush} opacity=".45" />
            </g>

            {/* Curls framing the face */}
            <circle cx="67" cy="99" r="6.6" fill={INK.hair} />
            <circle cx="133" cy="99" r="6.6" fill={INK.hair} />
            <circle cx="70" cy="64" r="5" fill={INK.hairLift} opacity=".55" />
            <circle cx="130" cy="64" r="5" fill={INK.hairLift} opacity=".55" />
            <path d="M65 62c8-13 21-20 35-20s27 7 35 20c-9-8-21-12-35-12s-26 4-35 12z" fill={INK.hairLift} opacity=".6" />

            {/* Brows: they lift while she is taking something in */}
            <motion.g
              animate={{ y: listening && !reduced ? -2.2 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <path d="M78 74c4-3 12-3 16-1" stroke={INK.brow} strokeWidth="3" strokeLinecap="round" />
              <path d="M106 73c4-2 12-2 16 1" stroke={INK.brow} strokeWidth="3" strokeLinecap="round" />
            </motion.g>

            {/* Eyes */}
            <motion.g {...(blink ?? {})} style={{ transformOrigin: "86px 86px" }}>
              <ellipse cx="86" cy="86" rx="9" ry="6.4" fill={INK.eyeWhite} />
              <circle cx="87" cy="86" r="4.4" fill={INK.iris} />
              <circle cx="87" cy="86" r="2.1" fill={INK.pupil} />
              <circle cx="85.4" cy="84.4" r="1.3" fill="#ffffff" opacity=".9" />
            </motion.g>
            <motion.g {...(blink ?? {})} style={{ transformOrigin: "114px 86px" }}>
              <ellipse cx="114" cy="86" rx="9" ry="6.4" fill={INK.eyeWhite} />
              <circle cx="113" cy="86" r="4.4" fill={INK.iris} />
              <circle cx="113" cy="86" r="2.1" fill={INK.pupil} />
              <circle cx="111.4" cy="84.4" r="1.3" fill="#ffffff" opacity=".9" />
            </motion.g>

            {/* Glasses */}
            <g stroke={INK.glasses} strokeWidth="2" fill="none" opacity=".95">
              <circle cx="86" cy="86" r="13.5" />
              <circle cx="114" cy="86" r="13.5" />
              <path d="M99.5 85.5h1" strokeWidth="2.4" />
              <path d="M72.5 84l-8 2M127.5 84l8 2" strokeLinecap="round" />
            </g>

            {/* Nose */}
            <path d="M100 92v8c0 2-2 3-4 3.4" stroke={INK.skinDeep} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".75" />

            {/* Mouth: the piece that actually carries the speech */}
            <motion.g style={{ y: jawDrop }}>
              <motion.ellipse
                cx="100"
                cy="113"
                style={{ rx: mouthWidth, ry: mouthHeight }}
                fill={INK.mouthIn}
              />
              {/* Upper teeth appear once the mouth is properly open */}
              <motion.path
                d="M92 109h16v3a8 3 0 0 1-16 0z"
                fill={INK.tooth}
                style={{ opacity: toothOpacity }}
              />
              {/* Lips close over the opening when she is quiet */}
              <motion.path
                d="M87 112c5-4 21-4 26 0-5 5-21 5-26 0z"
                fill={INK.lip}
                style={{ opacity: lipPress }}
              />
              <motion.path
                d="M87 112c5-2 21-2 26 0"
                stroke={INK.lipDark}
                strokeWidth="1.3"
                strokeLinecap="round"
                fill="none"
                style={{ opacity: lipPress }}
              />
            </motion.g>
          </motion.g>
        </g>

        {state === "connecting" && (
          <motion.circle
            cx="100"
            cy="100"
            r="80"
            stroke="#667e59"
            strokeWidth="2.4"
            strokeDasharray="16 487"
            strokeLinecap="round"
            animate={{ rotate: reduced ? 0 : 360 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "100px 100px" }}
          />
        )}
        {state === "muted" && (
          <g transform="translate(150 150)">
            <circle r="17" fill="#f6f2e8" stroke="#c2452b" strokeWidth="2" />
            <path d="M-6-7v6a6 6 0 0 0 12 0v-6a6 6 0 0 0-12 0z" fill="#c2452b" />
            <path d="M-10-11l20 22" stroke="#c2452b" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        )}
        {speaking && !reduced && (
          <motion.circle
            cx="100"
            cy="100"
            r="79"
            stroke="#8fa77c"
            strokeWidth="1.4"
            animate={{ opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    </div>
  );
}
