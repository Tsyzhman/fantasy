/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startKeyboardFixture } from "./fixtures/ui-keyboard.server";

let fixture: Awaited<ReturnType<typeof startKeyboardFixture>>;
const runtimeErrors = new WeakMap<Page, string[]>();
const evidenceDirectory = process.env.UI_KEYBOARD_EVIDENCE_DIR ?? "output/playwright/ui-keyboard";

test.beforeAll(async () => {
  fixture = await startKeyboardFixture(process.env.UI_KEYBOARD_SOURCE_REVISION);
  await mkdir(evidenceDirectory, { recursive: true });
});
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === fixture.url) return route.continue();
    errors.push(`Unexpected non-fixture request: ${route.request().url()}`);
    return route.abort();
  });
  await page.goto(fixture.url);
  await expect(page.locator("[data-fantasy-squad-planner]")).toBeVisible();
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test("body controls retain native keyboard activation", async ({ page }) => {
  const table = page.getByTestId("native-table");
  const counts = page.getByTestId("counts");
  for (const name of ["Add", "Remove"]) {
    const button = table.getByRole("button", { name, exact: true });
    await button.focus();
    await button.press("Enter");
    await button.press("Space");
  }
  await expect(counts).toHaveText("add:2 remove:2 header:0 submit:0");
  const checkbox = table.getByRole("checkbox", { name: "Selected" });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  const text = table.getByRole("textbox", { name: "Native text" });
  await text.fill("Name");
  await text.press("Space");
  await expect(text).toHaveValue("Name ");
  await text.press("Enter");
  await expect(counts).toHaveText("add:2 remove:2 header:0 submit:1");
  await table.getByRole("link", { name: "Player details" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#link-activated$/);
});

test("header sorting ignores nested controls and preserves keyboard resizing", async ({ page }) => {
  const table = page.getByTestId("native-table");
  const header = table.locator("thead th").first();
  const nested = table.getByRole("button", { name: "Header action" });
  await nested.click();
  await nested.press("Enter");
  await nested.press("Space");
  await expect(page.getByTestId("counts")).toContainText("header:3");
  await expect(header).toHaveAttribute("aria-sort", "none");
  const resizer = table.getByRole("separator");
  await resizer.focus();
  for (const [key, width] of [["ArrowRight", 108], ["Shift+ArrowRight", 140], ["Home", 40], ["End", 640], ["Enter", 100]] as const) {
    await resizer.press(key);
    await expect(resizer).toHaveAttribute("aria-valuenow", String(width));
    await expect(header).toHaveAttribute("aria-sort", "none");
  }
  await resizer.press("Space");
  await expect(header).toHaveAttribute("aria-sort", "none");
  await header.focus();
  await header.press("Enter");
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(table.locator("tbody tr[data-row]").first()).toHaveAttribute("data-row", "A");
  await header.press("Space");
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(table.locator("tbody tr[data-row]").first()).toHaveAttribute("data-row", "B");
  const disabledHeader = table.locator("thead th").last();
  expect(await disabledHeader.getAttribute("tabindex")).toBeNull();
});

test("managed and server header sorting still use Enter and Space", async ({ page }) => {
  const managed = page.getByTestId("managed-table").getByRole("columnheader");
  await managed.focus();
  await managed.press("Enter");
  await expect(managed).toHaveAttribute("aria-sort", "descending");
  await managed.press("Space");
  await expect(managed).toHaveAttribute("aria-sort", "ascending");
  await page.goto(`${fixture.url}/?page=3`);
  const server = page.getByTestId("server-table").getByRole("columnheader");
  await server.focus();
  await server.press("Enter");
  await expect(page).toHaveURL(`${fixture.url}/?fixtureSort=points%3Aasc`);
  await expect(page.getByTestId("server-table").getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
  await page.getByTestId("server-table").getByRole("columnheader").focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(`${fixture.url}/?fixtureSort=points%3Adesc`);
});

test("palette wraps dynamic results, closes Escape from a button and restores its trigger", async ({ page }) => {
  const outside = page.getByRole("textbox", { name: "Outside input" });
  await outside.focus();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const search = palette.getByPlaceholder("Search pages");
  await expect(search).toBeFocused();
  await search.press("Shift+Tab");
  await expect(palette.getByRole("button").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await palette.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(outside).toBeFocused();
  const opener = page.getByRole("button", { name: "Open command palette" });
  await opener.click();
  await search.fill("no-matching-fixture-result");
  const close = palette.getByRole("button", { name: "Close", exact: true });
  await search.press("Shift+Tab");
  await expect(close).toBeFocused();
  await close.press("Tab");
  await expect(search).toBeFocused();
  await outside.evaluate((element) => element.focus());
  await expect(search).toBeFocused();
  await close.click();
  await expect(opener).toBeFocused();
  await opener.press("Enter");
  await palette.getByRole("button", { name: /Home.*Shell/ }).click();
  await expect(page.locator("#navigation-result")).toHaveText("/");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("touch dialog wraps both directions, returns focus and survives a removed trigger", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1280, "Desktop uses the existing pitch UI");
  const trigger = page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Fixture Player 1", exact: true });
  const close = dialog.getByRole("button", { name: "Close player actions" });
  const remove = dialog.getByRole("button", { name: "Remove from squad" });
  await expect(close).toBeFocused();
  await close.press("Shift+Tab");
  await expect(remove).toBeFocused();
  await remove.press("Tab");
  await expect(close).toBeFocused();
  await dialog.getByRole("button", { name: "Swap XI / bench", exact: false }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Space");
  await expect(close).toBeFocused();
  await close.click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await remove.click();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByTestId("squad-touch-roster").getByRole("button", { name: /^Actions for/ }).first()).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

for (const language of ["en", "ru"] as const) {
  test(`touch replacement hands focus to visible name search: ${language}`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1280, "Desktop uses the existing pitch UI");
    await setLanguage(page, language);
    const trigger = page.getByRole("button", { name: language === "en" ? "Actions for Fixture Player 1" : "Действия для Fixture Player 1", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Fixture Player 1", exact: true });
    await dialog.getByRole("button", { name: language === "en" ? /Find a replacement/ : /Найти замену/ }).press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("pool-replacement-banner")).toBeVisible();
    const search = page.getByRole("textbox", { name: language === "en" ? "Search by player name" : "Поиск по имени игрока" });
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
    await search.press("Escape");
    await expect(page.getByTestId("pool-replacement-banner")).toHaveCount(0);
  });
}

test("lineup replacement focuses the next step", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1280, "Desktop uses the existing pitch UI");
  await page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Swap XI \/ bench/ }).click();
  await expect(page.getByTestId("lineup-replacement-panel")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("lineup-replacement-panel").getByRole("button", { name: "Cancel" })).toBeFocused();
});

test("replacement during pool loading uses a visible focus fallback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "One mobile loading-state regression is sufficient");
  let releaseRequest = () => {};
  const released = new Promise<void>((resolveReleased) => { releaseRequest = resolveReleased; });
  await page.route("**/api/fixture-pool**", async (route) => { await released; await route.abort(); });
  try {
    await page.goto(`${fixture.url}/?pendingPool=1`);
    await page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Find a replacement/ }).click();
    const section = page.getByTestId("pool-replacement-banner").locator("..");
    await expect(section).toBeVisible();
    await expect(section).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Search by player name" })).toHaveCount(0);
    await expect(section.getByRole("status").last()).toContainText("Loading player pool");
  } finally {
    releaseRequest();
  }
});

