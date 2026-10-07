import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createVirgilAnimator, type VirgilPose } from "../client/src/voice/virgilAnimator.js";

/*
 * The animator, run frame by frame with a pretend clock. It has no DOM, so
 * what both bodies will do in any situation can be checked here: the social
 * gestures between states, the blink, the mouth on speech, the eyes on the
 * pointer, and what reduced motion switches off.
 */

/** Run the animator at 60 fps for `seconds`, collecting a pose each frame. */
function run(
  animator: ReturnType<typeof createVirgilAnimator>,
  seconds: number,
  from = 0,
  energy: (t: number) => number = () => 0,
): { poses: VirgilPose[]; end: number } {
  const poses: VirgilPose[] = [];
  let t = from;
  const step = 1000 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    t += step;
    poses.push({ ...animator.frame(energy(t / 1000), t), thoughtPulse: [1, 1, 1] });
  }
  return { poses, end: t };
}

describe("createVirgilAnimator", () => {
  it("settles into each state's expression", () => {
    const animator = createVirgilAnimator();
    animator.setState("thinking");
    const { poses } = run(animator, 2);
    const last = poses.at(-1)!;
    assert.ok(last.thought > 0.95);
    assert.ok(last.armLeft < -95, "hand to the chin");
    assert.ok(last.gazeX > 0.5 && last.gazeY < -0.4, "eyes off to the side");
    assert.ok(last.browLeftY < last.browRightY, "one brow up");
    animator.setState("muted");
    const rest = run(animator, 2, 2000).poses.at(-1)!;
    assert.ok(rest.lidOpen < 0.1, "eyes shut");
    assert.ok(rest.closedLine > 0.9);
  });

  it("waves when a session comes alive, nods after speaking, flashes a lens on an idea", () => {
    const animator = createVirgilAnimator();
    let clock = run(animator, 1).end;
    animator.setState("listening");
    let { poses, end } = run(animator, 1.2, clock);
    assert.ok(poses.some((p) => p.gesture === "wave"));
    assert.ok(Math.min(...poses.map((p) => p.armRight)) < -90, "right arm up");
    assert.ok(Math.max(...poses.map((p) => p.stretchRight)) > 1.3, "and stretched");
    assert.equal(poses.at(-1)!.armLeft, 0, "the other arm stays down");
    clock = end;

    animator.setState("speaking");
    clock = run(animator, 2, clock).end;
    animator.setState("listening");
    ({ poses, end } = run(animator, 0.5, clock));
    assert.ok(poses.some((p) => p.gesture === "nod"));
    assert.ok(Math.max(...poses.map((p) => p.headY)) > 2, "the head dips");
    clock = end;

    animator.setState("thinking");
    clock = run(animator, 2, clock).end;
    animator.setState("speaking");
    ({ poses } = run(animator, 0.5, clock));
    assert.ok(poses.some((p) => p.gesture === "aha"));
    assert.ok(poses.some((p) => p.glintOpacity > 0.9 && p.glintX !== 0), "the lens flashes");
  });

  it("opens the mouth to the audio while speaking, and not otherwise", () => {
    const animator = createVirgilAnimator();
    animator.setState("speaking");
    const quiet = run(animator, 1).poses.at(-1)!;
    assert.ok(quiet.mouthOpen < 0.05);
    // A faint ripple says he is mid-turn even between words; sound swells it.
    assert.ok(quiet.ripple > 0.1 && quiet.ripple < 0.35);
    const loud = run(animator, 1, 1000, () => 0.8).poses;
    assert.ok(loud.at(-1)!.mouthOpen > 0.6);
    assert.ok(loud.at(-1)!.ripple > 0.5);
    assert.ok(new Set(loud.map((p) => Math.round(p.mouthWidth * 20))).size > 3, "syllables vary");
    assert.ok(loud.at(-1)!.armRight < -10, "a hand gestures");
    animator.setState("listening");
    const after = run(animator, 1.5, 2000, () => 0.8).poses.at(-1)!;
    assert.ok(after.mouthOpen < 0.05, "energy alone does not open a listening mouth");
  });

  it("blinks on its own, wanders its eyes, and follows the pointer instead when there is one", () => {
    const animator = createVirgilAnimator();
    const { poses, end } = run(animator, 8);
    assert.ok(poses.some((p) => p.lidOpen < 0.2), "a blink happened");
    assert.ok(poses.filter((p) => p.lidOpen < 0.2).length < poses.length / 10, "and the eyes are mostly open");
    const gazes = new Set(poses.map((p) => `${p.gazeX.toFixed(1)}|${p.gazeY.toFixed(1)}`));
    assert.ok(gazes.size > 4, "the eyes wandered");

    animator.setPointer(-1, 0.5);
    const left = run(animator, 1, end).poses.at(-1)!;
    assert.ok(left.gazeX < -0.6 && left.gazeY > 0.2);
    assert.ok(left.turnX < -0.6, "the head turns too");
    animator.setPointer(null, null);
  });

  it("cheers with both arms and a grin, and squashes when poked", () => {
    const animator = createVirgilAnimator();
    const clock = run(animator, 1).end;
    animator.gesture("cheer");
    const cheer = run(animator, 1, clock).poses;
    assert.ok(Math.max(...cheer.map((p) => p.armLeft)) > 90);
    assert.ok(Math.min(...cheer.map((p) => p.armRight)) < -90);
    assert.ok(Math.max(...cheer.map((p) => p.smile)) > 0.9, "a grin");
    assert.ok(cheer.some((p) => p.squintLift > 2), "that pushes the cheeks up");
    // Let the cheer finish, then poke; a gesture starts from the last frame drawn.
    const clock2 = run(animator, 1, clock + 1000).end;
    animator.gesture("poke");
    const poke = run(animator, 0.5, clock2).poses;
    assert.ok(Math.min(...poke.map((p) => p.squash)) < -0.1, "a squash");
    assert.ok(Math.max(...poke.map((p) => p.mouthOpen)) > 0.2, "and an oh!");
    assert.ok(Math.max(...poke.map((p) => p.blush)) > 0.6);
    assert.ok(run(animator, 2, clock2 + 500).poses.at(-1)!.gesture === null, "gestures end on their own");
  });

  it("under reduced motion keeps the face and the speaking mouth but nothing else moves", () => {
    const animator = createVirgilAnimator({ reducedMotion: true });
    animator.setState("speaking");
    const { poses } = run(animator, 6, 0, () => 0.5);
    const heads = new Set(poses.map((p) => `${p.headX}|${p.tilt}|${p.breath}`));
    assert.equal(heads.size, 1, "no breathing or sway");
    assert.ok(poses.every((p) => p.lidOpen >= 1), "no blinks");
    assert.ok(poses.every((p) => p.hairSwing === 0 && p.tasselSwing === 0));
    assert.ok(poses.at(-1)!.mouthOpen > 0.4, "the mouth still speaks");
    animator.setState("thinking");
    assert.equal(animator.frame(0, 7000).thought, 1, "expressions switch at once");
  });
});
