import { test, expect, type Page } from "@playwright/test";
import type { VirgilPose } from "../../client/src/voice/virgilAnimator";

/** Mean absolute pixel difference between two PNG screenshots, 0…255. */
function difference(a: Buffer, b: Buffer): number {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < length; i++) total += Math.abs(a[i] - b[i]);
  return total / length;
}

type Body = "3d" | "svg";

async function avatar(page: Page, body: Body) {
  await page.goto(`/tests/browser/index.html?fixture=avatar${body === "svg" ? "&renderer=svg" : ""}`);
  await page.waitForSelector("[data-testid='virgil-avatar']");
  await page.addStyleTag({
    content: ".virgil-avatar{width:360px !important;height:380px !important;}",
  });
  const host = page.locator("[data-testid='virgil-avatar']").first();
  // The drawing is up at once; the 3D scene loads its chunk and takes over.
  await expect(host).toHaveClass(body === "3d" ? /is-3d/ : /is-drawn/, { timeout: 15_000 });
  await expect(host).toHaveClass(/is-live/);
  return host;
}

async function setState(page: Page, state: string) {
  await page.getByTestId("avatar-state").selectOption(state);
  await expect(page.getByTestId("virgil-avatar")).toHaveAttribute("data-state", state);
  // Expressions ease in over a few hundred milliseconds.
  await page.waitForTimeout(700);
}

/** The pose the body last drew, left on the element by the component. */
async function poseOf(page: Page): Promise<VirgilPose> {
  return page.evaluate(
    () => (document.querySelector("[data-testid='virgil-avatar']") as HTMLElement & { __virgilPose?: VirgilPose }).__virgilPose!,
  );
}

/** Sample the pose through a gesture, which only lasts a second or so. */
async function poses(page: Page, count: number, everyMs: number): Promise<VirgilPose[]> {
  const seen: VirgilPose[] = [];
  for (let i = 0; i < count; i++) {
    seen.push(await poseOf(page));
    await page.waitForTimeout(everyMs);
  }
  return seen;
}

