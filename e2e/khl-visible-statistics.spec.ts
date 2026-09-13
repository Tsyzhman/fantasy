import {test,expect} from '@playwright/test';
import {formatToi,type KhlPlayer} from '../src/khl/contracts';

/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
test('KHL visible statistics survive partial matches and history switches',async({page},testInfo)=>{
 test.skip(process.env.KHL_PRODUCTION_SMOKE!=='true','Explicit production statistics check');
 await page.goto('/machete/khl/players');
 console.log('Initial catalog',await page.locator('tbody tr').allTextContents().then(rows=>rows.slice(0,10)));
 await page.getByRole('combobox',{name:'Позиция',exact:true}).selectOption('ALL');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Грегуар');
 const options=page.getByRole('combobox',{name:'Открыть карточку игрока'}).locator('option');
 await expect(options).toHaveCount(2);
 const id=await options.nth(1).getAttribute('value');
 const response=await page.request.get(`/api/machete/khl/players/${id}?contestId=cmtr4grkd00056htzwpdv4fwu`);
 expect(response.status()).toBe(200);
 const p=(await response.json()).data as KhlPlayer;
 const row=page.locator('tbody tr').filter({hasText:'Грегуар'});
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
 await page.getByRole('button',{name:'Обновить статистику',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Статистика обновлена'})).toBeVisible({timeout:30000});
 await expect(page.getByRole('textbox',{name:'Поиск игрока',exact:true})).toHaveValue('Грегуар');
 await page.getByRole('combobox',{name:'Статистика времени и вратаря'}).selectOption('season');
 await expect(row).toContainText(formatToi(p.seasonStats!.totals.attackZoneSeconds.value));
 await page.screenshot({path:`output/playwright-test-results/khl-statistics-refreshed-${testInfo.project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
