/**
 * Virgil, built in three.js: a friendly robot scholar in a mortarboard whose
 * face is a live screen.
 *
 * Everything the learner hears drives what they see. A single audio envelope
 * feeds the mouth, the ear rings, the head lift and the halo, so the character
 * is genuinely in sync rather than looping a canned animation next to the
 * voice. The geometry is built from primitives — no model files — so the
 * avatar ships as code and stays crisp at any size.
 *
 * This module is imported dynamically: three.js is large, and nothing here is
 * needed until the avatar is actually on screen.
 */
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  CylinderGeometry,
  WebGLRenderer,
  ACESFilmicToneMapping,
  MathUtils,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type VirgilState =
  "idle" | "connecting" | "listening" | "speaking" | "muted" | "error";

/** Palette taken from the character sheet. */
const PALETTE = {
  shell: 0xf4f6fa,
  navy: 0x1b2340,
  navyDeep: 0x0f1628,
  glow: 0x7fd8ff,
  gold: 0xf5b843,
};

/** The face is a 2D screen, so it is drawn on a canvas and used as a texture. */
const FACE_SIZE = 512;

interface FaceParams {
  /** 0 closed (blink) … 1 fully open. */
  lid: number;
  /** 0 resting mouth … 1 wide open. */
  mouth: number;
  mode: "happy" | "alert" | "rest" | "error";
}