for (const body of ["3d", "svg"] as Body[]) {
  test.describe(`Virgil in ${body}`, () => {
    test("keeps moving while idle", async ({ page }) => {
      const virgil = await avatar(page, body);
      const first = await virgil.screenshot();
      await page.waitForTimeout(900);
      const second = await virgil.screenshot();
      // Breathing, sway and wandering eyes mean no two moments look alike.
      expect(difference(first, second)).toBeGreaterThan(0.2);
      const a = await poseOf(page);
      await page.waitForTimeout(300);
      const b = await poseOf(page);
      expect(a.headY).not.toBe(b.headY);
    });

    test("holds still under reduced motion but still changes his face", async ({ page }) => {
      // The preference is read when the page loads, as a person's would be.
      await page.emulateMedia({ reducedMotion: "reduce" });
      const virgil = await avatar(page, body);
      await expect(virgil).toHaveAttribute("data-reduced-motion", "true");
      await page.waitForTimeout(500);
      const stillA = await virgil.screenshot();
      await page.waitForTimeout(900);
      const stillB = await virgil.screenshot();
      expect(difference(stillA, stillB)).toBeLessThan(0.05);
      await setState(page, "thinking");
      expect((await poseOf(page)).thought).toBeGreaterThan(0.9);
      expect(difference(stillA, await virgil.screenshot())).toBeGreaterThan(0.8);
    });

    test("his mouth answers to real audio", async ({ page }) => {
      const virgil = await avatar(page, body);
      await page.waitForTimeout(700);
      const silent = await virgil.screenshot();
      expect((await poseOf(page)).mouthOpen).toBeLessThan(0.05);

      await page.getByRole("button", { name: "Start output" }).click();
      // The fixture pushes a genuine MediaStream through the same analyser the
      // live session uses, so this exercises the real sync path.
      await expect(page.getByTestId("source-energy")).not.toHaveText("0");
      await page.waitForTimeout(700);
      const speaking = await virgil.screenshot();
      const pose = await poseOf(page);
      expect(pose.state).toBe("speaking");
      expect(pose.mouthOpen).toBeGreaterThan(0.2);
      expect(pose.ripple).toBeGreaterThan(0.1);
      expect(difference(silent, speaking)).toBeGreaterThan(0.6);

      await page.getByRole("button", { name: "Disconnect output" }).click();
    });

    test("each state has its own face", async ({ page }) => {
      const virgil = await avatar(page, body);
      await setState(page, "idle");
      const idle = await virgil.screenshot();
      const idlePose = await poseOf(page);
      expect(idlePose.thought).toBeLessThan(0.05);
      expect(idlePose.sweat).toBeLessThan(0.05);

      await setState(page, "thinking");
      const thinking = await poseOf(page);
      expect(thinking.thought).toBeGreaterThan(0.9);
      // Hand to the chin: the left arm swings up from rest.
      expect(thinking.armLeft).toBeLessThan(-80);
      expect(thinking.gazeX).toBeGreaterThan(0.3);
      expect(difference(idle, await virgil.screenshot())).toBeGreaterThan(0.8);

      await setState(page, "error");
      const error = await poseOf(page);
      expect(error.sweat).toBeGreaterThan(0.9);
      expect(error.smile).toBeLessThan(0);
      expect(error.armLeft).toBeGreaterThan(15);

      await setState(page, "muted");
      await page.waitForTimeout(600);
      const muted = await poseOf(page);
      expect(muted.lidOpen).toBeLessThan(0.2);
      expect(muted.closedLine).toBeGreaterThan(0.5);
      const mutedShot = await virgil.screenshot();

      await setState(page, "listening");
      const listening = await poseOf(page);
      expect(listening.lidOpen).toBeGreaterThan(0.9);
      expect(Math.abs(listening.tilt)).toBeGreaterThan(3);
      expect(difference(mutedShot, await virgil.screenshot())).toBeGreaterThan(0.5);
    });

    test("he waves hello, cheers, follows the pointer and bounces when poked", async ({ page }) => {
      const virgil = await avatar(page, body);
      await setState(page, "idle");
      // A session coming alive: idle to listening brings a wave.
      await page.getByTestId("avatar-state").selectOption("listening");
      const wave = await poses(page, 6, 120);
      expect(wave.some((p) => p.gesture === "wave")).toBe(true);
      expect(Math.min(...wave.map((p) => p.armRight))).toBeLessThan(-60);
      await page.waitForTimeout(1800);

      await page.getByRole("button", { name: "Cheer" }).click();
      const cheer = await poses(page, 6, 120);
      expect(cheer.some((p) => p.gesture === "cheer")).toBe(true);
      expect(Math.max(...cheer.map((p) => p.armLeft))).toBeGreaterThan(60);
      expect(Math.min(...cheer.map((p) => p.armRight))).toBeLessThan(-60);
      await page.waitForTimeout(1600);

      const box = (await virgil.boundingBox())!;
      await page.mouse.move(Math.max(0, box.x - 300), box.y + box.height / 2);
      await page.waitForTimeout(400);
      const left = await poseOf(page);
      await page.mouse.move(box.x + box.width + 300, box.y + box.height / 2);
      await page.waitForTimeout(400);
      const right = await poseOf(page);
      expect(left.gazeX).toBeLessThan(-0.3);
      expect(right.gazeX).toBeGreaterThan(0.3);
      expect(right.turnX).toBeGreaterThan(left.turnX);

      await virgil.click({ position: { x: box.width / 2, y: box.height / 2 } });
      // A squash on a spring: sample through the bounce rather than one instant.
      const poke = await poses(page, 8, 50);
      expect(poke.some((p) => p.gesture === "poke")).toBe(true);
      expect(Math.min(...poke.map((p) => p.squash))).toBeLessThan(-0.07);
    });
  });
}

test("the drawing has every part the rig moves", async ({ page }) => {
  await avatar(page, "svg");
  await expect(page.getByTestId("virgil-figure")).toBeVisible();
  for (const part of ["head", "brow-left", "brow-right", "pupil-left", "pupil-right", "lid-left", "mouth", "arm-left", "arm-right", "hair", "tassel", "thought", "sweat"]) {
    await expect(page.locator(`[data-part="${part}"]`)).toHaveCount(1);
  }
  await setState(page, "muted");
  await page.waitForTimeout(600);
  // Eyes closed: the upper lids travel down over the whites.
  const lid = await page.evaluate(() => document.querySelector('[data-part="lid-left"]')?.getAttribute("transform") ?? "");
  expect(Number(/translate\(0 ([\d.]+)\)/.exec(lid)?.[1])).toBeGreaterThan(50);
});

test("the 3D body draws into a real WebGL canvas", async ({ page }) => {
  await avatar(page, "3d");
  const canvas = page.getByTestId("virgil-canvas");
  await expect(canvas).toBeVisible();
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  expect(size.width).toBeGreaterThan(300);
  await expect(page.getByTestId("virgil-figure")).toHaveCount(0);
});
