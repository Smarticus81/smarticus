/**
 * Virgil's face and body, animated.
 *
 * The character is a layered SVG drawn in VirgilAvatar.tsx; this module moves
 * it. Every frame it blends the current expression toward the one the state
 * asks for, adds the small involuntary things that make a drawing feel alive
 * (breathing, blinking on an irregular clock, eyes that wander and then settle
 * on whoever is talking) and drives the mouth from the real audio envelope,
 * so what Atticus sees is in sync with what he hears rather than a loop that
 * happens to play beside it.
 *
 * The expression tables and shape functions are pure and exported, so the
 * rules of the face can be tested without a browser. Only `createVirgilRig`
 * touches the DOM, and it reaches the parts by `data-part` attributes.
 */

export type VirgilState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

/** A one-off performance layered over the state's expression. */
export type Gesture = "wave" | "nod" | "poke" | "aha" | "cheer";

/** The pose of the arms: rotation in degrees about each shoulder. */
export interface ArmPose {
  left: number;
  right: number;
}

/** Everything about the face that a state decides. Units are SVG px/degrees. */
export interface Expression {
  /** Inner-end lift of each brow (negative is up) and its rotation. */
  browLeftY: number;
  browRightY: number;
  browLeftRot: number;
  browRightRot: number;
  /** 1 fully open, 0 shut. */
  lid: number;
  /** 0 none … 1 cheeks pushed up into a happy squint. */
  squint: number;
  /** Where the pupils rest when nothing else moves them, -1…1 of their travel. */
  gazeX: number;
  gazeY: number;
  /** Pupil size, 1 normal; smaller reads as worry, larger as wonder. */
  pupil: number;
  /** -1 frown … 1 wide smile. */
  smile: number;
  /** Width of the mouth, 1 normal. */
  mouthWidth: number;
  /** Mouth opening when no speech drives it. */
  mouthOpen: number;
  /** Cheek colour, 0…1. */
  blush: number;
  /** Head tilt in degrees (positive leans to his right) and lean down in px. */
  tilt: number;
  lean: number;
  arms: ArmPose;
  /** Thought bubble, sweat drop: 0 hidden … 1 shown. */
  thought: number;
  sweat: number;
}

export const ARM_REST: ArmPose = { left: 0, right: 0 };
/** Left hand to the chin. Worked out from the shoulder pivots in the drawing. */
export const ARM_THINK: ArmPose = { left: -100, right: 0 };
/** Right hand out beside the head; the arm stretches so the hand clears the face. */
export const ARM_WAVE: ArmPose = { left: 0, right: -115 };
export const ARM_CHEER: ArmPose = { left: 110, right: -110 };
export const ARM_SHRUG: ArmPose = { left: 28, right: -28 };

const NEUTRAL: Expression = {
  browLeftY: 0,
  browRightY: 0,
  browLeftRot: 0,
  browRightRot: 0,
  lid: 1,
  squint: 0,
  gazeX: 0,
  gazeY: 0,
  pupil: 1,
  smile: 0.55,
  mouthWidth: 1,
  mouthOpen: 0,
  blush: 0.3,
  tilt: 0,
  lean: 0,
  arms: ARM_REST,
  thought: 0,
  sweat: 0,
};

/** The face each state settles into. */
export function expressionFor(state: VirgilState): Expression {
  switch (state) {
    case "listening":
      // Attentive: brows up, eyes a little wider, head cocked toward him.
      return { ...NEUTRAL, browLeftY: -4, browRightY: -4, lid: 1.06, smile: 0.5, tilt: 7, lean: 3, blush: 0.35 };
    case "thinking":
      // One brow up, eyes off to the side, hand to the chin, bubble above.
      return {
        ...NEUTRAL,
        browLeftY: -7,
        browRightY: 2,
        browLeftRot: -8,
        browRightRot: 4,
        gazeX: 0.65,
        gazeY: -0.6,
        smile: 0.15,
        mouthWidth: 0.7,
        tilt: -6,
        arms: ARM_THINK,
        thought: 1,
        blush: 0.2,
      };
    case "speaking":
      return { ...NEUTRAL, smile: 0.6, blush: 0.35, lean: 1 };
    case "connecting":
      // Bright and expectant, looking for the connection.
      return { ...NEUTRAL, browLeftY: -5, browRightY: -5, lid: 1.04, smile: 0.3, mouthWidth: 0.75, mouthOpen: 0.18, pupil: 1.08 };
    case "muted":
      // Resting: eyes closed, soft smile, nothing to do until he unmutes.
      return { ...NEUTRAL, browLeftY: 2, browRightY: 2, lid: 0.06, smile: 0.45, tilt: 4, blush: 0.25 };
    case "error":
      // Worried, not scared: inner brows up, small pupils, a wobbly mouth.
      return {
        ...NEUTRAL,
        browLeftY: -2,
        browRightY: -2,
        browLeftRot: 14,
        browRightRot: -14,
        lid: 0.92,
        gazeY: 0.25,
        pupil: 0.82,
        smile: -0.55,
        mouthWidth: 0.8,
        blush: 0.15,
        tilt: -4,
        arms: ARM_SHRUG,
        sweat: 1,
      };
    case "idle":
    default:
      return NEUTRAL;
  }
}