function drawFace(ctx: CanvasRenderingContext2D, params: FaceParams) {
  const S = FACE_SIZE;
  ctx.clearRect(0, 0, S, S);
  // The screen itself. Emissive elsewhere, so keep this dark and flat.
  ctx.fillStyle = "#151d36";
  ctx.fillRect(0, 0, S, S);

  const glow = params.mode === "error" ? "#ffcf8a" : "#8fe3ff";
  ctx.strokeStyle = glow;
  ctx.fillStyle = glow;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const eyeY = S * 0.42;
  const eyeDx = S * 0.17;
  const lid = Math.max(0.04, params.lid);

  const drawEye = (cx: number) => {
    ctx.beginPath();
    if (params.mode === "alert") {
      // Wide, attentive eyes: rounded capsules that squash when blinking.
      const rx = S * 0.055;
      const ry = S * 0.062 * lid;
      ctx.ellipse(cx, eyeY, rx, Math.max(ry, S * 0.008), 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (params.mode === "rest") {
      // At rest the eyes are gentle flat curves, like a contented sleep.
      ctx.lineWidth = S * 0.032;
      ctx.moveTo(cx - S * 0.062, eyeY);
      ctx.quadraticCurveTo(cx, eyeY + S * 0.022, cx + S * 0.062, eyeY);
      ctx.stroke();
      return;
    }
    // The signature happy arc, squashed flat while blinking.
    ctx.lineWidth = S * 0.034;
    const rise = S * 0.05 * lid;
    ctx.moveTo(cx - S * 0.065, eyeY + rise * 0.5);
    ctx.quadraticCurveTo(cx, eyeY - rise, cx + S * 0.065, eyeY + rise * 0.5);
    ctx.stroke();
  };

  drawEye(S * 0.5 - eyeDx);
  drawEye(S * 0.5 + eyeDx);

  // Mouth: a small smile that opens into a rounded speaking shape.
  const mouthY = S * 0.6;
  const open = params.mouth;
  ctx.beginPath();
  if (open < 0.08) {
    ctx.lineWidth = S * 0.026;
    ctx.moveTo(S * 0.5 - S * 0.042, mouthY);
    ctx.quadraticCurveTo(S * 0.5, mouthY + S * 0.038, S * 0.5 + S * 0.042, mouthY);
    ctx.stroke();
  } else {
    const rx = S * (0.042 + open * 0.022);
    const ry = S * (0.012 + open * 0.062);
    ctx.ellipse(S * 0.5, mouthY + ry * 0.35, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export interface VirgilScene {
  /** Feed the current audio envelope (0…1) and let the scene advance. */
  frame(energy: number, now: number): void;
  setState(state: VirgilState): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createVirgilScene(
  canvas: HTMLCanvasElement,
  options: { reducedMotion?: boolean } = {},
): VirgilScene {
  const reduced = options.reducedMotion ?? false;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.25, 9.6);

  // Soft studio lighting: a cool key, a warm fill, and a rim to separate the
  // white shell from a light background.
  scene.add(new HemisphereLight(0xdfe9ff, 0x9aa6bb, 1.15));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(2.4, 3.2, 3.4);
  scene.add(key);
  const rim = new DirectionalLight(0x9fd2ff, 0.9);
  rim.position.set(-3, 1.2, -2.2);
  scene.add(rim);
  const faceLight = new PointLight(PALETTE.glow, 0.7, 6);
  faceLight.position.set(0, 0.15, 1.9);
  scene.add(faceLight);

  const shellMaterial = new MeshStandardMaterial({
    color: PALETTE.shell,
    roughness: 0.42,
    metalness: 0.06,
  });
  const navyMaterial = new MeshStandardMaterial({
    color: PALETTE.navy,
    roughness: 0.5,
    metalness: 0.1,
  });
  const goldMaterial = new MeshStandardMaterial({
    color: PALETTE.gold,
    roughness: 0.38,
    metalness: 0.25,
    emissive: new Color(PALETTE.gold).multiplyScalar(0.12),
  });
  const glowMaterial = new MeshStandardMaterial({
    color: PALETTE.glow,
    emissive: new Color(PALETTE.glow),
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });

  const root = new Group();
  root.rotation.y = 0.16;
  scene.add(root);

  // ---- Body ----------------------------------------------------------------
  const body = new Mesh(new SphereGeometry(1.02, 40, 32), shellMaterial);
  body.scale.set(1.12, 0.6, 0.86);
  body.position.y = -1.9;
  root.add(body);

  const collar = new Mesh(new CylinderGeometry(0.4, 0.46, 0.34, 28), navyMaterial);
  collar.position.y = -1.12;
  root.add(collar);

  // ---- Head ----------------------------------------------------------------
  const head = new Group();
  head.position.y = 0.05;
  root.add(head);

  const skull = new Mesh(new RoundedBoxGeometry(2.35, 2.05, 1.75, 6, 0.52), shellMaterial);
  head.add(skull);

  // The face screen sits proud of the shell so the bezel reads as a rim.
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = FACE_SIZE;
  faceCanvas.height = FACE_SIZE;
  const faceCtx = faceCanvas.getContext("2d")!;
  const faceTexture = new CanvasTexture(faceCanvas);
  faceTexture.colorSpace = SRGBColorSpace;
  const screenMaterial = new MeshStandardMaterial({
    map: faceTexture,
    emissiveMap: faceTexture,
    emissive: 0xffffff,
    emissiveIntensity: 1.25,
    roughness: 0.22,
    metalness: 0,
  });
  const screen = new Mesh(new RoundedBoxGeometry(1.82, 1.5, 0.12, 5, 0.34), screenMaterial);
  screen.position.z = 0.84;
  head.add(screen);

  // ---- Ears ----------------------------------------------------------------
  const ears: Mesh[] = [];
  for (const side of [-1, 1]) {
    // A shallow white housing with a glowing ring on its outer face, the way
    // the character sheet draws the ears.
    const housing = new Mesh(new CylinderGeometry(0.38, 0.34, 0.26, 32), shellMaterial);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(side * 1.2, -0.06, 0.18);
    head.add(housing);

    const socket = new Mesh(new CylinderGeometry(0.27, 0.27, 0.06, 28), navyMaterial);
    socket.rotation.z = Math.PI / 2;
    socket.position.set(side * 1.33, -0.06, 0.18);
    head.add(socket);

    const ring = new Mesh(new TorusGeometry(0.2, 0.072, 16, 36), glowMaterial.clone());
    ring.position.set(side * 1.36, -0.06, 0.18);
    ring.rotation.y = Math.PI / 2;
    head.add(ring);
    ears.push(ring);
  }

  // ---- Mortarboard ---------------------------------------------------------
  const cap = new Group();
  cap.position.y = 1.02;
  head.add(cap);

  const capBase = new Mesh(new CylinderGeometry(0.56, 0.78, 0.3, 28), navyMaterial);
  capBase.position.y = 0.12;
  cap.add(capBase);

  const board = new Mesh(new RoundedBoxGeometry(2.5, 0.12, 2.5, 3, 0.06), navyMaterial);
  board.position.y = 0.33;
  board.rotation.x = -0.09;
  board.rotation.z = 0.05;
  cap.add(board);

  const button = new Mesh(new SphereGeometry(0.09, 16, 12), navyMaterial);
  button.position.y = 0.42;
  cap.add(button);

  // Tassel: a cord and a tuft on a spring, so it swings when the head moves.
  const tassel = new Group();
  tassel.position.set(1.06, 0.3, 1.02);
  cap.add(tassel);
  const cord = new Mesh(new CylinderGeometry(0.032, 0.032, 0.86, 10), goldMaterial);
  cord.position.y = -0.43;
  tassel.add(cord);
  const knot = new Mesh(new SphereGeometry(0.075, 14, 10), goldMaterial);
  knot.position.y = -0.86;
  tassel.add(knot);
  const tuft = new Mesh(new CylinderGeometry(0.1, 0.17, 0.46, 16), goldMaterial);
  tuft.position.y = -1.14;
  tassel.add(tuft);

  // ---- Halo ----------------------------------------------------------------
  const halo = new Mesh(
    new TorusGeometry(2.55, 0.022, 10, 90),
    new MeshStandardMaterial({
      color: PALETTE.glow,
      emissive: new Color(PALETTE.glow),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0,
    }),
  );
  halo.position.y = 0.05;
  root.add(halo);

  // ---- Animation state -----------------------------------------------------
  let state: VirgilState = "idle";
  let mouth = 0;
  let lid = 1;
  let blinkAt = 1.6;
  let tasselVel = 0;
  let tasselAngle = 0;
  let lastHeadRot = 0;
  let faceDirty = true;
  let lastFaceDraw = 0;
  let lastMouthDrawn = -1;
  let lastLidDrawn = -1;
  let lastModeDrawn = "";

  const faceMode = (): FaceParams["mode"] =>
    state === "error" ? "error" : state === "muted" ? "rest" : state === "listening" ? "alert" : "happy";

  function frame(energy: number, now: number) {
    const t = now / 1000;
    const speaking = state === "speaking";
    const target = speaking ? energy : 0;
    // Mouth chases the envelope quickly on the way open and relaxes slowly,
    // which is how a jaw actually behaves.
    mouth += (target - mouth) * (target > mouth ? 0.55 : 0.16);

    // Blink on an irregular schedule; a metronome blink looks synthetic.
    if (!reduced && state !== "muted") {
      if (t > blinkAt) {
        lid = 0.04;
        blinkAt = t + 2.4 + Math.random() * 4.2;
      } else {
        lid += (1 - lid) * 0.24;
      }
    } else if (state === "muted") {
      lid += (0.05 - lid) * 0.2;
    }

    // Head: a slow breathing drift, a lift on loud syllables, and a tilt when
    // she is taking something in.
    const bob = reduced ? 0 : Math.sin(t * 1.15) * 0.045;
    const sway = reduced ? 0 : Math.sin(t * 0.72) * 0.07;
    const listenTilt = state === "listening" ? 0.16 : 0;
    head.position.y = 0.05 + bob + mouth * 0.05;
    head.rotation.y = sway * 1.4 + (state === "connecting" && !reduced ? Math.sin(t * 2.4) * 0.1 : 0);
    head.rotation.z += (listenTilt - head.rotation.z) * 0.08;
    head.rotation.x += ((state === "muted" ? 0.14 : -mouth * 0.05) - head.rotation.x) * 0.1;
    body.position.y = -1.9 + bob * 0.4;
    body.scale.x = 1.12 + Math.sin(t * 1.15) * 0.01;

    // Tassel: a damped spring driven by how fast the head is turning.
    if (!reduced) {
      const delta = head.rotation.y - lastHeadRot;
      lastHeadRot = head.rotation.y;
      tasselVel += -tasselAngle * 0.05 - delta * 7;
      tasselVel *= 0.9;
      tasselAngle += tasselVel;
      tasselAngle = MathUtils.clamp(tasselAngle, -0.7, 0.7);
      tassel.rotation.z = tasselAngle;
      tassel.rotation.x = Math.sin(t * 0.9) * 0.05;
    }

    // Ears and halo carry the amplitude so the face can stay calm.
    const pulse = state === "listening" ? 0.5 + Math.sin(t * 3.4) * 0.28 : 0;
    for (const ear of ears) {
      const material = ear.material as MeshStandardMaterial;
      material.emissiveIntensity = 1.1 + energy * 2.4 + pulse;
    }
    faceLight.intensity = 0.55 + energy * 1.4;
    const haloMaterial = halo.material as MeshStandardMaterial;
    haloMaterial.opacity += ((speaking ? 0.18 + energy * 0.5 : 0) - haloMaterial.opacity) * 0.12;
    halo.rotation.z = t * 0.25;
    halo.scale.setScalar(1 + energy * 0.04);

    // Redraw the screen only when it would actually change, and never more
    // than ~40 times a second: the texture upload is the expensive part.
    const mode = faceMode();
    if (
      Math.abs(mouth - lastMouthDrawn) > 0.012 ||
      Math.abs(lid - lastLidDrawn) > 0.02 ||
      mode !== lastModeDrawn ||
      faceDirty
    ) {
      if (now - lastFaceDraw > 24) {
        drawFace(faceCtx, { lid, mouth, mode });
        faceTexture.needsUpdate = true;
        lastFaceDraw = now;
        lastMouthDrawn = mouth;
        lastLidDrawn = lid;
        lastModeDrawn = mode;
        faceDirty = false;
      }
    }

    // A whisper of parallax gives the scene depth without moving the subject.
    camera.position.x += (sway * 0.5 - camera.position.x) * 0.05;
    camera.lookAt(0, -0.15, 0);
    renderer.render(scene, camera);
  }

  function setState(next: VirgilState) {
    if (state === next) return;
    state = next;
    faceDirty = true;
    const error = next === "error";
    (screen.material as MeshStandardMaterial).emissiveIntensity = error ? 1.05 : 1.25;
    for (const ear of ears) {
      (ear.material as MeshStandardMaterial).color.set(error ? 0xffcf8a : PALETTE.glow);
      (ear.material as MeshStandardMaterial).emissive.set(error ? 0xffcf8a : PALETTE.glow);
    }
  }

  function resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
    });
    faceTexture.dispose();
    renderer.dispose();
  }

  drawFace(faceCtx, { lid: 1, mouth: 0, mode: "happy" });
  faceTexture.needsUpdate = true;

  return { frame, setState, resize, dispose };
}
