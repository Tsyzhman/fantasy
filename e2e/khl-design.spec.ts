import { test, expect } from "@playwright/test";

/** @spec spec://modules/khl/FEAT-002-khl-squad#layout */
test("KHL contact sheet retains slot shortcuts and player actions in both themes", async ({ page }, testInfo) => {
  test.skip(process.env.KHL_E2E_ENABLED !== "true", "Dedicated seeded local contest");
  await page.goto("/machete/khl/squad?contestId=khl-e2e&new=1");
  await page.getByRole("button", { name: "G · свободное место 1", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Позиция", exact: true })).toHaveValue("G");
  await expect(page.getByRole("textbox", { name: "Поиск игрока" })).toBeFocused();
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  const roster = page.getByLabel("Хоккейный состав, все 17 активны");
  const first = roster.getByRole("article").first();
  await first.getByRole("checkbox", { name: "Сохранить в подборе" }).check();
  await first.locator("summary").click();
  await expect(first.getByText(/Снимок lock:/)).toBeVisible();
  await first.getByRole("button", { name: "Переместить Тестовый игрок 0 ниже" }).click();
  await expect(roster.getByRole("article").nth(1).getByRole("heading")).toHaveText("Тестовый игрок 0");
  await expect(roster.getByRole("article").nth(1).getByRole("checkbox")).toBeChecked();
  await roster.getByRole("article").nth(1).getByRole("button", { name: "Карточка и история" }).click();
  await expect(page.getByRole("button", { name: "Закрыть карточку" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await roster.getByRole("button", { name: "Убрать Тестовый игрок 0", exact: true }).click();
  await expect(roster.getByRole("article")).toHaveCount(1);
  await expect(roster.getByRole("button", { name: /свободное место/ })).toHaveCount(16);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    await roster.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright-khl/design-${testInfo.project.name}-${theme}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  const resources = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
    return { duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index), caches: await caches.keys() };
  });
  expect(resources.duplicateIds).toEqual([]);
  expect(resources.caches).toEqual([]);
});
