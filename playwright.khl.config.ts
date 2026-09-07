import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["khl.spec.ts", "khl-design.spec.ts"], workers: 1, retries: 0,
  outputDir: "output/playwright-khl", reporter: "line",
  use: { baseURL: "http://127.0.0.1:3107", channel: "msedge", storageState: "output/playwright-auth/khl-local.json", screenshot: "only-on-failure", trace: "off" },
  projects: [360, 390, 768, 1024, 1440].map(width => ({ name: `khl-${width}`, use: { viewport: { width, height: 1000 } } }))
});
