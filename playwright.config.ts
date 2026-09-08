import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5176",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --config tests/browser/vite.config.ts",
    url: "http://localhost:5176/tests/browser/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