/**
 * The mouth as an SVG path, centred on (cx, cy).
 *
 * `open` is 0 for closed, 1 for a wide "ah"; `smile` runs from -1 (frown) to
 * 1 (grin); `width` scales the corners apart. A closed mouth is a thin
 * lens so the same shape serves both the stroke and the fill.
 */
export function mouthPath(cx: number, cy: number, open: number, smile: number, width = 1): string {
  const o = clamp(open, 0, 1);
  const s = clamp(smile, -1, 1);
  const hw = (22 + o * 6) * clamp(width, 0.4, 1.6);
  // Smiling lifts the corners; the lips bow the other way.
  const cornerY = cy - s * 6;
  const upperCtrlY = cornerY + s * 11 - o * 9;
  const lowerCtrlY = cornerY + s * 11 + 2 + o * 30;
  const f = (n: number) => Math.round(n * 10) / 10;
  return (
    `M ${f(cx - hw)} ${f(cornerY)} ` +
    `Q ${f(cx)} ${f(upperCtrlY)} ${f(cx + hw)} ${f(cornerY)} ` +
    `Q ${f(cx)} ${f(lowerCtrlY)} ${f(cx - hw)} ${f(cornerY)} Z`
  );
}

/**
 * How open the mouth is for a given audio envelope, with the shape alternating
 * between round and wide syllables so speech does not look like one flapping
 * jaw. Returns the opening and a width factor.
 */
export function mouthForSpeech(energy: number, t: number): { open: number; width: number } {
  const e = clamp(energy, 0, 1);
  if (e <= 0) return { open: 0, width: 1 };
  // Vowel wobble: fast enough to read as syllables, slow enough not to flicker.
  const vowel = 0.5 + 0.5 * Math.sin(t * 9.7) * Math.sin(t * 2.3);
  return {
    open: Math.min(1, 0.18 + e * 0.95),
    width: 0.72 + vowel * 0.5,
  };
}

/** Seconds until the next blink: irregular, sometimes a quick double. */
export function nextBlinkDelay(random = Math.random): number {
  return random() < 0.12 ? 0.22 : 2.2 + random() * 4.3;
}

