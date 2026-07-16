import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const authStatePath = "output/playwright-auth/qa-user.json";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright-test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: "playwright-report", open: "never" }]
      ]
    : "line",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL as "chrome" | "msedge" | undefined,
    colorScheme: "light",
    locale: "en-US",
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off"
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /.*\.setup\.ts/,
      use: {
        screenshot: "off"
      }
    },
    {
      name: "desktop-chromium",
      dependencies: ["auth-setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: "tablet-chromium",
      dependencies: ["auth-setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
        viewport: { width: 1024, height: 900 }
      }
    },
    {
      name: "mobile-chromium",
      dependencies: ["auth-setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Pixel 5"],
        storageState: authStatePath
      }
    }
  ]
});
