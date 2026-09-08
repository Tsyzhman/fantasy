import { test, expect } from "@playwright/test";
import { fantasySquadLeagueFotMobIds } from "../src/lib/leagues/display";
import type { ModelInput, Recommendation } from "../src/betting/domain";

test("Betting offers all Squad leagues in the same order", async ({ page }) => {
  test.skip(process.env.KHL_PRODUCTION_SMOKE !== "true", "Explicit production check");
  await page.goto("/betting");
  const select = page.getByRole("combobox", { name: "Турнир", exact: true });
  await expect(select.locator("option")).toHaveCount(fantasySquadLeagueFotMobIds.length + 1);
  expect(await select.locator("option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(["", ...fantasySquadLeagueFotMobIds]);
  await expect(select.locator("option").first()).toHaveText("Все лиги");
  await expect(page.getByRole("navigation", { name: "Разделы арены" }).getByRole("button", { name: "Расчёт", exact: true })).toHaveCount(0);
  const leagueResponse = page.waitForResponse(r => r.url().includes("/api/betting?league=42") && r.request().method() === "GET");
  await select.selectOption("42");
  expect((await leagueResponse).status()).toBe(200);
  const order = page.getByRole("combobox", { name: /Порядок событий|Event order/ });
  await expect(order).toHaveValue("value");
  for (const sort of ["time", "value"]) {
    const response = page.waitForResponse(r => r.url().includes(`/api/betting?league=42`) && r.url().includes(`sort=${sort}`));
    await order.selectOption(sort);
    const result = await response;
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.events.length).toBeLessThanOrEqual(30);
    expect(body.events.every((event: object) => "opportunity" in event)).toBe(true);
  }
  const events = page.getByRole("region", { name: "События", exact: true }).getByRole("button");
  await expect(events.first()).toBeVisible();
  const detailResponse = page.waitForResponse(r => r.url().includes("/api/betting?event=") && r.request().method() === "GET");
  await events.first().click();
  const detail = await (await detailResponse).json() as { model: ModelInput | null; markets: { recommendations: Recommendation[] }[] };
  expect(detail.model?.europeanCompetitionId).toBe(42);
  expect(detail.model!.home.length).toBeGreaterThanOrEqual(5);
  expect(detail.model!.away.length).toBeGreaterThanOrEqual(5);
  expect([...detail.model!.home, ...detail.model!.away].every(r => Date.parse(r.at) < Date.parse(detail.model!.kickoff))).toBe(true);
  for (const name of ["Mia", "Abella", "Lana", "Riley", "Adriana"]) expect(detail.markets.some(m => m.recommendations.some(r => r.name === name && r.probability !== null))).toBe(true);
  const advice = page.getByRole("region", { name: "Советы алгоритмов на выбранный матч" });
  await expect(page.getByRole("region", { name: "Подходящие исходы матча" })).toBeVisible();
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
  await expect(page.getByLabel("Хоккейный состав, все 17 активны").locator(".squad-contact-card")).toHaveCount(count);
  await page.getByRole("textbox", { name: "Название варианта" }).fill("KHL production smoke");
  await page.getByRole("button", { name: "Сохранить план" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Локальный вариант сохранён" })).toBeVisible();
  await page.reload();
  await expect(selected).toHaveCount(count);
  await page.goto("/machete/khl/squad");
  await expect(selected).toHaveCount(count);
  await page.getByRole("link", { name: "Новый вариант", exact: true }).click();
  await expect(page.getByText(/свободное место/)).toHaveCount(17);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
test('production KHL player history contains imported facts', async ({page})=>{
 test.skip(process.env.KHL_PRODUCTION_SMOKE !== 'true', 'Explicit production statistics check');
 await page.goto('/machete/khl/players');
 await page.getByRole('combobox',{name:'Позиция',exact:true}).selectOption('ALL');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Грегуар');
 const select=page.getByRole('combobox',{name:'Открыть карточку игрока'});
 await expect(select.locator('option')).toHaveCount(2);
 const value=await select.locator('option').nth(1).getAttribute('value');
 const response=page.waitForResponse(r=>r.url().includes(`/players/${value}/history?`));
 await select.selectOption(value!);
 const body=await (await response).json();
 const historical=body.data.stats.find((s:{match:{startsAt:string}})=>s.match.startsAt.startsWith('2026-09-05'));
 if (historical) {
  expect(historical.toiSeconds).toBe(1250);
  expect(body.data.scores.find((s:{matchId:string})=>s.matchId===historical.matchId).points).toBe(7);
 }
 // The API intentionally returns only the last 20 games; keep the daily
 // smoke valid after the September reference match leaves that window.
 const displayed=historical ?? body.data.stats.find((s:{participationStatus:string})=>s.participationStatus==='PLAYED');
 expect(displayed.toiSeconds).toBeGreaterThan(0);
 const points=body.data.scores.find((s:{matchId:string})=>s.matchId===displayed.matchId).points;
 expect(typeof points).toBe('number');
 await page.getByRole('button',{name:'История матчей',exact:true}).click();
 await expect(page.getByText(new RegExp(`${displayed.match.startsAt.slice(0,10)}.*FP ${points}.*TOI`))).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

/** @spec spec://modules/machete/FEAT-003-squad-player-card#root */
test('UCL shows all five Sports.ru clubs even without FotMob squad coverage', async ({page})=>{
 test.skip(process.env.KHL_PRODUCTION_SMOKE !== 'true','Explicit production catalog check');
 test.setTimeout(120000);
 await page.goto('/machete/squad?leagueId=42');
 await expect(page.locator('[data-fantasy-squad-planner]')).toHaveAttribute('data-league-id','42');
 const poolTab=page.getByRole('button',{name:/^Pool$|^Пул$/});
 if(await poolTab.isVisible()) await poolTab.click();
 const filter=page.getByRole('combobox',{name:/^Team filter$|^Фильтр по команде$/});
 for(const teamId of ['8402','8342','951893','9728','7787']){
  await expect(filter.locator(`option[value="${teamId}"]`)).toBeAttached({timeout:45000});
  await filter.selectOption(teamId);
  const pool=page.getByTestId('player-pool-table').or(page.getByTestId('player-pool-mobile')).filter({visible:true});
  await expect(pool.getByRole('button',{name:/^(Add|Cannot add|Remove|Добавить|Нельзя добавить|Убрать) /}).first()).toBeVisible();
 }
});
