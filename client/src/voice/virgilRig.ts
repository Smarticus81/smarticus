/**
 * Virgil's drawn body: writes each frame's pose into the SVG in VirgilAvatar.tsx.
 *
 * The animation itself lives in virgilAnimator; this module only knows where
 * the parts are (by `data-part` name) and how a pose maps onto their
 * transforms. It is the body used when WebGL is unavailable, and the one the
 * drawing was designed on, so its pivots are the reference for the 3D scene.
 */
import {
  clamp,
  createVirgilAnimator,
  mouthPath,
  type Gesture,
  type VirgilPose,
  type VirgilState,
} from "./virgilAnimator";

export type { ArmPose, Expression, Gesture, VirgilPose, VirgilState } from "./virgilAnimator";
export {
  ARM_CHEER,
  ARM_REST,
  ARM_SHRUG,
  ARM_THINK,
  ARM_WAVE,
  clamp,
  expressionFor,
  mouthForSpeech,
  mouthPath,
  nextBlinkDelay,
  nextSaccade,
} from "./virgilAnimator";

/** The eye's travel in px for a gaze of 1. */
const PUPIL_TRAVEL_X = 11;
const PUPIL_TRAVEL_Y = 8;
/** The upper lid travels this far to close the eye. */
const LID_TRAVEL = 64;

/** Pivots in the drawing, matching VirgilAvatar.tsx. */
export const PIVOT = {
  head: { x: 160, y: 212 },
  eyeLeft: { x: 122, y: 124 },
  eyeRight: { x: 198, y: 124 },
  browLeft: { x: 122, y: 82 },
  browRight: { x: 198, y: 82 },
  armLeft: { x: 108, y: 196 },
  armRight: { x: 212, y: 196 },
  hair: { x: 160, y: 60 },
  tassel: { x: 236, y: 44 },
  mouth: { x: 160, y: 174 },
  feet: { x: 160, y: 300 },
};

export interface VirgilRig {
  /** Advance one frame with the current audio envelope (0…1). */
  frame(energy: number, now: number): VirgilPose;
  setState(state: VirgilState): void;
  /** Where the pointer is relative to the face, -1…1 on each axis, or null when away. */
  setPointer(x: number | null, y: number | null): void;
  /** Play a short performance over the current expression. */
  gesture(name: Gesture): void;
  dispose(): void;
}

