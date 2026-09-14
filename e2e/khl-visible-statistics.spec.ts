import {test,expect} from '@playwright/test';
import {formatToi,formatKhlNumber,historicalTableStats,type KhlPlayer} from '../src/khl/contracts';
import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';

/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
test('KHL visible statistics survive partial matches and history switches',async({page},testInfo)=>{
 test.skip(process.env.KHL_PRODUCTION_SMOKE!=='true','Explicit production statistics check');
 await page.goto('/machete/khl/players');
 const poolCount=Number((await page.locator('caption').innerText()).match(/Каталог · (\d+)/)?.[1]);
 expect(poolCount).toBeGreaterThan(50);
 expect(await page.locator('th,td').evaluateAll(cells=>cells.filter(cell=>!cell.getAttribute('title')).length)).toBe(0);
 const initialRows=await page.locator('tbody tr').allTextContents().then(rows=>rows.slice(0,10));
 console.log('Initial catalog',initialRows);
 expect(initialRows.some(row=>/[1-9]\d*:[0-5]\d/.test(row)),'Initial catalog must show players with known ice time').toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 for (const [label, column] of [['TOI',6],['PP',7],['PK',8],['Атака',9]] as const) {
  const sort = page.getByRole('button',{name:`Сортировать: ${label}`,exact:true});
  for (const direction of ['descending','ascending'] as const) {
   await sort.click(); await expect(sort.locator('..')).toHaveAttribute('aria-sort',direction);
   const cells=await page.locator(`tbody tr td:nth-child(${column})`).allTextContents();
   const values=cells.map(s=>/^(\d+):([0-5]\d)/.exec(s)).map(m=>m?Number(m[1])*60+Number(m[2]):null);
   const known=values.filter((n):n is number=>n!==null);
   expect(known.length).toBeGreaterThan(0);
   expect(known).toEqual([...known].sort((a,b)=>direction==='ascending'?a-b:b-a));
   expect(values.slice(0,known.length).every(n=>n!==null)).toBe(true);
  }
 }
 for (const [label,column] of [['Броски',13],['Голы',14],['Передачи',15],['Штраф, мин',16],['+/−',17]] as const) {
  const sort=page.getByRole('button',{name:`Сортировать: ${label}`,exact:true});
  for(const direction of ['descending','ascending'] as const){
   await sort.click();await expect(sort.locator('..')).toHaveAttribute('aria-sort',direction);
   const texts=await page.locator(`tbody tr td:nth-child(${column}) > span`).allTextContents();
   const values=texts.map(s=>s==='—'?null:Number(s.replace(/\s/g,'').replace(',','.')));
   const known=values.filter((n):n is number=>n!==null);
   expect(known.length).toBeGreaterThan(0);
   expect(known).toEqual([...known].sort((a,b)=>direction==='ascending'?a-b:b-a));
  }
 }
 await page.getByRole('combobox',{name:'Сортировать по',exact:true}).selectOption('ep');
 await page.getByRole('combobox',{name:'Период прогноза'}).selectOption('week');
 const weekRows=await page.locator('tbody tr').allTextContents().then(rows=>rows.slice(0,10));
 expect(weekRows.some(row=>/[1-9]\d*:[0-5]\d/.test(row)),'Unknown week EP must not hide players with known ice time').toBe(true);
 await page.getByRole('combobox',{name:'Период прогноза'}).selectOption('rolling');
 await page.getByRole('combobox',{name:'Позиция',exact:true}).selectOption('ALL');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Грегуар');
 const options=page.getByRole('combobox',{name:'Открыть карточку игрока'}).locator('option');
 await expect(options).toHaveCount(2);
 const id=await options.nth(1).getAttribute('value');
 let p!:KhlPlayer;
 // A source revision can arrive immediately before the minute worker publishes EP.
 // Wait for that publication explicitly; a persistent missing forecast still fails.
 await expect.poll(async()=>{
  const response=await page.request.get(`/api/machete/khl/players/${id}?contestId=cmtr4grkd00056htzwpdv4fwu`);
  expect(response.status()).toBe(200);
  p=(await response.json()).data as KhlPlayer;
  return p.forecastExplanation?.details?.version;
 },{timeout:75000,intervals:[1000,3000,5000]}).toBe(1);
 const exportResponse=page.waitForResponse(r=>r.url().includes('/players-export?'));
 const downloadReady=page.waitForEvent('download');
 await page.getByRole('button',{name:'Excel · все игроки',exact:true}).click();
 const xlsx=await exportResponse;expect(xlsx.status()).toBe(200);
 expect(Number(xlsx.headers()['x-export-row-count'])).toBe(poolCount);
 const download=await downloadReady;
 const workbookPath=testInfo.outputPath('khl-all-players.xlsx');await download.saveAs(workbookPath);
 const workbookBytes=await readFile(workbookPath);
 console.log('Downloaded Excel',{bytes:workbookBytes.length,players:poolCount});
 expect(workbookBytes.length).toBeGreaterThan(10000);
 const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(workbookBytes).buffer);
 expect(book.worksheets).toHaveLength(7);
 for(const name of ['Игроки','Текущий сезон','Последние матчи','Прошлый сезон','Ожидаемые показатели']) {
  const sheet=book.getWorksheet(name)!;
  expect(sheet.rowCount-1).toBe(poolCount);
  expect(new Set(sheet.getColumn(1).values.slice(2)).size).toBe(poolCount);
 }
 await expect(page.getByRole('status').filter({hasText:`Excel готов: ${poolCount} игроков`})).toBeVisible();
 expect(p.previousSeasonStats?.games).toBeGreaterThan(40);
 expect(p.forecastExplanation?.previousGames).toBeGreaterThan(40);
 expect(p.previousSeasonStats?.protocolStats?.games).toBeGreaterThan(40);
 for(const key of ['shotsOnGoal','ppToiSeconds','pkToiSeconds','attackZoneSeconds'] as const) expect(p.previousSeasonStats!.protocolStats!.totals[key].value).toBeGreaterThan(0);
 const row=page.locator('tbody tr').filter({hasText:'Грегуар'});
 await expect(row.locator('td').nth(10)).toHaveAttribute('title',/За сыгранный матч:/);
 await page.getByText('Справка показателей',{exact:true}).click();
 await expect(page.locator('details[open]').filter({hasText:'Справка показателей'})).toContainText('частота участия');
 await page.getByText('Справка показателей',{exact:true}).click();
 if(await row.getByRole('button',{name:'Выбрать',exact:true}).count()) await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 for(const key of ['toiSeconds','ppToiSeconds','pkToiSeconds','attackZoneSeconds'] as const){
  const total=p.seasonStats!.totals[key];
  expect(total.knownGames).toBeGreaterThan(0);
  await expect(row).toContainText(formatToi(total.value));
 }
 await page.screenshot({path:`output/playwright-test-results/khl-statistics-season-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('combobox',{name:'Период статистики'}).selectOption('recent');
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
 await row.getByRole('button',{name:'Разобрать прогноз: Грегуар',exact:true}).click();
 const card=page.getByRole('region',{name:'Карточка Грегуар'});
 await expect(card).toBeVisible();
 await expect(card).toContainText(`Данные: ${p.attackZoneSeconds!.knownGames} из ${p.attackZoneSeconds!.totalGames} матчей`);
 await expect(card.getByRole('region',{name:'Формула EP'})).toBeVisible();
 await expect(card.getByRole('heading',{name:'Ожидаемые показатели',exact:true})).toBeVisible();
 expect(p.forecastExplanation?.details?.version).toBe(1);
 const expectedTable=card.getByRole('region',{name:'Формула EP'}).getByRole('table');
 const expectedGoals=expectedTable.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Голы',exact:true})});
 await expect(expectedGoals.getByRole('cell').first()).toHaveText(formatKhlNumber(p.forecastExplanation!.details!.expected.goals));
 await card.getByText('Из чего получился прогноз',{exact:true}).click();
 await expect(card).toContainText('Вес прошлого: min(20;');
 await card.getByText('Из чего получился прогноз',{exact:true}).click();
 await expect(card).toContainText(`Прошлый сезон ${p.previousSeasonStats!.seasonKey}`);
 await card.screenshot({path:`output/playwright-test-results/khl-statistics-card-${testInfo.project.name}.png`});
 await page.getByRole('button',{name:'Закрыть карточку',exact:true}).click();
 const tabRefresh=page.waitForResponse(r=>r.url().includes('/api/machete/khl/players?'));
 await page.getByRole('link',{name:'Состав',exact:true}).click();
 await tabRefresh;
 await expect(refresh).toBeEnabled({timeout:30000});
 await expect(row.getByRole('button',{name:'Убрать',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Импортировать состав Sports',exact:true})).toBeVisible();
 const roster=page.getByLabel('Хоккейный состав, все 17 активны');
 const rosterCards=roster.locator('article');
 await expect(rosterCards.first()).toBeVisible();
 const box=await rosterCards.first().boundingBox();
 if(testInfo.project.name==='desktop-chromium') expect(box!.width).toBeLessThan(90);
 else expect(box!.width).toBeGreaterThan(200);
 await roster.screenshot({path:`output/playwright-test-results/khl-roster-${testInfo.project.name}.png`});
 const epBeforePast=await row.locator('td').nth(10).innerText();
 await page.getByRole('combobox',{name:'Период статистики'}).selectOption('previous');
 const previous=historicalTableStats(p.previousSeasonStats!);
 for(const key of ['toiSeconds','ppToiSeconds','pkToiSeconds','attackZoneSeconds'] as const) await expect(row).toContainText(formatToi(previous.totals[key].value));
 await expect(row.locator('td').nth(12).locator('span')).toHaveText(formatKhlNumber(previous.totals.shotsOnGoal.value));
 await expect(row.locator('td').nth(13).locator('span')).toHaveText(formatKhlNumber(previous.totals.goals.value));
 await expect(row.locator('td').nth(10)).toHaveText(epBeforePast);
 await page.screenshot({path:`output/playwright-test-results/khl-previous-season-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('combobox',{name:'Период статистики'}).selectOption('season');
 await expect(row).toContainText(formatToi(p.seasonStats!.totals.attackZoneSeconds.value));
 await page.screenshot({path:`output/playwright-test-results/khl-statistics-refreshed-${testInfo.project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
