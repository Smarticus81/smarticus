import { test, expect, type Page } from "@playwright/test";

/** Mean absolute pixel difference between two PNG screenshots, 0…255. */
function difference(a: Buffer, b: Buffer): number {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < length; i++) total += Math.abs(a[i] - b[i]);
  return total / length;
}

async function avatar(page: Page) {
  await page.goto("/tests/browser/index.html?fixture=avatar");
  await page.waitForSelector("[data-testid='virgil-avatar']");
  await page.addStyleTag({
    content: ".virgil-avatar{width:360px !important;height:380px !important;}",
  });
  await expect(page.locator("[data-testid='virgil-avatar']")).toHaveClass(/is-live/);
  return page.locator("[data-testid='virgil-avatar']").first();
}

async function setState(page: Page, state: string) {
  await page.getByTestId("avatar-state").selectOption(state);
  await expect(page.getByTestId("virgil-avatar")).toHaveAttribute("data-state", state);
  // Expressions ease in over a few hundred milliseconds.
  await page.waitForTimeout(600);
}

/** The transform the rig last wrote to a part. */
async function transformOf(page: Page, part: string): Promise<string> {
  return page.evaluate((name) => document.querySelector(`[data-part="${name}"]`)?.getAttribute("transform") ?? "", part);
}

async function opacityOf(page: Page, part: string): Promise<number> {
  return page.evaluate(
    (name) => Number((document.querySelector(`[data-part="${name}"]`) as HTMLElement | null)?.style.opacity ?? "0"),
    part,
  );
}

test("Virgil is a drawn character who keeps moving while idle", async ({ page }) => {
  const virgil = await avatar(page);
  const figure = page.getByTestId("virgil-figure");
  await expect(figure).toBeVisible();
  // Every part the rig animates is in the drawing.
  for (const part of ["head", "brow-left", "brow-right", "pupil-left", "pupil-right", "lid-left", "mouth", "arm-left", "arm-right", "hair", "tassel", "thought", "sweat"]) {
    await expect(page.locator(`[data-part="${part}"]`)).toHaveCount(1);
  }

  const first = await virgil.screenshot();
  await page.waitForTimeout(900);
  const second = await virgil.screenshot();
  // Breathing, sway and wandering eyes mean no two moments look alike.
  expect(difference(first, second)).toBeGreaterThan(0.2);
  const headBefore = await transformOf(page, "head");
  await page.waitForTimeout(400);
  expect(await transformOf(page, "head")).not.toBe(headBefore);
});

test("his mouth answers to real audio", async ({ page }) => {
  const virgil = await avatar(page);
  await page.waitForTimeout(700);
  const silent = await virgil.screenshot();
  const mouthShut = await page.evaluate(() => document.querySelector('[data-part="mouth"]')!.getAttribute("d"));

  await page.getByRole("button", { name: "Start output" }).click();
  // The fixture pushes a genuine MediaStream through the same analyser the
  // live session uses, so this exercises the real sync path.
  await expect(page.getByTestId("source-energy")).not.toHaveText("0");
  await page.waitForTimeout(700);
  const speaking = await virgil.screenshot();
  const mouthOpen = await page.evaluate(() => document.querySelector('[data-part="mouth"]')!.getAttribute("d"));

  expect(difference(silent, speaking)).toBeGreaterThan(0.6);
  expect(mouthOpen).not.toBe(mouthShut);
  expect(await opacityOf(page, "ripple-left")).toBeGreaterThan(0.1);

  await page.getByRole("button", { name: "Disconnect output" }).click();
});

test("each state has its own face: thinking, error, muted, listening", async ({ page }) => {
  const virgil = await avatar(page);
  await setState(page, "idle");
  const idle = await virgil.screenshot();
  expect(await opacityOf(page, "thought")).toBeLessThan(0.05);
  expect(await opacityOf(page, "sweat")).toBeLessThan(0.05);

  await setState(page, "thinking");
  const thinking = await virgil.screenshot();
  expect(await opacityOf(page, "thought")).toBeGreaterThan(0.9);
  // Hand to the chin: the left arm swings up from its resting rotation.
  expect(await transformOf(page, "arm-left")).toMatch(/rotate\(-(9\d|10\d)\./);
  expect(difference(idle, thinking)).toBeGreaterThan(0.8);

  await setState(page, "error");
  expect(await opacityOf(page, "sweat")).toBeGreaterThan(0.9);
  expect(await opacityOf(page, "thought")).toBeLessThan(0.05);
  const error = await virgil.screenshot();
  expect(difference(thinking, error)).toBeGreaterThan(0.8);

  await setState(page, "muted");
  // Eyes closed: the upper lids travel down over the whites.
  const lid = await transformOf(page, "lid-left");
  expect(Number(/translate\(0 ([\d.]+)\)/.exec(lid)?.[1])).toBeGreaterThan(50);

  await setState(page, "listening");
  expect(Number(/translate\(0 ([\d.]+)\)/.exec(await transformOf(page, "lid-left"))?.[1])).toBeLessThan(5);
  const listening = await virgil.screenshot();
  expect(difference(error, listening)).toBeGreaterThan(0.8);
});

test("his eyes follow the pointer and a poke makes him bounce", async ({ page }) => {
  const virgil = await avatar(page);
  await setState(page, "listening");
  const box = (await virgil.boundingBox())!;
  await page.mouse.move(box.x - 300, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const left = await transformOf(page, "pupil-left");
  await page.mouse.move(box.x + box.width + 300, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const right = await transformOf(page, "pupil-left");
  const x = (t: string) => Number(/translate\((-?[\d.]+)/.exec(t)?.[1]);
  expect(x(left)).toBeLessThan(-4);
  expect(x(right)).toBeGreaterThan(4);

  const scaleY = (t: string) => Number(/scale\([\d.]+ ([\d.]+)\)/.exec(t)?.[1]);
  expect(scaleY(await transformOf(page, "figure"))).toBeCloseTo(1, 2);
  await virgil.click({ position: { x: box.width / 2, y: box.height / 2 } });
  // A squash on a spring: sample through the bounce rather than one instant.
  const seen: number[] = [];
  for (let i = 0; i < 8; i++) {
    seen.push(scaleY(await transformOf(page, "figure")));
    await page.waitForTimeout(50);
  }
  expect(Math.min(...seen)).toBeLessThan(0.93);
});

test("with reduced motion he holds still but still changes his face", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const virgil = await avatar(page);
  await expect(virgil).toHaveAttribute("data-reduced-motion", "true");
  await page.waitForTimeout(500);
  const first = await virgil.screenshot();
  await page.waitForTimeout(900);
  const second = await virgil.screenshot();
  expect(difference(first, second)).toBeLessThan(0.05);

  await setState(page, "thinking");
  expect(await opacityOf(page, "thought")).toBeGreaterThan(0.9);
  const thinking = await virgil.screenshot();
  expect(difference(first, thinking)).toBeGreaterThan(0.8);
});
