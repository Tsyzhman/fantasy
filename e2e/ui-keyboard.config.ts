/** @spec spec://common/PROP-002-editorial-sport-design#checklist */
import { defineConfig, devices } from "@playwright/test";

// No auth-setup, Next server, credentials or database: only the real client components.
export default defineConfig({
  testDir: ".",
  testMatch: "ui-keyboard.spec.ts",
  outputDir: "../output/playwright/ui-keyboard-results",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 3_000 },
  reporter: "line",
  use: { channel: process.env.PLAYWRIGHT_CHANNEL as "msedge" | "chrome" | undefined, screenshot: "only-on-failure", trace: "off" },
  projects: [
    { name: "mobile-320", use: { ...devices["Pixel 5"], viewport: { width: 320, height: 740 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "tablet-1024", use: { viewport: { width: 1024, height: 900 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "desktop-1920", use: { viewport: { width: 1920, height: 1080 } } }
  ]
});