/** Bind the animation to an SVG drawn with the expected `data-part` names. */
export function createVirgilRig(svg: SVGSVGElement, options: { reducedMotion?: boolean } = {}): VirgilRig {
  const animator = createVirgilAnimator(options);
  const part = (name: string): SVGElement | null => svg.querySelector<SVGElement>(`[data-part="${name}"]`);
  const parts = {
    figure: part("figure"),
    body: part("body"),
    head: part("head"),
    hair: part("hair"),
    tassel: part("tassel"),
    browLeft: part("brow-left"),
    browRight: part("brow-right"),
    pupilLeft: part("pupil-left"),
    pupilRight: part("pupil-right"),
    lidLeft: part("lid-left"),
    lidRight: part("lid-right"),
    squintLeft: part("squint-left"),
    squintRight: part("squint-right"),
    closedLeft: part("closed-left"),
    closedRight: part("closed-right"),
    glintLeft: part("glint-left"),
    glintRight: part("glint-right"),
    mouth: part("mouth"),
    teeth: part("teeth"),
    tongue: part("tongue"),
    blushLeft: part("blush-left"),
    blushRight: part("blush-right"),
    armLeft: part("arm-left"),
    armRight: part("arm-right"),
    thought: part("thought"),
    thoughtDots: Array.from(svg.querySelectorAll<SVGElement>('[data-part="thought-dot"]')),
    sweat: part("sweat"),
    rippleLeft: part("ripple-left"),
    rippleRight: part("ripple-right"),
  };

  function apply(pose: VirgilPose) {
    if (parts.mouth) parts.mouth.setAttribute("d", mouthPath(PIVOT.mouth.x, PIVOT.mouth.y, pose.mouthOpen, pose.smile, pose.mouthWidth));
    if (parts.teeth) parts.teeth.style.opacity = String(clamp((pose.mouthOpen - 0.18) * 4, 0, 1));
    if (parts.tongue) parts.tongue.style.opacity = String(clamp((pose.mouthOpen - 0.4) * 3, 0, 1));

    const lidShift = (1 - Math.min(pose.lidOpen, 1)) * LID_TRAVEL;
    parts.lidLeft?.setAttribute("transform", `translate(0 ${lidShift.toFixed(1)})`);
    parts.lidRight?.setAttribute("transform", `translate(0 ${lidShift.toFixed(1)})`);
    const closedLine = pose.closedLine.toFixed(3);
    if (parts.closedLeft) parts.closedLeft.style.opacity = closedLine;
    if (parts.closedRight) parts.closedRight.style.opacity = closedLine;
    parts.squintLeft?.setAttribute("transform", `translate(0 ${(-pose.squintLift).toFixed(1)})`);
    parts.squintRight?.setAttribute("transform", `translate(0 ${(-pose.squintLift).toFixed(1)})`);

    const pupilTransform = (eye: { x: number; y: number }) =>
      `translate(${(pose.gazeX * PUPIL_TRAVEL_X).toFixed(1)} ${(pose.gazeY * PUPIL_TRAVEL_Y).toFixed(1)}) ` +
      `translate(${eye.x} ${eye.y}) scale(${pose.pupil.toFixed(3)}) translate(${-eye.x} ${-eye.y})`;
    parts.pupilLeft?.setAttribute("transform", pupilTransform(PIVOT.eyeLeft));
    parts.pupilRight?.setAttribute("transform", pupilTransform(PIVOT.eyeRight));

    parts.browLeft?.setAttribute(
      "transform",
      `translate(0 ${pose.browLeftY.toFixed(1)}) rotate(${pose.browLeftRot.toFixed(1)} ${PIVOT.browLeft.x} ${PIVOT.browLeft.y})`,
    );
    parts.browRight?.setAttribute(
      "transform",
      `translate(0 ${pose.browRightY.toFixed(1)}) rotate(${pose.browRightRot.toFixed(1)} ${PIVOT.browRight.x} ${PIVOT.browRight.y})`,
    );

    // A flat drawing cannot turn its head; the turn becomes a small slide.
    parts.head?.setAttribute(
      "transform",
      `translate(${(pose.headX + pose.turnX * 3).toFixed(1)} ${(pose.headY + pose.turnY * 2).toFixed(1)}) rotate(${pose.tilt.toFixed(2)} ${PIVOT.head.x} ${PIVOT.head.y})`,
    );
    parts.body?.setAttribute(
      "transform",
      `translate(0 ${PIVOT.feet.y}) scale(${(1 / pose.breath).toFixed(4)} ${pose.breath.toFixed(4)}) translate(0 ${-PIVOT.feet.y})`,
    );
    parts.hair?.setAttribute("transform", `rotate(${pose.hairSwing.toFixed(2)} ${PIVOT.hair.x} ${PIVOT.hair.y})`);
    parts.tassel?.setAttribute("transform", `rotate(${pose.tasselSwing.toFixed(2)} ${PIVOT.tassel.x} ${PIVOT.tassel.y})`);

    parts.armLeft?.setAttribute("transform", armTransform(pose.armLeft, pose.stretchLeft, PIVOT.armLeft));
    parts.armRight?.setAttribute("transform", armTransform(pose.armRight, pose.stretchRight, PIVOT.armRight));

    const s = pose.squash;
    parts.figure?.setAttribute(
      "transform",
      `translate(${PIVOT.feet.x} ${PIVOT.feet.y}) scale(${(1 - s * 0.6).toFixed(4)} ${(1 + s).toFixed(4)}) translate(${-PIVOT.feet.x} ${-PIVOT.feet.y})`,
    );

    if (parts.blushLeft) parts.blushLeft.style.opacity = pose.blush.toFixed(3);
    if (parts.blushRight) parts.blushRight.style.opacity = pose.blush.toFixed(3);
    if (parts.thought) parts.thought.style.opacity = pose.thought.toFixed(3);
    parts.thoughtDots.forEach((dot, index) => {
      const cx = dot.getAttribute("cx") ?? "0";
      const cy = dot.getAttribute("cy") ?? "0";
      const pulse = pose.thoughtPulse[index] ?? 1;
      dot.setAttribute("transform", `translate(${cx} ${cy}) scale(${pulse.toFixed(3)}) translate(${-Number(cx)} ${-Number(cy)})`);
    });
    if (parts.sweat) {
      parts.sweat.style.opacity = pose.sweat.toFixed(3);
      parts.sweat.setAttribute("transform", `translate(0 ${pose.sweatDrip.toFixed(1)})`);
    }
    for (const glint of [parts.glintLeft, parts.glintRight]) {
      if (!glint) continue;
      glint.setAttribute("transform", `translate(${pose.glintX.toFixed(1)} 0)`);
      glint.style.opacity = pose.glintOpacity.toFixed(3);
    }
    for (const [element, side] of [
      [parts.rippleLeft, -1],
      [parts.rippleRight, 1],
    ] as const) {
      if (!element) continue;
      element.style.opacity = pose.ripple.toFixed(3);
      element.setAttribute("transform", `translate(${(side * (pose.rippleScale - 1) * 40).toFixed(1)} 0) scale(${pose.rippleScale.toFixed(3)})`);
    }
  }

  function frame(energy: number, now: number): VirgilPose {
    const pose = animator.frame(energy, now);
    apply(pose);
    return pose;
  }

  // First frame at rest so nothing flashes before the loop starts.
  frame(0, 0);

  return {
    frame,
    setState: animator.setState,
    setPointer: animator.setPointer,
    gesture: animator.gesture,
    dispose() {
      animator.setPointer(null, null);
    },
  };
}

/** Rotate about the shoulder, after lengthening the arm along itself. */
function armTransform(degrees: number, stretch: number, pivot: { x: number; y: number }): string {
  return (
    `rotate(${degrees.toFixed(1)} ${pivot.x} ${pivot.y}) ` +
    `translate(${pivot.x} ${pivot.y}) scale(1 ${stretch.toFixed(3)}) translate(${-pivot.x} ${-pivot.y})`
  );
}
