import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const productionSmokeLeagueId = "63";

test("squad controls stay usable without page-level horizontal clipping", async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);

  await page.goto(`/machete/squad?leagueId=${productionSmokeLeagueId}`);
  await expect(page.getByRole("heading", { name: /Squad planner/i })).toBeVisible();
  await expect(page.locator("[data-fantasy-squad-planner]")).toHaveAttribute("data-league-id", productionSmokeLeagueId);
  await expect(page.getByRole("button", { name: /Auto-pick squad/i })).toBeEnabled({ timeout: 30_000 });

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);

  if (testInfo.project.name === "desktop-chromium") {
    const controls = [
      page.getByRole("button", { name: /Save squad/i }),
      page.getByRole("button", { name: /Auto-pick squad/i }),
      page.getByText("More actions", { exact: true })
    ];
    await assertVisibleControlsDoNotOverlap(controls);
    await page.getByText("More actions", { exact: true }).click();
    await expect(page.getByRole("button", { name: /Auto-pick XI/i })).toBeVisible();
    await page.getByText("More actions", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: /Search by player name/i })).toBeVisible();
  } else {
    const poolTab = page.getByRole("radio", { name: /Pool/i });
    await expect(poolTab).toBeVisible();
    await assertInsideViewport(poolTab, page);
    await poolTab.click();
    await expect(page.getByRole("textbox", { name: /Search by player name/i })).toBeVisible();

    const header = page.getByRole("banner");
    const menu = header.getByText("Menu", { exact: true });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole("link", { name: /Players/i }).last()).toBeVisible();
    await expect(header.getByRole("button", { name: /Sign out/i }).last()).toBeVisible();
    await assertInsideViewport(menu, page);
    await menu.click();
    await expect(header.getByRole("button", { name: /Sign out/i }).last()).toBeHidden();

    if (testInfo.project.name === "mobile-chromium") {
      await expect(page.getByTestId("player-pool-mobile")).toBeVisible();
      await expect(page.getByTestId("player-pool-table")).toBeHidden();
    }
  }

  expect(failures.pageErrors, failures.pageErrors.join("\n")).toEqual([]);
  expect(failures.serverErrors, failures.serverErrors.join("\n")).toEqual([]);
  await attachViewportScreenshot(page, testInfo);
});

function captureRuntimeFailures(page: Page) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  return { pageErrors, serverErrors };
}

async function assertVisibleControlsDoNotOverlap(locators: Locator[]) {
  const boxes = [];
  for (const locator of locators) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    if (box) boxes.push(box);
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];
      const overlapWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
      const overlapHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
      expect(overlapWidth * overlapHeight).toBe(0);
    }
  }
}

async function assertInsideViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function attachViewportScreenshot(page: Page, testInfo: TestInfo) {
  const path = testInfo.outputPath(`squad-${testInfo.project.name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await testInfo.attach(`squad-${testInfo.project.name}`, { path, contentType: "image/png" });
}
