import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { speechEnergy } from "./speechSignal";
import { createVirgilRig, type VirgilRig, type VirgilState } from "./virgilRig";
import type { Gesture, VirgilPose } from "./virgilAnimator";
import type { VirgilScene } from "./virgilScene";

export type AvatarState = VirgilState;

/** Either body answers to the same calls. */
type Body = {
  frame(energy: number, now: number): VirgilPose;
  setState(state: VirgilState): void;
  setPointer(x: number | null, y: number | null): void;
  gesture(name: Gesture): void;
  dispose(): void;
};

/** Which body to use: the 3D scene when WebGL allows, else the drawing. */
export type AvatarRenderer = "auto" | "3d" | "svg";

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Virgil: a round-headed scholar in big glasses and a hoodie, with a
 * mortarboard he has not quite grown into. Big glossy eyes that blink, wander
 * and follow the pointer, brows that carry the mood, a mouth that opens with
 * the actual audio, hands that wave hello and go to the chin to think.
 *
 * He has two bodies moved by one animator. The drawing below (a layered SVG,
 * flat colour and a bold outline) is on screen at once and stays when WebGL
 * is unavailable; where it is available, the three.js scene in virgilScene
 * loads and takes over, so his head really turns and his eyes really roll.
 * Every part the rig moves carries a `data-part` name. Nothing here
 * re-renders per frame: the bodies write their own transforms.
 */