/** A new place for wandering eyes to look, and how long before they move on. */
export function nextSaccade(random = Math.random): { x: number; y: number; hold: number } {
  // Mostly small shifts, the odd longer look to one side.
  const far = random() < 0.25;
  const r = far ? 0.75 : 0.35;
  const angle = random() * Math.PI * 2;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.6, hold: 0.8 + random() * 2.4 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/** The eye's travel in px for a gaze of 1. */
const PUPIL_TRAVEL_X = 11;
const PUPIL_TRAVEL_Y = 8;
/** The upper lid travels this far to close the eye. */
const LID_TRAVEL = 64;

/** Pivots in the drawing, matching VirgilAvatar.tsx. */
const PIVOT = {
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
  frame(energy: number, now: number): void;
  setState(state: VirgilState): void;
  /** Where the pointer is relative to the face, -1…1 on each axis, or null when away. */
  setPointer(x: number | null, y: number | null): void;
  /** Play a short performance over the current expression. */
  gesture(name: Gesture): void;
  dispose(): void;
}

interface Spring {
  value: number;
  velocity: number;
}

function springStep(spring: Spring, target: number, stiffness: number, damping: number) {
  spring.velocity += (target - spring.value) * stiffness;
  spring.velocity *= damping;
  spring.value += spring.velocity;
}

/**
 * Bind the animation to an SVG drawn with the expected `data-part` names.
 *
 * With `reducedMotion` the character holds still apart from its expression
 * changes and the mouth moving with speech; nothing breathes, sways or
 * wanders, and blinks are skipped.
 */
export function createVirgilRig(svg: SVGSVGElement, options: { reducedMotion?: boolean } = {}): VirgilRig {
  const reduced = options.reducedMotion ?? false;
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

  let state: VirgilState = "idle";
  let target = expressionFor(state);
  // The blended expression, moved toward `target` a little every frame.
  const current: Expression = { ...NEUTRAL, arms: { ...NEUTRAL.arms } };
  let pointer: { x: number; y: number } | null = null;

  // Involuntary motion.
  let lid = 1;
  let blinkAt = 1.4;
  let closing = false;
  let gaze = { x: 0, y: 0 };
  let saccade = { x: 0, y: 0, hold: 1.5 };
  let saccadeAt = 1;
  let mouthOpen = 0;
  let mouthWidth = 1;
  const hairSpring: Spring = { value: 0, velocity: 0 };
  const tasselSpring: Spring = { value: 0, velocity: 0 };
  const squash: Spring = { value: 0, velocity: 0 };
  let lastHeadX = 0;
  let lastT = 0;

  // One-off performances, each a start time in seconds.
  let gestureName: Gesture | null = null;
  let gestureStart = 0;
  let glintSweep = -1;

  function setState(next: VirgilState) {
    if (next === state) return;
    const previous = state;
    state = next;
    target = expressionFor(next);
    // The small social moments between states: a hello when the session
    // comes alive, a nod when she has said her piece, a flash of the lens
    // when an idea lands.
    if ((previous === "idle" || previous === "connecting") && (next === "listening" || next === "speaking")) {
      gesture("wave");
    } else if (previous === "speaking" && next === "listening") {
      gesture("nod");
    } else if (previous === "thinking" && next === "speaking") {
      gesture("aha");
    }
  }

  function gesture(name: Gesture) {
    gestureName = name;
    gestureStart = lastT;
    if (name === "poke") squash.velocity -= 0.12;
    if (name === "aha" || name === "poke") glintSweep = lastT;
  }

  function setPointer(x: number | null, y: number | null) {
    pointer = x === null || y === null ? null : { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  function blend() {
    // Reduced motion: expressions switch at once rather than easing.
    const k = reduced ? 1 : 0.12;
    for (const key of Object.keys(NEUTRAL) as Array<keyof Expression>) {
      if (key === "arms") continue;
      (current[key] as number) = lerp(current[key] as number, target[key] as number, k);
    }
    const armK = reduced ? 1 : 0.1;
    current.arms.left = lerp(current.arms.left, target.arms.left, armK);
    current.arms.right = lerp(current.arms.right, target.arms.right, armK);
  }

  function frame(energy: number, now: number) {
    const t = now / 1000;
    const dt = lastT ? Math.min(0.05, t - lastT) : 1 / 60;
    lastT = t;
    blend();

    const speaking = state === "speaking";
    const e = clamp(energy, 0, 1);

    // ---- Mouth: chases the envelope quickly open, relaxes slowly shut. ----
    const speech = speaking ? mouthForSpeech(e, t) : { open: 0, width: 1 };
    // A poke gets a small "oh!"; a cheer gets a grin.
    const surprise = gestureName === "poke" ? pokeCurve(t - gestureStart) : 0;
    const grin = gestureName === "cheer" ? waveCurve((t - gestureStart) / 1.4) : 0;
    const openTarget = Math.max(speech.open, current.mouthOpen, surprise * 0.35);
    mouthOpen += (openTarget - mouthOpen) * (openTarget > mouthOpen ? 0.55 : 0.18);
    mouthWidth += (speech.width * current.mouthWidth - mouthWidth) * 0.3;
    // An error is a wobble, not a steady frown.
    const wobble = state === "error" && !reduced ? Math.sin(t * 7) * 0.12 : 0;
    const smile = current.smile + wobble + grin * 0.45 - surprise * 0.3;
    if (parts.mouth) parts.mouth.setAttribute("d", mouthPath(PIVOT.mouth.x, PIVOT.mouth.y, mouthOpen, smile, mouthWidth));
    if (parts.teeth) parts.teeth.style.opacity = String(clamp((mouthOpen - 0.18) * 4, 0, 1));
    if (parts.tongue) parts.tongue.style.opacity = String(clamp((mouthOpen - 0.4) * 3, 0, 1));

    // ---- Blinks on an irregular clock; a metronome blink looks synthetic. ----
    if (!reduced && current.lid > 0.5) {
      if (t > blinkAt) {
        closing = true;
        blinkAt = t + nextBlinkDelay();
      }
      if (closing) {
        lid = Math.max(0.02, lid - dt * 14);
        if (lid <= 0.03) closing = false;
      } else {
        lid += (1 - lid) * Math.min(1, dt * 11);
      }
    } else {
      lid = 1;
    }
    const lidOpen = clamp(Math.min(lid, current.lid), 0, 1.1);
    const lidShift = (1 - Math.min(lidOpen, 1)) * LID_TRAVEL;
    parts.lidLeft?.setAttribute("transform", `translate(0 ${lidShift.toFixed(1)})`);
    parts.lidRight?.setAttribute("transform", `translate(0 ${lidShift.toFixed(1)})`);
    const closedLine = clamp((0.3 - lidOpen) * 5, 0, 1).toFixed(3);
    if (parts.closedLeft) parts.closedLeft.style.opacity = closedLine;
    if (parts.closedRight) parts.closedRight.style.opacity = closedLine;
    // Eyes go wider than open by scaling a touch; a grin pushes the cheeks up.
    const squintLift = (current.squint + Math.max(0, smile - 0.75) * 1.5 + mouthOpen * 0.15) * 18;
    parts.squintLeft?.setAttribute("transform", `translate(0 ${(-squintLift).toFixed(1)})`);
    parts.squintRight?.setAttribute("transform", `translate(0 ${(-squintLift).toFixed(1)})`);

    // ---- Gaze: the pointer when there is one, otherwise a wander and settle. ----
    let gazeTarget = { x: current.gazeX, y: current.gazeY };
    if (pointer && (state === "listening" || state === "speaking" || state === "idle")) {
      gazeTarget = { x: pointer.x * 0.9, y: pointer.y * 0.7 };
    } else if (!reduced && (state === "idle" || state === "connecting" || state === "listening")) {
      if (t > saccadeAt) {
        saccade = nextSaccade();
        if (state === "connecting") saccade = { x: Math.sign(saccade.x) * 0.8, y: -0.2, hold: 0.5 };
        saccadeAt = t + saccade.hold;
      }
      // Settle toward the front between glances, so he never looks lost.
      const settle = state === "listening" ? 0.3 : 0.6;
      gazeTarget = { x: current.gazeX + saccade.x * settle, y: current.gazeY + saccade.y * settle };
    }
    const gazeK = reduced ? 1 : Math.min(1, dt * 14);
    gaze = { x: lerp(gaze.x, gazeTarget.x, gazeK), y: lerp(gaze.y, gazeTarget.y, gazeK) };
    const pupilTransform = (eye: { x: number; y: number }) =>
      `translate(${(gaze.x * PUPIL_TRAVEL_X).toFixed(1)} ${(gaze.y * PUPIL_TRAVEL_Y).toFixed(1)}) ` +
      `translate(${eye.x} ${eye.y}) scale(${current.pupil.toFixed(3)}) translate(${-eye.x} ${-eye.y})`;
    parts.pupilLeft?.setAttribute("transform", pupilTransform(PIVOT.eyeLeft));
    parts.pupilRight?.setAttribute("transform", pupilTransform(PIVOT.eyeRight));

    // ---- Brows: the expression, plus a lift on loud syllables. ----
    const emphasis = speaking ? e * 4 : 0;
    const browRaise = emphasis + (gestureName === "aha" ? ahaCurve(t - gestureStart) * 6 : 0) + surprise * 8 + grin * 4;
    parts.browLeft?.setAttribute(
      "transform",
      `translate(0 ${(current.browLeftY - browRaise).toFixed(1)}) rotate(${current.browLeftRot.toFixed(1)} ${PIVOT.browLeft.x} ${PIVOT.browLeft.y})`,
    );
    parts.browRight?.setAttribute(
      "transform",
      `translate(0 ${(current.browRightY - browRaise).toFixed(1)}) rotate(${current.browRightRot.toFixed(1)} ${PIVOT.browRight.x} ${PIVOT.browRight.y})`,
    );

    // ---- Head and body: breath, sway, nods on speech, the tilt of attention. ----
    const breath = reduced ? 0 : Math.sin(t * 1.15) * 2;
    const sway = reduced ? 0 : Math.sin(t * 0.7) * 1.6;
    const nod = speaking && !reduced ? e * 3 : 0;
    const gestureNod = gestureName === "nod" ? nodCurve(t - gestureStart) : 0;
    const headX = reduced ? 0 : Math.sin(t * 0.55) * 2;
    const headY = breath * 0.6 + current.lean + nod + gestureNod * 6;
    const tilt = current.tilt + sway;
    parts.head?.setAttribute(
      "transform",
      `translate(${headX.toFixed(1)} ${headY.toFixed(1)}) rotate(${tilt.toFixed(2)} ${PIVOT.head.x} ${PIVOT.head.y})`,
    );
    const breathScale = 1 + (reduced ? 0 : Math.sin(t * 1.15) * 0.012);
    parts.body?.setAttribute(
      "transform",
      `translate(0 ${PIVOT.feet.y}) scale(${(1 / breathScale).toFixed(4)} ${breathScale.toFixed(4)}) translate(0 ${-PIVOT.feet.y})`,
    );

    // ---- Hair and tassel swing with the head, on springs. ----
    if (!reduced) {
      const headDelta = headX - lastHeadX;
      lastHeadX = headX;
      springStep(hairSpring, 0, 0.06, 0.86);
      hairSpring.velocity -= headDelta * 1.6 + gestureNod * 0.4;
      springStep(tasselSpring, 0, 0.04, 0.9);
      tasselSpring.velocity -= headDelta * 3 + gestureNod * 0.8;
    }
    parts.hair?.setAttribute("transform", `rotate(${hairSpring.value.toFixed(2)} ${PIVOT.hair.x} ${PIVOT.hair.y})`);
    parts.tassel?.setAttribute("transform", `rotate(${tasselSpring.value.toFixed(2)} ${PIVOT.tassel.x} ${PIVOT.tassel.y})`);

    // ---- Arms: the pose, a wave, a cheer, a hand that moves while talking. ----
    let armLeft = current.arms.left;
    let armRight = current.arms.right;
    // Short arms on a big head: a raised arm stretches, the way a cartoon's
    // does, so the hand gets clear of the face instead of covering a cheek.
    let stretchLeft = 1;
    let stretchRight = 1;
    if (gestureName === "wave") {
      const p = (t - gestureStart) / 1.6;
      const lift = waveCurve(p);
      armRight = lerp(armRight, ARM_WAVE.right + Math.sin(p * Math.PI * 5) * 14, lift);
      stretchRight = 1 + lift * 0.5;
    } else if (gestureName === "cheer") {
      const p = (t - gestureStart) / 1.4;
      const lift = waveCurve(p);
      const bounce = Math.sin(p * Math.PI * 6) * 6;
      armLeft = lerp(armLeft, ARM_CHEER.left - bounce, lift);
      armRight = lerp(armRight, ARM_CHEER.right + bounce, lift);
      stretchLeft = stretchRight = 1 + lift * 0.7;
    } else if (speaking && !reduced) {
      armRight -= e * 22 + Math.sin(t * 3.1) * 3;
      stretchRight = 1 + e * 0.12;
    }
    parts.armLeft?.setAttribute("transform", armTransform(armLeft, stretchLeft, PIVOT.armLeft));
    parts.armRight?.setAttribute("transform", armTransform(armRight, stretchRight, PIVOT.armRight));

    // ---- Squash and stretch, for a poke and a cheer. ----
    if (!reduced) {
      springStep(squash, 0, 0.18, 0.82);
      if (gestureName === "cheer" && t - gestureStart < 0.05) squash.velocity += 0.12;
    }
    const s = clamp(squash.value, -0.35, 0.35);
    parts.figure?.setAttribute(
      "transform",
      `translate(${PIVOT.feet.x} ${PIVOT.feet.y}) scale(${(1 - s * 0.6).toFixed(4)} ${(1 + s).toFixed(4)}) translate(${-PIVOT.feet.x} ${-PIVOT.feet.y})`,
    );

    // ---- Cheeks, thought bubble, sweat, lens glint, sound ripples. ----
    const blush = current.blush + (gestureName === "poke" ? pokeCurve(t - gestureStart) * 0.5 : 0) + (gestureName === "cheer" ? 0.3 : 0);
    if (parts.blushLeft) parts.blushLeft.style.opacity = clamp(blush, 0, 1).toFixed(3);
    if (parts.blushRight) parts.blushRight.style.opacity = clamp(blush, 0, 1).toFixed(3);
    if (parts.thought) parts.thought.style.opacity = current.thought.toFixed(3);
    parts.thoughtDots.forEach((dot, index) => {
      const pulse = reduced ? 1 : 1 + Math.max(0, Math.sin(t * 3 - index * 0.9)) * 0.18;
      const cx = dot.getAttribute("cx") ?? "0";
      const cy = dot.getAttribute("cy") ?? "0";
      dot.setAttribute("transform", `translate(${cx} ${cy}) scale(${pulse.toFixed(3)}) translate(${-Number(cx)} ${-Number(cy)})`);
    });
    if (parts.sweat) {
      parts.sweat.style.opacity = current.sweat.toFixed(3);
      const drip = reduced ? 0 : (Math.sin(t * 1.3) + 1) * 3;
      parts.sweat.setAttribute("transform", `translate(0 ${drip.toFixed(1)})`);
    }
    const sweep = glintSweep < 0 ? 0 : clamp((t - glintSweep) / 0.7, 0, 1);
    const glintX = sweep > 0 && sweep < 1 ? -40 + sweep * 80 : 0;
    const glintOpacity = sweep > 0 && sweep < 1 ? Math.sin(sweep * Math.PI) : 0.55;
    for (const glint of [parts.glintLeft, parts.glintRight]) {
      if (!glint) continue;
      glint.setAttribute("transform", `translate(${glintX.toFixed(1)} 0)`);
      glint.style.opacity = glintOpacity.toFixed(3);
    }
    const ripple = speaking ? clamp(0.25 + e * 0.9, 0, 1) : 0;
    const rippleScale = 1 + e * 0.12;
    for (const [element, side] of [
      [parts.rippleLeft, -1],
      [parts.rippleRight, 1],
    ] as const) {
      if (!element) continue;
      element.style.opacity = lerp(Number(element.style.opacity || 0), ripple, 0.2).toFixed(3);
      element.setAttribute("transform", `translate(${(side * (rippleScale - 1) * 40).toFixed(1)} 0) scale(${rippleScale.toFixed(3)})`);
    }

    // Gestures end on their own.
    if (gestureName && t - gestureStart > gestureLength(gestureName)) gestureName = null;
  }

  function dispose() {
    pointer = null;
    gestureName = null;
  }

  // First frame at rest so nothing flashes before the loop starts.
  frame(0, 0);

  return { frame, setState, setPointer, gesture, dispose };
}

/** Rotate about the shoulder, after lengthening the arm along itself. */
function armTransform(degrees: number, stretch: number, pivot: { x: number; y: number }): string {
  return (
    `rotate(${degrees.toFixed(1)} ${pivot.x} ${pivot.y}) ` +
    `translate(${pivot.x} ${pivot.y}) scale(1 ${stretch.toFixed(3)}) translate(${-pivot.x} ${-pivot.y})`
  );
}

function gestureLength(name: Gesture): number {
  switch (name) {
    case "wave":
      return 1.6;
    case "cheer":
      return 1.4;
    case "nod":
      return 0.9;
    case "aha":
      return 0.8;
    case "poke":
      return 1.2;
  }
}

/** Rises, holds, and comes back down over p = 0…1. */
function waveCurve(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.2) return easeOut(p / 0.2);
  if (p > 0.8) return easeOut((1 - p) / 0.2);
  return 1;
}

/** Two short dips of the head. */
function nodCurve(seconds: number): number {
  if (seconds < 0 || seconds > 0.9) return 0;
  return Math.max(0, Math.sin(seconds * Math.PI * 2.2)) * 0.8;
}

function ahaCurve(seconds: number): number {
  if (seconds < 0 || seconds > 0.8) return 0;
  return Math.sin((seconds / 0.8) * Math.PI);
}

function pokeCurve(seconds: number): number {
  if (seconds < 0 || seconds > 1.2) return 0;
  return Math.sin((seconds / 1.2) * Math.PI);
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}
