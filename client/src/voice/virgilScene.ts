/**
 * Virgil in three dimensions.
 *
 * The same character as the drawing in VirgilAvatar.tsx, built from
 * primitives (no model files) with toon shading and an inked outline so it
 * keeps the flat cartoon look, and moved by the same animator, so the two
 * bodies agree on every blink, glance and gesture. In 3D the head really
 * turns toward the pointer and the eyes are spheres that roll, which the
 * drawing can only fake.
 *
 * Coordinates follow the drawing: one unit is 100 px of the 320x340 canvas,
 * the origin is the chin, and y points up. Imported dynamically, since three.js
 * is large and nothing here is needed until the avatar is on screen.
 */
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  clamp,
  createVirgilAnimator,
  mouthPath,
  type Gesture,
  type VirgilPose,
  type VirgilState,
} from "./virgilAnimator";

const PALETTE = {
  skin: 0xa9b4f4,
  navy: 0x27315a,
  navyDeep: 0x1e2748,
  navyLight: 0x334071,
  hair: 0x1b2340,
  outline: 0x151b33,
  gold: 0xf5b843,
  glow: 0x7fd8ff,
  white: 0xffffff,
  blush: 0xff8fa8,
  iris: 0x2d3f80,
  sweat: 0x9fe0ff,
};

const DEG = Math.PI / 180;