export function VirgilAvatar({
  state,
  analyser,
  active = false,
  cheerKey,
  renderer = "auto",
}: {
  state: AvatarState;
  analyser?: RefObject<AnalyserNode | null>;
  active?: boolean;
  /** Changes to this value make him cheer: work handed in, a session saved. */
  cheerKey?: string | number | null;
  renderer?: AvatarRenderer;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<Body | null>(null);
  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<"svg" | "3d">("svg");
  const reduced = useReducedMotion() ?? false;
  // Two Virgils can be on one page, so the clip paths get their own ids;
  // kept to plain characters so every browser's url(#…) reads them.
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `virgil${ids}-${name}`;

  stateRef.current = state;
  activeRef.current = active;

  useEffect(() => {
    rigRef.current?.setState(state);
  }, [state]);

  const lastCheerRef = useRef(cheerKey);
  useEffect(() => {
    if (cheerKey === lastCheerRef.current) return;
    lastCheerRef.current = cheerKey;
    if (cheerKey) rigRef.current?.gesture("cheer");
  }, [cheerKey]);

  // Try for the 3D body once; fall back to (or stay with) the drawing.
  useEffect(() => {
    if (renderer === "svg" || mode === "3d") return;
    if (renderer === "auto" && !webglAvailable()) return;
    let cancelled = false;
    void import("./virgilScene")
      .then(() => {
        if (!cancelled) setMode("3d");
      })
      .catch((error) => {
        console.warn("Virgil's 3D scene could not load; keeping the drawing.", error);
      });
    return () => {
      cancelled = true;
    };
  }, [renderer, mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let rig: Body | null = null;
    let scene: VirgilScene | null = null;
    let observer: ResizeObserver | null = null;
    let disposed = false;
    let frame = 0;
    let samples = new Uint8Array(0);

    const run = (body: Body) => {
      if (disposed) return;
      rig = body;
      rigRef.current = body;
      body.setState(stateRef.current);
      setLive(true);
      const loop = (now: number) => {
        frame = requestAnimationFrame(loop);
        let energy = 0;
        const source = analyser?.current;
        if (activeRef.current && source && !document.hidden) {
          if (samples.length !== source.fftSize) samples = new Uint8Array(source.fftSize);
          source.getByteTimeDomainData(samples);
          energy = speechEnergy(samples);
        }
        // The latest pose is left on the element for checks to read.
        (host as HTMLDivElement & { __virgilPose?: VirgilPose }).__virgilPose = body.frame(energy, now);
      };
      frame = requestAnimationFrame(loop);
    };

    if (mode === "3d") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      void import("./virgilScene").then((module) => {
        if (disposed) return;
        try {
          scene = module.createVirgilScene(canvas, { reducedMotion: reduced });
        } catch (error) {
          console.warn("Virgil's 3D scene could not start; using the drawing.", error);
          setMode("svg");
          return;
        }
        const fit = () => {
          const rect = host.getBoundingClientRect();
          scene?.resize(Math.max(1, rect.width), Math.max(1, rect.height));
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(host);
        run(scene);
      });
    } else {
      const svg = svgRef.current;
      if (!svg) return;
      run(createVirgilRig(svg, { reducedMotion: reduced }));
    }

    // His eyes follow the pointer anywhere on the page, the way a person at a
    // desk follows the one they are talking to, and wander again when it goes.
    let pointerTimer = 0;
    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.4;
      const reach = Math.max(rect.width, 240) * 2.2;
      rig?.setPointer((event.clientX - cx) / reach, (event.clientY - cy) / reach);
      window.clearTimeout(pointerTimer);
      pointerTimer = window.setTimeout(() => rig?.setPointer(null, null), 2_800);
    };
    const onLeave = () => rig?.setPointer(null, null);
    if (!reduced) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(pointerTimer);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      observer?.disconnect();
      rig?.dispose();
      rigRef.current = null;
      setLive(false);
    };
  }, [analyser, reduced, mode]);

  const poke = useCallback(() => rigRef.current?.gesture("poke"), []);

  return (
    <div
      ref={hostRef}
      className={`virgil-avatar avatar-${state} ${live ? "is-live" : "is-still"} ${mode === "3d" ? "is-3d" : "is-drawn"}`}
      data-testid="virgil-avatar"
      data-state={state}
      data-renderer={mode}
      // The rig drops breathing, sway, blinks and wandering eyes when this is
      // on. Reflecting it here makes the accessibility promise checkable.
      data-reduced-motion={reduced}
      aria-hidden="true"
      onPointerDown={poke}
    >
      {mode === "3d" && <canvas ref={canvasRef} className="virgil-canvas" data-testid="virgil-canvas" />}
      {mode === "svg" && (
      <svg
        ref={svgRef}
        className="virgil-figure"
        data-testid="virgil-figure"
        viewBox="0 0 320 340"
        role="presentation"
      >
        <defs>
          <clipPath id={id("eye-left")}>
            <circle cx="122" cy="124" r="30" />
          </clipPath>
          <clipPath id={id("eye-right")}>
            <circle cx="198" cy="124" r="30" />
          </clipPath>
          <clipPath id={id("lens-left")}>
            <circle cx="122" cy="124" r="36" />
          </clipPath>
          <clipPath id={id("lens-right")}>
            <circle cx="198" cy="124" r="36" />
          </clipPath>
          <clipPath id={id("mouth")}>
            <path data-part="mouth-clip" d="M 138 174 Q 160 186 182 174 Q 160 188 138 174 Z" />
          </clipPath>
          <clipPath id={id("skull")}>
            <ellipse cx="160" cy="118" rx="100" ry="94" />
          </clipPath>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="160" cy="318" rx="72" ry="9" fill="#151b33" opacity=".14" />

        {/* Sound ripples beside the head while he speaks */}
        <g data-part="ripple-left" style={{ opacity: 0 }} fill="none" stroke="#7fd8ff" strokeWidth="5" strokeLinecap="round">
          <path d="M 40 104 q -12 20 0 40" />
          <path d="M 24 94 q -20 30 0 60" opacity=".55" />
        </g>
        <g data-part="ripple-right" style={{ opacity: 0 }} fill="none" stroke="#7fd8ff" strokeWidth="5" strokeLinecap="round">
          <path d="M 280 104 q 12 20 0 40" />
          <path d="M 296 94 q 20 30 0 60" opacity=".55" />
        </g>

        <g data-part="figure">
          {/* Legs and sneakers */}
          <g data-part="body">
            <rect x="128" y="244" width="26" height="44" rx="12" fill="#27315a" stroke="#151b33" strokeWidth="5" />
            <rect x="166" y="244" width="26" height="44" rx="12" fill="#27315a" stroke="#151b33" strokeWidth="5" />
            <rect x="114" y="280" width="48" height="24" rx="12" fill="#ffffff" stroke="#151b33" strokeWidth="5" />
            <rect x="158" y="280" width="48" height="24" rx="12" fill="#ffffff" stroke="#151b33" strokeWidth="5" />
            <path d="M 118 296 h 40" stroke="#7fd8ff" strokeWidth="5" strokeLinecap="round" />
            <path d="M 162 296 h 40" stroke="#7fd8ff" strokeWidth="5" strokeLinecap="round" />

            {/* Hoodie */}
            <rect x="102" y="178" width="116" height="96" rx="36" fill="#27315a" stroke="#151b33" strokeWidth="5" />
            <rect x="126" y="228" width="68" height="30" rx="13" fill="#1e2748" stroke="#151b33" strokeWidth="4" />
            <ellipse cx="160" cy="186" rx="52" ry="17" fill="#334071" stroke="#151b33" strokeWidth="5" />
            <path d="M 150 200 q -6 18 -4 36" stroke="#f5b843" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M 170 200 q 6 18 4 36" stroke="#f5b843" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="146" cy="238" r="4" fill="#f5b843" />
            <circle cx="174" cy="238" r="4" fill="#f5b843" />
          </g>

          <g data-part="head">
            {/* Ears */}
            <circle cx="62" cy="130" r="15" fill="#a9b4f4" stroke="#151b33" strokeWidth="5" />
            <circle cx="258" cy="130" r="15" fill="#a9b4f4" stroke="#151b33" strokeWidth="5" />

            {/* Skull with a soft shadow along the jaw */}
            <ellipse cx="160" cy="118" rx="100" ry="94" fill="#a9b4f4" stroke="#151b33" strokeWidth="5" />
            <ellipse cx="160" cy="150" rx="100" ry="70" fill="#8f9ce6" clipPath={`url(#${id("skull")})`} opacity=".55" />
            <ellipse cx="160" cy="118" rx="100" ry="94" fill="none" stroke="#151b33" strokeWidth="5" />

            {/* Cheeks */}
            <ellipse data-part="blush-left" cx="96" cy="162" rx="15" ry="8" fill="#ff8fa8" style={{ opacity: 0.3 }} />
            <ellipse data-part="blush-right" cx="224" cy="162" rx="15" ry="8" fill="#ff8fa8" style={{ opacity: 0.3 }} />

            {/* Mouth: the rig rewrites the path every frame */}
            <g>
              <path data-part="mouth" d="M 138 174 Q 160 186 182 174 Q 160 188 138 174 Z" fill="#3a1f2e" stroke="#151b33" strokeWidth="5" strokeLinejoin="round" />
              <g clipPath={`url(#${id("mouth")})`}>
                <rect data-part="teeth" x="130" y="160" width="60" height="12" fill="#ffffff" style={{ opacity: 0 }} />
                <ellipse data-part="tongue" cx="160" cy="206" rx="18" ry="12" fill="#ff7f93" style={{ opacity: 0 }} />
              </g>
            </g>

            {/* Eyes, each clipped to its white */}
            <g clipPath={`url(#${id("eye-left")})`}>
              <circle cx="122" cy="124" r="30" fill="#ffffff" />
              <g data-part="pupil-left">
                <circle cx="122" cy="124" r="15" fill="#2d3f80" />
                <circle cx="122" cy="124" r="10" fill="#151b33" />
                <circle cx="116" cy="117" r="5" fill="#ffffff" />
                <circle cx="128" cy="130" r="2.5" fill="#ffffff" />
              </g>
              <circle data-part="lid-left" cx="122" cy="57" r="34" fill="#a9b4f4" />
              <circle data-part="squint-left" cx="122" cy="190" r="36" fill="#a9b4f4" />
            </g>
            <g clipPath={`url(#${id("eye-right")})`}>
              <circle cx="198" cy="124" r="30" fill="#ffffff" />
              <g data-part="pupil-right">
                <circle cx="198" cy="124" r="15" fill="#2d3f80" />
                <circle cx="198" cy="124" r="10" fill="#151b33" />
                <circle cx="192" cy="117" r="5" fill="#ffffff" />
                <circle cx="204" cy="130" r="2.5" fill="#ffffff" />
              </g>
              <circle data-part="lid-right" cx="198" cy="57" r="34" fill="#a9b4f4" />
              <circle data-part="squint-right" cx="198" cy="190" r="36" fill="#a9b4f4" />
            </g>

            {/* Closed eyes: a soft curved line that appears as the lids shut */}
            <path data-part="closed-left" d="M 100 130 q 22 14 44 0" stroke="#151b33" strokeWidth="6" strokeLinecap="round" fill="none" style={{ opacity: 0 }} />
            <path data-part="closed-right" d="M 176 130 q 22 14 44 0" stroke="#151b33" strokeWidth="6" strokeLinecap="round" fill="none" style={{ opacity: 0 }} />

            {/* Glasses: thick round rims, a bridge, arms to the ears, a glint */}
            <g clipPath={`url(#${id("lens-left")})`}>
              <rect data-part="glint-left" x="92" y="86" width="14" height="80" fill="#ffffff" opacity=".55" transform="rotate(28 122 124)" />
            </g>
            <g clipPath={`url(#${id("lens-right")})`}>
              <rect data-part="glint-right" x="168" y="86" width="14" height="80" fill="#ffffff" opacity=".55" transform="rotate(28 198 124)" />
            </g>
            <circle cx="122" cy="124" r="36" fill="none" stroke="#151b33" strokeWidth="7" />
            <circle cx="198" cy="124" r="36" fill="none" stroke="#151b33" strokeWidth="7" />
            <path d="M 158 118 q 2 -6 4 0" stroke="#151b33" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M 86 118 L 66 124" stroke="#151b33" strokeWidth="6" strokeLinecap="round" />
            <path d="M 234 118 L 254 124" stroke="#151b33" strokeWidth="6" strokeLinecap="round" />

            {/* Brows */}
            <path data-part="brow-left" d="M 96 82 q 24 -16 52 -4" stroke="#151b33" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path data-part="brow-right" d="M 172 78 q 28 -12 52 4" stroke="#151b33" strokeWidth="8" strokeLinecap="round" fill="none" />

            {/* Hair: a side-swept fringe with a stray tuft */}
            <path
              data-part="hair"
              d="M 72 92 C 78 54 112 26 160 26 C 206 26 236 46 246 80 C 230 66 214 60 200 66 C 194 48 180 42 170 50 C 150 36 120 42 110 66 C 96 60 82 72 72 92 Z"
              fill="#1b2340"
              stroke="#151b33"
              strokeWidth="5"
              strokeLinejoin="round"
            />

            {/* Mortarboard, worn at an angle, with a tassel on a spring */}
            <g transform="rotate(-10 212 40)">
              <rect x="196" y="38" width="34" height="18" rx="5" fill="#1b2340" stroke="#151b33" strokeWidth="5" />
              <path d="M 212 8 L 258 30 L 212 52 L 166 30 Z" fill="#27315a" stroke="#151b33" strokeWidth="5" strokeLinejoin="round" />
              <circle cx="212" cy="30" r="3.5" fill="#f5b843" />
            </g>
            <g data-part="tassel">
              <path d="M 236 44 q 10 10 8 34" stroke="#f5b843" strokeWidth="4" strokeLinecap="round" fill="none" />
              <path d="M 238 76 l 12 0 l -4 16 l -6 0 Z" fill="#f5b843" stroke="#d99a2b" strokeWidth="2" strokeLinejoin="round" />
            </g>
          </g>

          {/* Arms in front of the head, so a wave and a hand on the chin both show */}
          <g data-part="arm-right">
            <rect x="210" y="190" width="30" height="58" rx="15" fill="#27315a" stroke="#151b33" strokeWidth="5" />
            <circle cx="225" cy="250" r="14" fill="#a9b4f4" stroke="#151b33" strokeWidth="5" />
          </g>
          <g data-part="arm-left">
            <rect x="80" y="190" width="30" height="58" rx="15" fill="#27315a" stroke="#151b33" strokeWidth="5" />
            <circle cx="95" cy="250" r="14" fill="#a9b4f4" stroke="#151b33" strokeWidth="5" />
          </g>
        </g>

        {/* Thought bubble, while he thinks */}
        <g data-part="thought" style={{ opacity: 0 }} fill="#ffffff" stroke="#151b33" strokeWidth="4">
          <circle data-part="thought-dot" cx="252" cy="98" r="5" />
          <circle data-part="thought-dot" cx="268" cy="80" r="8" />
          <circle data-part="thought-dot" cx="292" cy="54" r="15" />
        </g>

        {/* Sweat drop, when something has gone wrong */}
        <path
          data-part="sweat"
          d="M 254 76 q -10 14 -10 20 a 10 10 0 0 0 20 0 q 0 -6 -10 -20 Z"
          fill="#9fe0ff"
          stroke="#151b33"
          strokeWidth="4"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
      </svg>
      )}
    </div>
  );
}
