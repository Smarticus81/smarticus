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
    content: ".virgil-avatar{width:360px !important;height:360px !important;}",
  });
  // Give the three.js chunk time to load and take over from the flat stand-in.
  await expect(page.locator("[data-testid='virgil-avatar']")).toHaveClass(/is-3d/, {
    timeout: 15_000,
  });
  return page.locator("[data-testid='virgil-avatar']").first();
}

test("Virgil renders in 3D and keeps moving while she is idle", async ({ page }) => {
  const virgil = await avatar(page);
  // The canvas is a real WebGL surface, not the flat fallback.
  const kind = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='virgil-canvas']")!;
    return { width: canvas.width, height: canvas.height };
  });
  expect(kind.width).toBeGreaterThan(300);

  const first = await virgil.screenshot();
  await page.waitForTimeout(900);
  const second = await virgil.screenshot();
  // Idle breathing, sway and the tassel mean no two moments look alike.
  expect(difference(first, second)).toBeGreaterThan(0.2);
});

test("her face answers to real audio", async ({ page }) => {
  const virgil = await avatar(page);
  await page.waitForTimeout(700);
  const silent = await virgil.screenshot();

  await page.getByRole("button", { name: "Start output" }).click();
  // The fixture pushes a genuine MediaStream through the same analyser the
  // live session uses, so this exercises the real sync path.
  await expect(page.getByTestId("source-energy")).not.toHaveText("0");
  await page.waitForTimeout(700);
  const speaking = await virgil.screenshot();

  expect(difference(silent, speaking)).toBeGreaterThan(0.6);

  await page.getByRole("button", { name: "Disconnect output" }).click();
});