test("repeated palette cycles release document listeners and bound heap growth", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "One browser lifecycle measurement is sufficient");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const documentObject = await cdp.send("Runtime.evaluate", { expression: "document" });
  const objectId = documentObject.result.objectId!;
  async function sample() {
    await cdp.send("HeapProfiler.collectGarbage");
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId });
    const { metrics } = await cdp.send("Performance.getMetrics");
    return {
      keydown: listeners.filter((listener) => listener.type === "keydown").length,
      focusin: listeners.filter((listener) => listener.type === "focusin").length,
      heapBytes: metrics.find((metric) => metric.name === "JSHeapUsedSize")!.value
    };
  }
  // Warm both React and the dialog before measuring retained state.
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await trigger.click();
  await page.keyboard.press("Escape");
  const before = await sample();
  for (let index = 0; index < 30; index += 1) {
    await trigger.press("Enter");
    await expect(page.getByRole("dialog").getByPlaceholder("Search pages")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  const after = await sample();
  expect(after.keydown).toBe(before.keydown);
  expect(after.focusin).toBe(before.focusin);
  expect(after.heapBytes - before.heapBytes).toBeLessThan(5 * 1024 * 1024);
  await writeFile(resolve(evidenceDirectory, "modal-lifecycle.json"), JSON.stringify({ cycles: 30, before, after, retainedHeapDeltaBytes: after.heapBytes - before.heapBytes }, null, 2) + "\n");
  await cdp.detach();
});

