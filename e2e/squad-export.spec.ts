import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';

/** @spec spec://modules/machete/FEAT-003-squad-player-card#root */
test('Squad XLSX preserves a league pool larger than 1000 rows', async ({ request }) => {
  test.skip(process.env.KHL_PRODUCTION_SMOKE !== 'true', 'Authenticated production export regression');
  const columns = ['player', 'team', 'position', 'price'].map(key => ({ key, header: key }));
  const rows = Array.from({ length: 1005 }, (_, index) => ({ player: `Игрок ${index}`, team: 'Клуб', position: 'MID', price: index + 0.5 }));
  const response = await request.post('/api/machete/squads/export-table', { data: { leagueId: '42', season: '2026/2027', language: 'en', columns, rows } });
  expect(response.status(), response.ok() ? undefined : await response.text()).toBe(200);
  expect(response.headers()['content-type']).toContain('spreadsheetml.sheet');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.body() as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet('Players')!;
  expect(sheet.rowCount).toBe(1006);
  for (let index = 0; index < rows.length; index++) {
    expect(sheet.getCell(index + 2, 1).value).toBe(rows[index].player);
    expect(sheet.getCell(index + 2, 4).value).toBe(rows[index].price);
  }
  const oversized = await request.post('/api/machete/squads/export-table', { data: { columns, rows: Array.from({ length: 5001 }, () => rows[0]) } });
  expect(oversized.status()).toBe(400);
});

test('Squad Export table button downloads the displayed UCL pool', async ({ page }) => {
  test.skip(process.env.KHL_PRODUCTION_SMOKE !== 'true', 'Authenticated production download');
  await page.goto('/machete/squad?leagueId=42');
  const poolTab = page.getByRole('radio', { name: /^Pool$|^Пул$/ });
  if (await poolTab.isVisible()) await poolTab.click();
  await expect(page.getByTestId('player-pool-table').or(page.getByTestId('player-pool-mobile')).filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-player-pool-progress]')).toHaveCount(0, { timeout: 45000 });
  const exportButton = page.getByRole('button', { name: /^(Export table|Выгрузить таблицу)$/, includeHidden: true });
  if (page.viewportSize()!.width < 1280) {
    await page.locator('summary').filter({ hasText: /More filters and export|Ещё фильтры и выгрузка/ }).click();
  }
  await expect(exportButton).toBeVisible();
  const responsePromise = page.waitForResponse(r => r.url().includes('/api/machete/squads/export-table'));
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const submitted = response.request().postDataJSON() as { rows: unknown[] };
  expect(submitted.rows.length).toBeGreaterThan(1000);
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  expect(workbook.worksheets[0].rowCount).toBe(submitted.rows.length + 1);
});
