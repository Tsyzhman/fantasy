/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
require("tsx/cjs");
const assert = require("node:assert/strict");
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium, devices } = require("@playwright/test");
const { startKeyboardFixture } = require("../../../../e2e/fixtures/ui-keyboard.server.ts");

async function main() {
  const revision = process.argv[2];
  if (!revision) throw new Error("Pass the original Git revision");
  const fixture = await startKeyboardFixture(revision);
  const browser = await chromium.launch({ channel: "msedge" });
  const cases = [];
  try {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ ...devices["Pixel 5"], viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin === fixture.url ? route.continue() : route.abort());
      await page.goto(`${fixture.url}/?mobileSort=football`);
      await page.getByTestId("player-pool-mobile").waitFor({ state: "visible" });
      const sortControlCount = await page.getByTestId("player-pool-sort").count();
      const cardCount = await page.getByTestId("player-pool-mobile").locator("article").count();
      const desktopTableCount = await page.getByTestId("player-pool-table").count();
      assert.equal(sortControlCount, 0);
      assert.equal(cardCount, 18);
      assert.equal(desktopTableCount, 0);
      assert.deepEqual(errors, []);
      cases.push({ width, coarsePointer: await page.evaluate(() => matchMedia("(pointer:coarse)").matches), sortControlCount, cardCount, desktopTableCount, runtimeErrors: errors });
      await context.close();
    }
    const result = { revision, cases };
    await writeFile(join(__dirname, "before.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    await fixture.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
