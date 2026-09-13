import {test,expect} from '@playwright/test';
import {formatToi,type KhlPlayer} from '../src/khl/contracts';

/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
test('KHL visible statistics survive partial matches and history switches',async({page},testInfo)=>{
 test.skip(process.env.KHL_PRODUCTION_SMOKE!=='true','Explicit production statistics check');
 await page.goto('/machete/khl/players');
 const initialRows=await page.locator('tbody tr').allTextContents().then(rows=>rows.slice(0,10));
 console.log('Initial catalog',initialRows);
 expect(initialRows.some(row=>/[1-9]\d*:[0-5]\d/.test(row)),'Initial catalog must show players with known ice time').toBe(true);
 await page.getByRole('combobox',{name:'Период прогноза'}).selectOption('week');
 const weekRows=await page.locator('tbody tr').allTextContents().then(rows=>rows.slice(0,10));
 expect(weekRows.some(row=>/[1-9]\d*:[0-5]\d/.test(row)),'Unknown week EP must not hide players with known ice time').toBe(true);
 await page.getByRole('combobox',{name:'Период прогноза'}).selectOption('rolling');
 await page.getByRole('combobox',{name:'Позиция',exact:true}).selectOption('ALL');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Грегуар');
 const options=page.getByRole('combobox',{name:'Открыть карточку игрока'}).locator('option');
 await expect(options).toHaveCount(2);
 const id=await options.nth(1).getAttribute('value');
 const response=await page.request.get(`/api/machete/khl/players/${id}?contestId=cmtr4grkd00056htzwpdv4fwu`);
 expect(response.status()).toBe(200);
 const p=(await response.json()).data as KhlPlayer;
 const row=page.locator('tbody tr').filter({hasText:'Грегуар'});
 if(await row.getByRole('button',{name:'Выбрать',exact:true}).count()) await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 for(const key of ['toiSeconds','ppToiSeconds','pkToiSeconds','attackZoneSeconds'] as const){
  const total=p.seasonStats!.totals[key];
  expect(total.knownGames).toBeGreaterThan(0);
  await expect(row).toContainText(formatToi(total.value));
 }
 await page.screenshot({path:`output/playwright-test-results/khl-statistics-season-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('combobox',{name:'Статистика времени и вратаря'}).selectOption('recent');
 console.log('Recent catalog',await row.innerText());
 for(const key of ['toiSeconds','ppToiSeconds','pkToiSeconds','attackZoneSeconds'] as const){
  expect(p[key]?.value,`${key} must retain known observations`).not.toBeNull();
  await expect(row).toContainText(formatToi(p[key]!.value));
 }
 await page.getByRole('combobox',{name:'История для средних'}).selectOption('5');
 const refresh=page.getByRole('button',{name:'Обновить статистику',exact:true});
 await expect(refresh).toBeEnabled({timeout:30000});
 const refreshed=page.waitForResponse(r=>r.url().includes('/api/machete/khl/players?'));
 await refresh.click();
 await refreshed;
 await expect(refresh).toBeEnabled({timeout:30000});
 await expect(page.getByRole('status').filter({hasText:'Статистика обновлена'})).toBeVisible({timeout:30000});
 await expect(page.getByRole('textbox',{name:'Поиск игрока',exact:true})).toHaveValue('Грегуар');
 await expect(row.getByRole('button',{name:'Убрать',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Открыть карточку игрока'}).selectOption(id!);
 const card=page.getByRole('region',{name:'Карточка Грегуар'});
 await expect(card).toBeVisible();
 await expect(card).toContainText(`Данные: ${p.attackZoneSeconds!.knownGames} из ${p.attackZoneSeconds!.totalGames} матчей`);
 await card.screenshot({path:`output/playwright-test-results/khl-statistics-card-${testInfo.project.name}.png`});
 await page.getByRole('button',{name:'Закрыть карточку',exact:true}).click();
 const tabRefresh=page.waitForResponse(r=>r.url().includes('/api/machete/khl/players?'));
 await page.getByRole('link',{name:'Состав',exact:true}).click();
 await tabRefresh;
 await expect(refresh).toBeEnabled({timeout:30000});
 await expect(row.getByRole('button',{name:'Убрать',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Статистика времени и вратаря'}).selectOption('season');
 await expect(row).toContainText(formatToi(p.seasonStats!.totals.attackZoneSeconds.value));
 await page.screenshot({path:`output/playwright-test-results/khl-statistics-refreshed-${testInfo.project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