test("Ctrl+K keeps the focused palette visually above the touch dialog", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1280, "Desktop uses the existing pitch UI");
  const trigger = page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true });
  await trigger.click();
  const touchDialog = page.getByRole("dialog", { name: "Fixture Player 1", exact: true });
  const close = touchDialog.getByRole("button", { name: "Close player actions" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Command palette" }).getByPlaceholder("Search pages");
  await expect(search).toBeFocused();
  expect(await search.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("responsive themes keep actual dialogs visible and contained", async ({ page }, testInfo) => {
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.getByRole("button", { name: "Open command palette" }).click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await assertInViewport(palette.locator(".ui-surface-elevated"), page);
    await expect(palette.getByPlaceholder("Search pages")).toBeFocused();
    await page.screenshot({ path: resolve(evidenceDirectory, `${testInfo.project.name}-${theme}-palette.png`), scale: "css" });
    measurements.push({ theme, palette: await palette.locator(".ui-surface-elevated").boundingBox(), fontFamily: await page.evaluate(() => getComputedStyle(document.body).fontFamily), onestLoaded: await page.evaluate(() => document.fonts.check('15px "Onest"') && [...document.fonts].some((font) => font.family.includes("Onest"))) });
    await page.keyboard.press("Escape");
    if ((page.viewportSize()?.width ?? 0) < 1280) {
      await page.getByRole("button", { name: "Actions for Fixture Player 1", exact: true }).click();
      const touchDialog = page.getByRole("dialog", { name: "Fixture Player 1", exact: true });
      await assertInViewport(touchDialog, page);
      for (const button of await touchDialog.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      measurements.push({ theme, touchDialog: await touchDialog.boundingBox() });
      await page.screenshot({ path: resolve(evidenceDirectory, `${testInfo.project.name}-${theme}-actions.png`), scale: "css" });
      await page.keyboard.press("Escape");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await writeFile(resolve(evidenceDirectory, `${testInfo.project.name}-layout.json`), JSON.stringify(measurements, null, 2) + "\n");
});

async function setLanguage(page: Page, language: "en" | "ru") {
  await page.evaluate((value) => {
    localStorage.setItem("fantasy-language", value);
    document.documentElement.dataset.language = value;
    document.documentElement.lang = value;
    window.dispatchEvent(new Event("fantasy-language-change"));
  }, language);
}

async function assertInViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
for (const language of ["en", "ru"] as const) {
  test(`mobile column sort covers full pool, selected metrics and squad actions: ${language}`, async ({ page }, testInfo) => {
    test.skip(!["mobile-320", "mobile-390"].includes(testInfo.project.name), "Actual touch checks at the requested phone widths");
    const directory = process.env.UI_MOBILE_SORT_EVIDENCE_DIR ?? "output/playwright/mobile-player-sorting";
    await mkdir(directory, { recursive: true });
    await page.goto(`${fixture.url}/?mobileSort=football`);
    await setLanguage(page, language);
    expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(true);
    const sort = page.getByTestId("player-pool-sort");
    const picker = sort.getByRole("combobox");
    const direction = sort.getByRole("button");
    const mobile = page.getByTestId("player-pool-mobile");
    const cards = mobile.locator("article");
    await expect(sort).toBeVisible();
    await expect(direction).toBeDisabled();
    await expect(cards).toHaveCount(18);
    await expect(picker.locator('option[value="fixtures"], option[value="action"]')).toHaveCount(0);
    await mobile.getByRole("button", { name: language === "en" ? /^Show more/ : /^Показать ещё/ }).tap();
    await expect(cards).toHaveCount(36);

    await picker.tap();
    await picker.selectOption("foontasy");
    await page.keyboard.press("Escape");
    await expect(sort).toHaveAttribute("data-sort-direction", "desc");
    await expect(cards).toHaveCount(18);
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-47");
    await showAll();
    await expect(cards.last()).toHaveAttribute("data-player-id", "sort-0");
    await direction.tap();
    await expect(sort).toHaveAttribute("data-sort-direction", "asc");
    await expect(cards).toHaveCount(18);
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-1");
    await showAll();
    await expect(cards.last()).toHaveAttribute("data-player-id", "sort-0");

    await page.locator("summary").filter({ hasText: language === "en" ? "Columns" : "Столбцы" }).tap();
    const analyticalCheckbox = page.locator('label[title*="shots"] input[type="checkbox"]');
    await analyticalCheckbox.tap();
    await expect(analyticalCheckbox).toBeChecked();
    await page.getByRole("button", { name: language === "en" ? "Close" : "Закрыть", exact: true }).tap();
    await picker.selectOption("stat:shots");
    await expect(sort).toHaveAttribute("data-sort-key", "stat:shots");
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-47");
    await direction.tap();
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-1");
    await showAll();
    await expect(cards.last()).toHaveAttribute("data-player-id", "sort-0");
    const orderedIds = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-player-id")));
    expect(orderedIds.indexOf("sort-2")).toBeLessThan(orderedIds.indexOf("sort-3"));
    expect(orderedIds.indexOf("sort-3")).toBeLessThan(orderedIds.indexOf("sort-5"));
    await mobile.getByRole("button", { name: language === "en" ? "Add Player01" : "Добавить Player01", exact: true }).tap();
    await expect(page.getByTestId("sort-selection")).toHaveText("sort-1");
    await expect(mobile.getByRole("button", { name: language === "en" ? "Remove Player01" : "Убрать Player01", exact: true })).toBeVisible();
    await expect(sort).toHaveAttribute("data-sort-key", "stat:shots");
    await expect(sort).toHaveAttribute("data-sort-direction", "asc");

    const filter = page.getByRole("textbox", { name: "Fixture name filter" });
    await filter.fill("Player4");
    await expect(cards).toHaveCount(8);
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-40");
    await direction.tap();
    await expect(cards.first()).toHaveAttribute("data-player-id", "sort-47");
    await expect(filter).toHaveValue("Player4");
    await expect(page.getByTestId("sort-selection")).toHaveText("sort-1");
    await expect(page.getByTestId("sort-columns")).toHaveText("nextFp,foontasy,fixtures,stat:shots");
    await filter.fill("");
    await expect(cards).toHaveCount(18);
    await sort.scrollIntoViewIfNeeded();
    await assertInViewport(sort, page);
    const measurements = { sort: await sort.boundingBox(), select: await picker.boundingBox(), direction: await direction.boundingBox(), firstPlayer: await cards.first().getAttribute("data-player-id") };
    expect(measurements.select!.height).toBeGreaterThanOrEqual(44);
    expect(measurements.direction!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-${language}-${theme}-sorting.png`), scale: "css" });
    }
    await writeFile(resolve(directory, `${testInfo.project.name}-${language}-sorting.json`), JSON.stringify({ ...measurements, ascendingStableIds: orderedIds }, null, 2) + "\n");

    await page.locator("summary").filter({ hasText: language === "en" ? "Columns" : "Столбцы" }).tap();
    await analyticalCheckbox.tap();
    await page.getByRole("button", { name: language === "en" ? "Close" : "Закрыть", exact: true }).tap();
    await expect(picker).toHaveValue("");
    await expect(direction).toBeDisabled();
    await expect(page.getByTestId("sort-selection")).toHaveText("sort-1");

    async function showAll() {
      while (await cards.count() < 48) await mobile.getByRole("button", { name: language === "en" ? /^Show more/ : /^Показать ещё/ }).tap();
      await expect(cards).toHaveCount(48);
    }
  });
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
test("mobile column sort shares desktop header state in both directions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One fine-pointer desktop/mobile transition");
  await page.goto(`${fixture.url}/?mobileSort=football`);
  const desktop = page.getByTestId("player-pool-table");
  const price = desktop.locator('th[data-sort-key="price"]');
  await price.click();
  await expect(price).toHaveAttribute("aria-sort", "descending");
  await expect(desktop.locator("tbody td[data-sort-value]").first()).toHaveAttribute("data-sort-value", "48");
  await page.setViewportSize({ width: 390, height: 844 });
  const sort = page.getByTestId("player-pool-sort");
  await expect(sort.getByRole("combobox")).toHaveValue("price");
  await expect(sort).toHaveAttribute("data-sort-direction", "desc");
  await sort.getByRole("button").click();
  await expect(page.getByTestId("player-pool-mobile").locator("article").first()).toHaveAttribute("data-player-id", "sort-0");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(price).toHaveAttribute("aria-sort", "ascending");
  await expect(desktop.locator("tbody td[data-sort-value]").first()).toHaveAttribute("data-sort-value", "1");
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
test("mobile column sort follows changed definitions and survives empty filters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "One props-rerender and empty-filter regression");
  await page.goto(`${fixture.url}/?mobileSort=football`);
  await page.locator("summary").filter({ hasText: "Columns" }).tap();
  await page.locator('label[title*="shots"] input[type="checkbox"]').tap();
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  const sort = page.getByTestId("player-pool-sort");
  const picker = sort.getByRole("combobox");
  const cards = page.getByTestId("player-pool-mobile").locator("article");
  const filter = page.getByRole("textbox", { name: "Fixture name filter" });
  await filter.fill("Player4");
  await picker.selectOption("stat:shots");
  await expect(cards.first()).toHaveAttribute("data-player-id", "sort-47");
  // Definitions disappear, while the player DTOs still carry their historical values.
  await page.getByRole("button", { name: "Remove historical column definitions" }).tap();
  await expect(picker).toHaveValue("");
  await expect(sort).toHaveAttribute("data-sort-key", "");
  await expect(sort).toHaveAttribute("data-sort-direction", "");
  await expect(sort.getByRole("button")).toBeDisabled();
  await expect(cards.first()).toHaveAttribute("data-player-id", "sort-40");
  await expect(filter).toHaveValue("Player4");
  await page.locator("summary").filter({ hasText: "Columns" }).tap();
  await page.getByRole("button", { name: "Hide optional", exact: true }).tap();
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  await page.getByRole("button", { name: "Restore historical column definitions" }).tap();
  await page.locator("summary").filter({ hasText: "Columns" }).tap();
  await page.getByRole("button", { name: "Select all", exact: true }).tap();
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  await expect(picker).toHaveValue("");
  await expect(sort).toHaveAttribute("data-sort-key", "");
  await expect(sort.getByRole("button")).toBeDisabled();
  await expect(cards.first()).toHaveAttribute("data-player-id", "sort-40");
  await picker.selectOption("foontasy");
  await filter.fill("no-matches");
  await expect(cards).toHaveCount(0);
  await expect(picker).toHaveValue("foontasy");
  await expect(sort).toHaveAttribute("data-sort-key", "foontasy");
  await expect(sort).toHaveAttribute("data-sort-direction", "desc");
  await expect(sort.getByRole("button")).toBeDisabled();
  await filter.fill("");
  await expect(cards).toHaveCount(18);
  await expect(cards.first()).toHaveAttribute("data-player-id", "sort-47");
  await expect(sort.getByRole("button")).toBeEnabled();
});
