import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["squad-journey.spec.ts", "squad-responsive.spec.ts"], workers: 1, retries: 0,
  timeout: 60000, expect: { timeout: 15000 }, outputDir: "output/playwright-khl-regression", reporter: "line",
  use: { baseURL: "http://127.0.0.1:3107", channel: "msedge", locale: "en-US", storageState: "output/playwright-auth/khl-local.json", screenshot: "only-on-failure", trace: "off" },
  projects: [{ name: "desktop-chromium", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile-chromium", use: { viewport: { width: 390, height: 1000 } } }]
});