export interface VirgilScene {
  frame(energy: number, now: number): VirgilPose;
  setState(state: VirgilState): void;
  setPointer(x: number | null, y: number | null): void;
  gesture(name: Gesture): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Three-step toon ramp: shadow, mid, light. */
function toonRamp(): DataTexture {
  const ramp = new DataTexture(new Uint8Array([120, 200, 255]), 3, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export function createVirgilScene(canvas: HTMLCanvasElement, options: { reducedMotion?: boolean } = {}): VirgilScene {
  const animator = createVirgilAnimator(options);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0.62, 8.4);
  camera.lookAt(0, 0.62, 0);

  scene.add(new HemisphereLight(0xffffff, 0x8a93b8, 1.25));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(2.2, 3.4, 4.2);
  scene.add(key);
  const fill = new DirectionalLight(0xdbe8ff, 0.5);
  fill.position.set(-3, 1, 2);
  scene.add(fill);

  const ramp = toonRamp();
  const disposables: Array<{ dispose(): void }> = [ramp];
  const toon = (color: number, extra: ConstructorParameters<typeof MeshToonMaterial>[0] = {}) => {
    const material = new MeshToonMaterial({ color, gradientMap: ramp, ...extra });
    disposables.push(material);
    return material;
  };
  const flat = (color: number, extra: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}) => {
    const material = new MeshBasicMaterial({ color, ...extra });
    disposables.push(material);
    return material;
  };
  const outlineMaterial = flat(PALETTE.outline, { side: BackSide });

  /** A mesh with an inked edge: the same shape, slightly larger, inside out. */
  function inked(mesh: Mesh, grow: number): Mesh {
    const hull = new Mesh(mesh.geometry, outlineMaterial);
    hull.scale.setScalar(grow);
    mesh.add(hull);
    return mesh;
  }

  const geometries: Array<{ dispose(): void }> = [];
  const geo = <T extends { dispose(): void }>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  /** A cylinder from one point to another. */
  function beam(from: Vector3, to: Vector3, radius: number, color: number): Mesh {
    const length = from.distanceTo(to);
    const mesh = new Mesh(geo(new CylinderGeometry(radius, radius, length, 10)), toon(color));
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    const direction = new Vector3().subVectors(to, from).normalize();
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction));
    return mesh;
  }

  // ---- Layout: the figure scales about its feet; the chin is the origin. --
  const root = new Group();
  scene.add(root);
  const figure = new Group();
  figure.position.y = -0.88;
  root.add(figure);
  const stand = new Group();
  stand.position.y = 0.88;
  figure.add(stand);

  // Ground shadow.
  const shadow = new Mesh(geo(new CircleGeometry(0.72, 32)), flat(PALETTE.outline, { transparent: true, opacity: 0.14, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.16;
  shadow.position.y = -0.9;
  root.add(shadow);

  // ---- Legs and sneakers -----------------------------------------------------
  const body = new Group();
  stand.add(body);
  for (const side of [-1, 1]) {
    const leg = new Mesh(geo(new CylinderGeometry(0.13, 0.13, 0.46, 16)), toon(PALETTE.navy));
    leg.position.set(side * 0.19, -0.5, 0);
    body.add(inked(leg, 1.12));
    const shoe = new Mesh(geo(new RoundedBoxGeometry(0.5, 0.24, 0.5, 4, 0.11)), toon(PALETTE.white));
    shoe.position.set(side * 0.21, -0.8, 0.06);
    body.add(inked(shoe, 1.1));
    const sole = new Mesh(geo(new BoxGeometry(0.42, 0.05, 0.44)), flat(PALETTE.glow));
    sole.position.set(side * 0.21, -0.86, 0.08);
    body.add(sole);
  }

  // ---- Hoodie ----------------------------------------------------------------
  const torso = new Mesh(geo(new SphereGeometry(1, 40, 28)), toon(PALETTE.navy));
  torso.scale.set(0.6, 0.5, 0.46);
  torso.position.set(0, -0.14, 0);
  body.add(inked(torso, 1.06));
  const pocket = new Mesh(geo(new RoundedBoxGeometry(0.68, 0.3, 0.1, 4, 0.1)), toon(PALETTE.navyDeep));
  pocket.position.set(0, -0.31, 0.42);
  body.add(inked(pocket, 1.08));
  const collar = new Mesh(geo(new SphereGeometry(1, 32, 16)), toon(PALETTE.navyLight));
  collar.scale.set(0.52, 0.17, 0.32);
  collar.position.set(0, 0.26, 0.1);
  body.add(inked(collar, 1.06));
  for (const side of [-1, 1]) {
    const string = beam(new Vector3(side * 0.1, 0.16, 0.46), new Vector3(side * 0.14, -0.24, 0.5), 0.02, PALETTE.gold);
    body.add(string);
    const knob = new Mesh(geo(new SphereGeometry(0.04, 12, 8)), toon(PALETTE.gold));
    knob.position.set(side * 0.14, -0.26, 0.51);
    body.add(knob);
  }

  // ---- Arms: a group at each shoulder, hanging down, hand at the end -------
  function makeArm(side: -1 | 1): Group {
    const group = new Group();
    group.position.set(side * 0.52, 0.16, 0.12);
    const inner = new Group();
    inner.rotation.z = side * 0.236;
    group.add(inner);
    const upper = new Mesh(geo(new CylinderGeometry(0.15, 0.15, 0.3, 16)), toon(PALETTE.navy));
    upper.position.y = -0.28;
    inner.add(inked(upper, 1.12));
    const cap = new Mesh(geo(new SphereGeometry(0.15, 16, 12)), toon(PALETTE.navy));
    cap.position.y = -0.13;
    inner.add(inked(cap, 1.12));
    const hand = new Mesh(geo(new SphereGeometry(0.15, 18, 14)), toon(PALETTE.skin));
    hand.position.y = -0.55;
    inner.add(inked(hand, 1.12));
    return group;
  }
  const armLeft = makeArm(-1);
  const armRight = makeArm(1);
  stand.add(armLeft, armRight);

  // ---- Head ------------------------------------------------------------------
  const head = new Group();
  stand.add(head);
  const skull = new Mesh(geo(new SphereGeometry(1, 48, 36)), toon(PALETTE.skin));
  skull.scale.set(1, 0.94, 0.9);
  skull.position.set(0, 0.94, 0);
  head.add(inked(skull, 1.045));
  for (const side of [-1, 1]) {
    const ear = new Mesh(geo(new SphereGeometry(0.15, 16, 12)), toon(PALETTE.skin));
    ear.position.set(side * 0.98, 0.82, 0);
    head.add(inked(ear, 1.2));
  }

  // Cheeks.
  const cheeks: Mesh[] = [];
  for (const side of [-1, 1]) {
    const cheek = new Mesh(geo(new SphereGeometry(0.15, 16, 12)), flat(PALETTE.blush, { transparent: true, opacity: 0.3, depthWrite: false }));
    cheek.scale.set(1, 0.55, 0.35);
    cheek.position.set(side * 0.64, 0.5, 0.57);
    head.add(cheek);
    cheeks.push(cheek);
  }

  // Mouth: a decal drawn on a canvas, so it can take any shape the pose asks.
  const MOUTH_PX = 256;
  const mouthCanvas = document.createElement("canvas");
  mouthCanvas.width = MOUTH_PX;
  mouthCanvas.height = MOUTH_PX;
  const mouthCtx = mouthCanvas.getContext("2d")!;
  const mouthTexture = new CanvasTexture(mouthCanvas);
  mouthTexture.colorSpace = SRGBColorSpace;
  disposables.push(mouthTexture);
  const mouth = new Mesh(
    geo(new PlaneGeometry(1, 1)),
    flat(PALETTE.white, { map: mouthTexture, transparent: true, depthWrite: false }),
  );
  mouth.position.set(0, 0.36, 0.8);
  mouth.rotation.x = -0.32;
  head.add(mouth);
  let lastMouthKey = "";
  function drawMouth(pose: VirgilPose) {
    const key = `${pose.mouthOpen.toFixed(2)}|${pose.smile.toFixed(2)}|${pose.mouthWidth.toFixed(2)}`;
    if (key === lastMouthKey) return;
    lastMouthKey = key;
    const ctx = mouthCtx;
    const S = MOUTH_PX;
    // 2.4 canvas px per drawing px, mouth centre a little above the middle so
    // an open jaw has room below.
    const k = 2.4;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S * 0.42);
    ctx.scale(k, k);
    const path = new Path2D(mouthPath(0, 0, pose.mouthOpen, pose.smile, pose.mouthWidth));
    ctx.fillStyle = "#3a1f2e";
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha = clamp((pose.mouthOpen - 0.18) * 4, 0, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-30, -14, 60, 12 - pose.smile * 6);
    ctx.globalAlpha = clamp((pose.mouthOpen - 0.4) * 3, 0, 1);
    ctx.fillStyle = "#ff7f93";
    ctx.beginPath();
    ctx.ellipse(0, 30, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#151b33";
    ctx.stroke(path);
    ctx.restore();
    mouthTexture.needsUpdate = true;
  }

  // Eyes: a white ball, a pupil group that rolls, lids that are skin-coloured
  // caps rotating over the ball, and a line that shows when the eye is shut.
  interface Eye {
    pupil: Group;
    upperLid: Group;
    lowerLid: Group;
    closed: Mesh;
    glint: Mesh;
  }
  function makeEye(side: -1 | 1): Eye {
    const group = new Group();
    group.position.set(side * 0.38, 0.88, 0.62);
    head.add(group);
    // Unlit, so the whites stay white instead of shading blue in the ramp.
    const ball = new Mesh(geo(new SphereGeometry(0.3, 28, 20)), flat(PALETTE.white));
    group.add(inked(ball, 1.1));

    const pupil = new Group();
    group.add(pupil);
    // The pupil sits just proud of the ball, and inside the lids' reach.
    const iris = new Mesh(geo(new SphereGeometry(0.16, 20, 14)), flat(PALETTE.iris));
    iris.scale.z = 0.4;
    iris.position.z = 0.24;
    pupil.add(iris);
    const dot = new Mesh(geo(new SphereGeometry(0.105, 18, 12)), flat(PALETTE.outline));
    dot.scale.z = 0.4;
    dot.position.z = 0.27;
    pupil.add(dot);
    const shine = new Mesh(geo(new SphereGeometry(0.045, 12, 8)), flat(PALETTE.white));
    shine.position.set(-0.06, 0.07, 0.3);
    pupil.add(shine);
    const shine2 = new Mesh(geo(new SphereGeometry(0.022, 10, 6)), flat(PALETTE.white));
    shine2.position.set(0.06, -0.06, 0.3);
    pupil.add(shine2);

    // Lids: the front half of a sphere a little larger than the ball, drawn
    // on both sides so it reads as a solid cap whichever way it is turned.
    const capGeometry = geo(new SphereGeometry(0.355, 28, 14, 0, Math.PI));
    const lidMaterial = toon(PALETTE.skin, { side: DoubleSide });
    const upperLid = new Group();
    upperLid.add(new Mesh(capGeometry, lidMaterial));
    group.add(upperLid);
    const lowerLid = new Group();
    lowerLid.add(new Mesh(capGeometry, lidMaterial));
    group.add(lowerLid);

    const closed = new Mesh(geo(new TorusGeometry(0.2, 0.025, 8, 20, Math.PI * 0.7)), flat(PALETTE.outline, { transparent: true, opacity: 0 }));
    closed.position.set(0, 0.04, 0.37);
    closed.rotation.z = Math.PI + (Math.PI - Math.PI * 0.7) / 2;
    group.add(closed);

    // Glasses, on the same group so they ride with the eye.
    const rim = new Mesh(geo(new TorusGeometry(0.37, 0.036, 10, 40)), toon(PALETTE.outline));
    rim.position.z = 0.36;
    group.add(rim);
    const lens = new Mesh(geo(new CircleGeometry(0.34, 32)), flat(PALETTE.white, { transparent: true, opacity: 0.1, depthWrite: false }));
    lens.position.z = 0.35;
    group.add(lens);
    const glint = new Mesh(geo(new PlaneGeometry(0.07, 0.42)), flat(PALETTE.white, { transparent: true, opacity: 0.55, depthWrite: false }));
    glint.position.set(-0.14, 0, 0.355);
    glint.rotation.z = -0.5;
    group.add(glint);
    return { pupil, upperLid, lowerLid, closed, glint };
  }
  const eyeLeft = makeEye(-1);
  const eyeRight = makeEye(1);
  const bridge = new Mesh(geo(new TorusGeometry(0.06, 0.03, 8, 12, Math.PI)), toon(PALETTE.outline));
  bridge.position.set(0, 0.9, 0.98);
  head.add(bridge);
  for (const side of [-1, 1]) {
    head.add(beam(new Vector3(side * 0.74, 0.9, 0.96), new Vector3(side * 0.96, 0.84, 0.18), 0.03, PALETTE.outline));
  }

  // Brows: arcs on the forehead, each on a pivot for lift and rotation.
  function makeBrow(side: -1 | 1): Group {
    const group = new Group();
    group.position.set(side * 0.38, 1.3, 0.8);
    const arc = new Mesh(geo(new TorusGeometry(0.27, 0.042, 8, 18, 1.4)), toon(PALETTE.outline));
    arc.rotation.z = Math.PI / 2 - 0.7;
    arc.position.y = -0.2;
    group.add(arc);
    head.add(group);
    return group;
  }
  const browLeft = makeBrow(-1);
  const browRight = makeBrow(1);

  // Hair: a cap swept to one side, with a stray tuft.
  const hair = new Group();
  hair.position.set(0, 0.94, 0);
  head.add(hair);
  const cap = new Mesh(geo(new SphereGeometry(1.05, 40, 20, 0, Math.PI * 2, 0, 0.78)), toon(PALETTE.hair));
  cap.scale.set(1, 0.94, 0.9);
  cap.rotation.x = 0.1;
  cap.rotation.z = -0.14;
  hair.add(cap);
  const tuft = new Mesh(geo(new ConeGeometry(0.13, 0.36, 10)), toon(PALETTE.hair));
  tuft.position.set(0.3, 0.9, 0.5);
  tuft.rotation.z = -0.6;
  tuft.rotation.x = 0.3;
  hair.add(tuft);

  // Mortarboard, worn at an angle, with a tassel on a spring.
  const hat = new Group();
  hat.position.set(0.5, 1.74, 0.12);
  hat.rotation.z = 0.17;
  head.add(hat);
  const hatBase = new Mesh(geo(new CylinderGeometry(0.16, 0.2, 0.2, 20)), toon(PALETTE.hair));
  hat.add(inked(hatBase, 1.08));
  const board = new Mesh(geo(new BoxGeometry(0.92, 0.05, 0.92)), toon(PALETTE.navy));
  board.position.y = 0.12;
  board.rotation.y = Math.PI / 4;
  hat.add(inked(board, 1.05));
  const button = new Mesh(geo(new SphereGeometry(0.035, 10, 8)), toon(PALETTE.gold));
  button.position.y = 0.16;
  hat.add(button);
  const tassel = new Group();
  tassel.position.set(0.42, 0.12, 0.42);
  hat.add(tassel);
  const cord = new Mesh(geo(new CylinderGeometry(0.015, 0.015, 0.34, 8)), toon(PALETTE.gold));
  cord.position.y = -0.17;
  tassel.add(cord);
  const tuftGold = new Mesh(geo(new ConeGeometry(0.05, 0.16, 10)), toon(PALETTE.gold));
  tuftGold.position.y = -0.4;
  tuftGold.rotation.x = Math.PI;
  tassel.add(tuftGold);

  // ---- Thought bubble, sweat drop, sound ripples --------------------------
  const thoughtGroup = new Group();
  root.add(thoughtGroup);
  const thoughtDots: Mesh[] = [];
  const thoughtMaterials: MeshBasicMaterial[] = [];
  for (const [x, y, r] of [
    [0.92, 1.14, 0.05],
    [1.08, 1.32, 0.08],
    [1.32, 1.58, 0.15],
  ]) {
    const material = flat(PALETTE.white, { transparent: true, opacity: 0, depthWrite: false });
    const edge = flat(PALETTE.outline, { side: BackSide, transparent: true, opacity: 0, depthWrite: false });
    thoughtMaterials.push(material, edge);
    const dot = new Mesh(geo(new SphereGeometry(r, 16, 12)), material);
    dot.position.set(x, y, 0.2);
    dot.renderOrder = 2;
    const hull = new Mesh(dot.geometry, edge);
    hull.scale.setScalar(1.25);
    hull.renderOrder = 1;
    dot.add(hull);
    thoughtGroup.add(dot);
    thoughtDots.push(dot);
  }

  const sweat = new Group();
  sweat.position.set(0.94, 1.3, 0.5);
  root.add(sweat);
  const sweatMaterial = flat(PALETTE.sweat, { transparent: true, opacity: 0, depthWrite: false });
  const drop = new Mesh(geo(new SphereGeometry(0.07, 14, 10)), sweatMaterial);
  sweat.add(drop);
  const dropTop = new Mesh(geo(new ConeGeometry(0.07, 0.16, 12)), sweatMaterial);
  dropTop.position.y = 0.09;
  sweat.add(dropTop);

  const ripples: Array<{ group: Group; side: number }> = [];
  const rippleMaterials: MeshBasicMaterial[] = [];
  for (const side of [-1, 1]) {
    const group = new Group();
    group.position.set(side * 1.28, 0.9, 0);
    root.add(group);
    for (const [radius, alpha] of [
      [0.32, 1],
      [0.52, 0.55],
    ]) {
      const material = flat(PALETTE.glow, { transparent: true, opacity: 0, depthWrite: false });
      rippleMaterials.push(material);
      (material as MeshBasicMaterial & { baseOpacity: number }).baseOpacity = alpha;
      const arc = new Mesh(geo(new TorusGeometry(radius, 0.03, 8, 24, 1.3)), material);
      arc.rotation.z = side < 0 ? Math.PI - 0.65 : -0.65;
      group.add(arc);
    }
    ripples.push({ group, side });
  }

  // ---- Applying a pose -----------------------------------------------------
  function apply(pose: VirgilPose) {
    drawMouth(pose);

    const lidOpen = clamp(pose.lidOpen, 0, 1);
    const squint = clamp(pose.squintLift / 18, 0, 1);
    for (const eye of [eyeLeft, eyeRight]) {
      eye.pupil.rotation.y = pose.gazeX * 0.5;
      eye.pupil.rotation.x = pose.gazeY * 0.45;
      // Only across the face: scaling depth would sink the pupil into the ball.
      eye.pupil.scale.set(pose.pupil, pose.pupil, 1);
      // Each lid is a front hemisphere. Swung to the back it is hidden inside
      // the ball; swung forward it covers the eye, the top lid coming down
      // and the bottom one coming up into a squint.
      // Each lid is the front half of a sphere. Open, it is swung round to
      // the back of the ball and hidden; shutting, the top lid comes forward
      // over the top and down, and the bottom one comes up into a squint.
      eye.upperLid.rotation.x = -Math.PI * lidOpen;
      eye.lowerLid.rotation.x = Math.PI - (Math.PI / 2) * squint * 0.7;
      (eye.closed.material as MeshBasicMaterial).opacity = pose.closedLine;
      eye.glint.position.x = -0.14 + pose.glintX / 200;
      (eye.glint.material as MeshBasicMaterial).opacity = pose.glintOpacity;
    }

    browLeft.position.y = 1.3 - pose.browLeftY / 100;
    browRight.position.y = 1.3 - pose.browRightY / 100;
    browLeft.rotation.z = -pose.browLeftRot * DEG;
    browRight.rotation.z = -pose.browRightRot * DEG;

    head.position.set(pose.headX / 100, -pose.headY / 100, 0);
    head.rotation.set(pose.turnY * 0.22, pose.turnX * 0.4, -pose.tilt * DEG);
    hair.rotation.z = -pose.hairSwing * DEG;
    tassel.rotation.z = -pose.tasselSwing * DEG;
    body.scale.set(1 / pose.breath, pose.breath, 1 / pose.breath);

    armLeft.rotation.z = -pose.armLeft * DEG;
    armRight.rotation.z = -pose.armRight * DEG;
    armLeft.scale.y = pose.stretchLeft;
    armRight.scale.y = pose.stretchRight;
    // A raised arm comes forward, so the hand reaches the chin or waves in
    // front of the head instead of disappearing inside it.
    armLeft.position.z = 0.12 + Math.min(1, Math.abs(pose.armLeft) / 100) * 0.75;
    armRight.position.z = 0.12 + Math.min(1, Math.abs(pose.armRight) / 100) * 0.75;

    const s = pose.squash;
    figure.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.6);

    for (const cheek of cheeks) (cheek.material as MeshBasicMaterial).opacity = pose.blush;
    for (const material of thoughtMaterials) material.opacity = pose.thought;
    thoughtDots.forEach((dot, index) => dot.scale.setScalar(pose.thoughtPulse[index] ?? 1));
    sweatMaterial.opacity = pose.sweat;
    sweat.position.y = 1.3 - pose.sweatDrip / 100;
    for (const material of rippleMaterials) {
      material.opacity = pose.ripple * (material as MeshBasicMaterial & { baseOpacity: number }).baseOpacity;
    }
    for (const { group, side } of ripples) {
      group.scale.setScalar(pose.rippleScale);
      group.position.x = side * (1.28 + (pose.rippleScale - 1) * 0.4);
    }
  }

  function frame(energy: number, now: number): VirgilPose {
    const pose = animator.frame(energy, now);
    apply(pose);
    // A whisper of parallax: the camera drifts a little against the sway.
    camera.position.x += (MathUtils.clamp(pose.turnX, -1, 1) * -0.25 - camera.position.x) * 0.05;
    camera.lookAt(0, 0.62, 0);
    renderer.render(scene, camera);
    return pose;
  }

  function resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    // A narrow box must still show the whole figure: widen the view to fit.
    camera.fov = camera.aspect < 1 ? 26 / Math.max(0.6, camera.aspect) : 26;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.traverse((object: Object3D) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    for (const item of [...geometries, ...disposables]) item.dispose();
    renderer.dispose();
  }

  frame(0, 0);

  return {
    frame,
    setState: animator.setState,
    setPointer: animator.setPointer,
    gesture: animator.gesture,
    resize,
    dispose,
  };
}

/** Exposed so a check can confirm the palette matches the drawing. */
export const SCENE_PALETTE = { ...PALETTE, toString: () => new Color(PALETTE.skin).getStyle() };
