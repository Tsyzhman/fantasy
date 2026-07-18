import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatScore, NULL_GLYPH } from "@/lib/format";
import { fixtureChipPresentations } from "./fantasy-squad-ui";

const squadPlannerSource = readFileSync(new URL("./FantasySquadPlanner.tsx", import.meta.url), "utf8");

test("fixture chips hide H/A from visible labels but retain side and original title", () => {
  assert.deepEqual(
    fixtureChipPresentations(["H Arsenal", "Chelsea (A)", "H Fulham, A Everton"], [2, 4, 3], 3),
    [
      { label: "Arsenal", title: "H Arsenal", side: "home", difficulty: 2 },
      { label: "Chelsea", title: "Chelsea (A)", side: "away", difficulty: 4 },
      { label: "Fulham", title: "H Fulham", side: "home", difficulty: 3 },
      { label: "Everton", title: "A Everton", side: "away", difficulty: 3 }
    ]
  );
});

test("fixture chips keep compact labels but expose full opponent names", () => {
  assert.deepEqual(
    fixtureChipPresentations(
      ["H MUN, A BHA"],
      [3],
      1,
      ["H Manchester United, A Brighton & Hove Albion"]
    ),
    [
      { label: "MUN", title: "H Manchester United", side: "home", difficulty: 3 },
      { label: "BHA", title: "A Brighton & Hove Albion", side: "away", difficulty: 3 }
    ]
  );
});

test("desktop fixture window uses five compact opponent codes before overflow", () => {
  assert.match(squadPlannerSource, /visibleFixtureChips = fixtureChips\.slice\(0, 5\)/);
  assert.match(squadPlannerSource, /flex-nowrap gap-0\.5 overflow-hidden/);
});

test("desktop planner gives the pitch more width and keeps the compact team column", () => {
  assert.match(squadPlannerSource, /xl:grid-cols-\[minmax\(360px,0\.82fr\)_minmax\(560px,1\.18fr\)\]/);
  assert.match(squadPlannerSource, /<col className="w-\[9%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[24%\]" \/>/);
  assert.match(squadPlannerSource, /sm:w-16 2xl:w-\[4\.25rem\]/);
});

test("every desktop player-pool column has a tooltip", () => {
  for (const key of ["player", "team", "position", "price", "next", "alternative", "horizon", "wyscoutXg", "fixtures", "action"]) {
    assert.match(squadPlannerSource, new RegExp(`title=\\{columnTitles\\.${key}\\}`));
  }
});

test("Russian player-pool headers stay compact and contained inside their columns", () => {
  assert.match(squadPlannerSource, /en="Team" ru="Клуб"/);
  assert.match(squadPlannerSource, /en="Next" ru="ФО"/);
  assert.match(squadPlannerSource, /en="Alt" ru="Альт"/);
  assert.ok((squadPlannerSource.match(/overflow-hidden px-/g)?.length ?? 0) >= 10);
  assert.doesNotMatch(squadPlannerSource, /overflow-hidden text-ellipsis px-/);
});

test("squad cards expose only captain and vice-captain controls with corner removal", () => {
  assert.doesNotMatch(squadPlannerSource, /onToggleLock|onToggleStarter|<Star|<Unlock/);
  assert.match(squadPlannerSource, /onClick=\{\(\) => onRemove\(player\.playerId\)\}[\s\S]*?absolute right-0\.5 top-0\.5/);
  assert.match(squadPlannerSource, /onToggleCaptain\(player\.playerId\)/);
  assert.match(squadPlannerSource, /onToggleVice\(player\.playerId\)/);
});

test("squad cards show only the next opponent without a remaining-fixtures counter", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /fixtures=\{fixtureChips\.slice\(0, 1\)\}/);
  assert.doesNotMatch(tileSource, /\+\{fixtureChips\.length - 1\}/);
});

test("player pool renders display-only Alt FP on desktop and as the fourth mobile metric", () => {
  const desktopNext = squadPlannerSource.indexOf('en="Next"');
  const desktopAlt = squadPlannerSource.indexOf('title={columnTitles.alternative}><I18nText en="Alt"', desktopNext);
  const desktopHorizon = squadPlannerSource.indexOf('title={columnTitles.horizon}', desktopAlt);
  const mobileMetrics = squadPlannerSource.indexOf('grid-cols-4');
  const mobilePrice = squadPlannerSource.indexOf('formatNumber(player.price, 1)', mobileMetrics);
  const mobileAlt = squadPlannerSource.indexOf('formatScore(player.alternativePredictedFp)', mobilePrice);

  assert.ok(desktopNext >= 0 && desktopAlt > desktopNext && desktopHorizon > desktopAlt);
  assert.ok(mobileMetrics >= 0 && mobilePrice > mobileMetrics && mobileAlt > mobilePrice);
  assert.equal(squadPlannerSource.match(/formatScore\(player\.alternativePredictedFp\)/g)?.length, 2);
  assert.match(squadPlannerSource, /Display only: not used by auto-pick, value, transfers, or round points\./);
  assert.equal(formatScore(null), NULL_GLYPH);
});

test("planner exposes mobile-safe history controls and sends the applied settings when saving", () => {
  assert.match(squadPlannerSource, /fantasyHistoryScopes\.map/);
  assert.match(squadPlannerSource, /fantasyHistoryWindows\.map/);
  assert.match(squadPlannerSource, /type="checkbox"/);
  assert.match(squadPlannerSource, /applyFantasyHistorySearchParams\(url\.searchParams, historyDraft\)/);
  assert.match(squadPlannerSource, /historyScope: historySettings\.scope/);
  assert.match(squadPlannerSource, /historyWindow: historySettings\.window/);
  assert.match(squadPlannerSource, /historySeasons: historySettings\.selectedSeasons/);
});
