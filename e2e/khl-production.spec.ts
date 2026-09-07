import { test, expect } from "@playwright/test";
import { fantasySquadLeagueFotMobIds } from "../src/lib/leagues/display";

test("Betting offers all Squad leagues in the same order", async ({ page }) => {
  test.skip(process.env.KHL_PRODUCTION_SMOKE !== "true", "Explicit production check");
  await page.goto("/betting");
  const select = page.getByRole("combobox", { name: "Турнир", exact: true });
  await expect(select.locator("option")).toHaveCount(fantasySquadLeagueFotMobIds.length + 1);
  expect(await select.locator("option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(["", ...fantasySquadLeagueFotMobIds]);
  await expect(select.locator("option").first()).toHaveText("Все лиги");
  const events = page.getByRole("region", { name: "События", exact: true }).getByRole("button");
  await expect(events.first()).toBeVisible();
  await events.first().click();
  const advice = page.getByRole("region", { name: "Советы алгоритмов на выбранный матч" });
  await expect(advice.getByRole("article")).toHaveCount(5);
  for (const name of ["Mia", "Abella", "Lana", "Riley", "Adriana"]) await expect(advice.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Поиск рынка" }).fill("несуществующий рынок");
  await expect(advice.getByRole("article")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("production KHL catalog and local planning are available", async ({ page }) => {
  test.skip(process.env.KHL_PRODUCTION_SMOKE !== "true", "Explicit real production catalog check");
  const response = await page.goto("/machete/khl/squad");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Fantasy КХЛ/ })).toBeVisible();
  await expect(page.getByLabel("Хоккейный состав, все 17 активны")).toBeVisible();
  await page.getByRole("combobox", { name: "Позиция", exact: true }).selectOption("ALL");
  await expect(page.getByRole("button", { name: "Выбрать", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить план" })).toBeEnabled();
  // Reuse the dedicated QA user's draft on subsequent runs; do not accumulate
  // a new squad for each viewport or scheduled smoke run.
  const selected = page.getByText("Сохранить в подборе", { exact: true });
  if (await selected.count() === 0) await page.getByRole("button", { name: "Выбрать", exact: true }).first().click();
  const count = await selected.count();
  await page.getByRole("textbox", { name: "Название варианта" }).fill("KHL production smoke");
  await page.getByRole("button", { name: "Сохранить план" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Локальный вариант сохранён" })).toBeVisible();
  await page.reload();
  await expect(selected).toHaveCount(count);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
