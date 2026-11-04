/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
// Repeatable read-only baseline: git show supplies the four original client files.
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
  try {
    const page = await browser.newPage({ ...devices["Pixel 5"], viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => new URL(route.request().url()).origin === fixture.url ? route.continue() : route.abort());
    await page.goto(fixture.url);
    const add = page.getByTestId("native-table").getByRole("button", { name: "Add", exact: true });
    await add.focus();
    await add.press("Enter");
    await add.press("Space");
    const keyboardCounts = await page.getByTestId("counts").textContent();
    await add.click();
    const pointerCounts = await page.getByTestId("counts").textContent();
    const trigger = page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true });
    await trigger.click();
    const touch = page.getByRole("dialog", { name: "Fixture Player 1", exact: true });
    await touch.getByRole("button", { name: "Close player actions" }).press("Shift+Tab");
    const backwardContained = await touch.evaluate((dialog) => dialog.contains(document.activeElement));
    await touch.getByRole("button", { name: "Remove from squad" }).press("Tab");
    const forwardContained = await touch.evaluate((dialog) => dialog.contains(document.activeElement));
    await page.keyboard.press("Escape");
    const restoredTouchTrigger = await trigger.evaluate((element) => element === document.activeElement);
    await page.getByRole("button", { name: "Open command palette" }).click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("button", { name: "Close", exact: true }).press("Escape");
    const escapeFromPaletteButtonClosed = await palette.count() === 0;
    const primaryTooltip = await page.getByTestId("primary-tooltip-probe").textContent();
    const alternativeTooltipRu3 = await page.getByTestId("alternative-tooltip-probe").textContent();
    const evidence = { revision, keyboardCounts, pointerCounts, backwardContained, forwardContained, restoredTouchTrigger, escapeFromPaletteButtonClosed, primaryTooltip, alternativeTooltipRu3, runtimeErrors: errors };
    assert.match(keyboardCounts, /add:0/);
    assert.match(pointerCounts, /add:1/);
    assert.equal(backwardContained, false);
    assert.equal(forwardContained, false);
    assert.equal(restoredTouchTrigger, false);
    assert.equal(escapeFromPaletteButtonClosed, false);
    assert.match(primaryTooltip, /Round 1: 4 FP/);
    assert.match(alternativeTooltipRu3, /пять/);
    assert.deepEqual(errors, []);
    await writeFile(join(__dirname, "before.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
    await fixture.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
