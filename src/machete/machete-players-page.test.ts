import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/machete/players/page.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../components/machete/MachetePlayerTable.tsx", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../app/api/machete/players/export-table/route.ts", import.meta.url), "utf8");

test("Machete players does not load player statistics until explicit leagues are selected", () => {
  assert.doesNotMatch(pageSource, /resolvedSearchParams\.leagueId\s*\?\?\s*["']all["']/);
  assert.match(pageSource, /if \(selectedLeagueIds\.length === 0\)/);
  assert.match(pageSource, /allPlayers: \[\]/);
  assert.doesNotMatch(pageSource, /loadPlannerReadinessByScope/);
  assert.match(pageSource, /seasons\.find\(\(option\) => option\.season === resolvedSearchParams\.season\) \?\? league/);
});

test("Machete players accepts multiple explicit league scopes", () => {
  assert.match(pageSource, /name="leagueId"/);
  assert.match(pageSource, /selectedKeys=\{selectedLeagueIds\}/);
  assert.match(pageSource, /selectedLeagueScopes\.map/);
  assert.doesNotMatch(pageSource, /All loaded leagues/);
});

test("Machete player table matches the planner customization controls", () => {
  assert.match(tableSource, /Advanced filters/);
  assert.match(tableSource, /Columns/);
  assert.match(tableSource, /moveKey/);
  assert.match(tableSource, /data-column-resize-handle/);
  assert.match(tableSource, /localStorage\.setItem/);
  assert.match(tableSource, /Export table/);
  assert.match(tableSource, /Select all/);
  assert.match(tableSource, /Выбрать все/);
  assert.match(tableSource, /player-pool-sortable table-fixed/);
  assert.match(tableSource, /border-sky-300 bg-sky-50/);
  assert.match(tableSource, /overflow-auto/);
});

test("Machete player cards keep the complete selected metric set and report export failures", () => {
  assert.match(tableSource, /<I18nText en="Price" ru="Цена" \/>/);
  assert.match(tableSource, /visibleColumns\.map\(\(column\) => <dl/);
  assert.doesNotMatch(tableSource, /visibleColumns\.slice\(0, 6\)/);
  assert.match(tableSource, /Could not export the table\. Please try again\./);
  assert.match(tableSource, /Не удалось выгрузить таблицу\. Попробуйте ещё раз\./);
});

test("raw provider metrics do not duplicate represented base columns", () => {
  assert.match(tableSource, /representedMetricKeys\.has\(normalizeMetricKey\(key\)\)/);
  assert.match(tableSource, /players\.some\(\(player\) => scalar\(player\.rawMetrics\?\.\[key\]\) !== null\)/);
  assert.match(tableSource, /Изменить ширину столбца/);
});

test("Machete player export preserves selected column order and typed numeric cells", () => {
  assert.match(exportSource, /columns\.map/);
  assert.match(exportSource, /typeof cell !== "number" \|\| !Number\.isFinite\(cell\)/);
  assert.match(exportSource, /format: "xlsx"/);
});

test("client sorting survives filters and controls exported row order", () => {
  const sortableSource = readFileSync(new URL("../components/sortable-table.tsx", import.meta.url), "utf8");
  assert.match(sortableSource, /sortable-table:sort-change/);
  assert.match(sortableSource, /sortTableBody\(table, activeHeader, direction\)/);
  assert.match(tableSource, /const displayedPlayers = useMemo/);
  assert.match(tableSource, /rows: displayedPlayers\.map/);
  assert.match(tableSource, /displayedPlayers\.map\(\(player, index\)/);
});

test("players table reuses squad forecasts for 1 round and 3, 5 or 10 round horizons", () => {
  assert.match(pageSource, /loadCachedFantasySquadPlayerPool/);
  assert.match(pageSource, /forecastByScopedPlayer/);
  assert.match(tableSource, /FP 1R/);
  assert.match(tableSource, /Alt 1R/);
  assert.match(tableSource, /value=\{10\}/);
  assert.match(tableSource, /playerHorizonPoints/);
  assert.match(tableSource, /playerAlternativeHorizonPoints/);
  assert.match(tableSource, /fixtureChipPresentations/);
  assert.match(tableSource, /<FdrRow/);
  assert.doesNotMatch(tableSource, /player\.alternativeScore \?\? 0/);
});
