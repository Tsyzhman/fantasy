import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatAlternativeScore, formatScore, NULL_GLYPH } from "@/lib/format";
import {
  fixtureChipPresentations,
  orderSquadSelectionsWithBenchGoalkeeperLast,
  swapSquadSelectionCards
} from "./fantasy-squad-ui";

const squadPlayers = [
  { playerId: "starter-gk", positionGroup: "GK" },
  { playerId: "bench-gk", positionGroup: "GK" },
  { playerId: "def", positionGroup: "DEF" },
  { playerId: "mid", positionGroup: "MID" }
] as const;

function squadSelection(playerId: string, isStarter: boolean, slotIndex: number) {
  return { playerId, isStarter, slotIndex, isLocked: false, isCaptain: false, isViceCaptain: false, purchasePrice: 5 };
}

const squadPlannerSource = readFileSync(new URL("./FantasySquadPlanner.tsx", import.meta.url), "utf8");

test("primary squad save action sits beside the Your squad heading without a duplicate", () => {
  const squadHeading = squadPlannerSource.indexOf('<I18nText en="Your squad" ru="Ваш состав" />');
  const pitch = squadPlannerSource.indexOf("<SquadPitch", squadHeading);
  const headingBlock = squadPlannerSource.slice(squadHeading, pitch);

  assert.ok(squadHeading >= 0);
  assert.match(headingBlock, /onClick=\{\(\) => saveSquad\(false\)\}/);
  assert.equal(squadPlannerSource.match(/onClick=\{\(\) => saveSquad\(false\)\}/g)?.length, 1);
});

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

test("bench order is persisted by slot and always places its goalkeeper last", () => {
  const ordered = orderSquadSelectionsWithBenchGoalkeeperLast([
    squadSelection("starter-gk", true, 0),
    squadSelection("bench-gk", false, 1),
    squadSelection("mid", false, 3),
    squadSelection("def", false, 2)
  ], squadPlayers);

  assert.deepEqual(ordered.map((selection) => selection.playerId), ["starter-gk", "def", "mid", "bench-gk"]);
  assert.deepEqual(ordered.map((selection) => selection.slotIndex), [0, 1, 2, 3]);
});

test("dropping a bench card on another swaps their persisted order", () => {
  const result = swapSquadSelectionCards([
    squadSelection("starter-gk", true, 0),
    squadSelection("def", false, 1),
    squadSelection("mid", false, 2),
    squadSelection("bench-gk", false, 3)
  ], squadPlayers, "def", "mid");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.selections.map((selection) => selection.playerId), ["starter-gk", "mid", "def", "bench-gk"]);
});

test("dropping a starter on a bench player swaps their roles", () => {
  const result = swapSquadSelectionCards([
    squadSelection("starter-gk", true, 0),
    squadSelection("def", true, 1),
    squadSelection("mid", false, 2),
    squadSelection("bench-gk", false, 3)
  ], squadPlayers, "def", "mid");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selections.find((selection) => selection.playerId === "def")?.isStarter, false);
  assert.equal(result.selections.find((selection) => selection.playerId === "mid")?.isStarter, true);
  assert.equal(result.selections.at(-1)?.playerId, "bench-gk");
});

test("goalkeepers can swap only with goalkeepers and the bench goalkeeper stays rightmost", () => {
  const selections = [
    squadSelection("starter-gk", true, 0),
    squadSelection("def", true, 1),
    squadSelection("mid", false, 2),
    squadSelection("bench-gk", false, 3)
  ];
  assert.deepEqual(swapSquadSelectionCards(selections, squadPlayers, "bench-gk", "mid"), {
    ok: false,
    reason: "GOALKEEPER_MISMATCH"
  });

  const result = swapSquadSelectionCards(selections, squadPlayers, "starter-gk", "bench-gk");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selections.find((selection) => selection.playerId === "bench-gk")?.isStarter, true);
  assert.equal(result.selections.at(-1)?.playerId, "starter-gk");
});

test("desktop fixture window uses five compact opponent codes before overflow", () => {
  assert.match(squadPlannerSource, /visibleFixtureChips = fixtureChips\.slice\(0, 5\)/);
  assert.match(squadPlannerSource, /flex-nowrap gap-0\.5 overflow-hidden/);
});

test("desktop planner keeps the club column readable without horizontal overflow", () => {
  assert.match(squadPlannerSource, /xl:grid-cols-\[minmax\(360px,0\.82fr\)_minmax\(560px,1\.18fr\)\]/);
  assert.match(squadPlannerSource, /<col className="w-\[21%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[7%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[23%\]" \/>/);
  assert.match(squadPlannerSource, /w-\[4\.5rem\] sm:w-20 2xl:w-\[5\.5rem\]/);
});

test("desktop player pool fits its container without a horizontal scrollbar", () => {
  assert.match(squadPlannerSource, /min-w-0 max-h-\[720px\] w-full max-w-full overflow-x-hidden overflow-y-auto/);
  assert.match(squadPlannerSource, /w-full min-w-0 table-fixed/);
  assert.doesNotMatch(squadPlannerSource, /min-w-\[720px\]/);
  assert.match(squadPlannerSource, /text-left text-\[10px\] font-semibold uppercase/);
  assert.match(squadPlannerSource, /<td colSpan=\{10\}/);
});

test("every desktop player-pool column has a tooltip", () => {
  for (const key of ["player", "team", "position", "price", "next", "alternative", "alternativeFive", "horizon", "fixtures", "action"]) {
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
  assert.match(squadPlannerSource, /absolute bottom-0\.5 left-0\.5[\s\S]*?>\s*C\s*/);
  assert.match(squadPlannerSource, /absolute bottom-0\.5 right-0\.5[\s\S]*?>\s*VC\s*/);
  assert.doesNotMatch(squadPlannerSource, /absolute -top-1\.5 left-1\/2/);
});

test("squad cards show three upcoming opponents without a remaining-fixtures counter", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /Math\.max\(horizon, 3\)/);
  assert.match(tileSource, /fixtures=\{fixtureChips\.slice\(0, 3\)\}/);
  assert.doesNotMatch(tileSource, /\+\{fixtureChips\.length - 1\}/);
  assert.doesNotMatch(tileSource, /W xG|player\.baltikaXg/);
});

test("squad player pool does not expose Wyscout xG", () => {
  assert.doesNotMatch(squadPlannerSource, /Wyscout xG|W xG|columnTitles\.wyscoutXg/);
});

test("squad player pool exposes a real five-round alternative forecast", () => {
  assert.match(squadPlannerSource, /playerAlternativeHorizonPoints\(player, 5\)/);
  assert.match(squadPlannerSource, /en="Alt 5R" ru="Альт 5Т"/);
  assert.match(squadPlannerSource, /alternativeRoundPoints: player\.alternativeRoundPoints\?\.slice\(roundOffset\)/);
});

test("squad cards distinguish next-round FP from a three-round forecast", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /formatScore\(nextFantasyPoints\(player\) \* \(isCaptain \? 2 : 1\)\)/);
  assert.match(tileSource, /playerHorizonPoints\(player, 3\)/);
  assert.match(tileSource, /formatAlternativeScore\(player\.alternativePredictedFp\)/);
  assert.match(tileSource, /playerAlternativeHorizonPoints\(player, 3\)/);
  assert.match(tileSource, /Alt 1/);
  assert.match(tileSource, /Alt 3/);
  assert.match(tileSource, /text-sky-700/);
  assert.doesNotMatch(tileSource, /playerHorizonPoints\(player, horizon\)/);
});

test("squad cards use a smaller position badge", () => {
  assert.match(squadPlannerSource, /rounded px-1 py-px text-\[8px\] font-bold/);
});

test("squad cards place the compact team name in the top-left corner", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /absolute left-0\.5 top-0\.5[\s\S]*?fantasyPlayerTeamDisplayName\(player\)/);
});

test("squad cards show captain to the left and price to the right of the player photo", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /grid-cols-\[1fr_2rem_1fr\][\s\S]*?isCaptain \? "C" : "VC"[\s\S]*?<SquadPlayerPhoto player=\{player\} \/>[\s\S]*?Fantasy price[\s\S]*?formatNumber\(player\.price, 1\)/);
  assert.match(tileSource, /player\.priceSource === "ESTIMATED" \? "~" : ""/);
});

test("squad cards lazy-load locally cached FotMob player photos with a fallback", () => {
  assert.match(squadPlannerSource, /<SquadPlayerPhoto player=\{player\} \/>/);
  assert.match(squadPlannerSource, /src=\{player\.photoUrl\}/);
  assert.match(squadPlannerSource, /loading="lazy"/);
  assert.match(squadPlannerSource, /onError=\{\(\) => setFailed\(true\)\}/);
});

test("planner exposes five persisted round snapshots and shifts forecasts to the active round", () => {
  assert.match(squadPlannerSource, /roundPlans\.map\(\(plan\) =>/);
  assert.match(squadPlannerSource, /plan\.roundOffset === 0 \? <I18nText en="Next" ru="Следующий" \/> : `\+\$\{plan\.roundOffset\}`/);
  assert.match(squadPlannerSource, /roundPlans: roundPlansToSave/);
  assert.match(squadPlannerSource, /roundPoints: player\.roundPoints\.slice\(roundOffset\)/);
  assert.match(squadPlannerSource, /fixtureDifficulties: player\.fixtureDifficulties\.slice\(roundOffset\)/);
  assert.match(squadPlannerSource, /Inherit previous/);
});

test("display-only Alt FP renders in the desktop pool, mobile pool, and squad card", () => {
  const desktopNext = squadPlannerSource.indexOf('en="Next"');
  const desktopHorizon = squadPlannerSource.indexOf('title={columnTitles.horizon}', desktopNext);
  const desktopAlt = squadPlannerSource.indexOf('title={columnTitles.alternative}><I18nText en="Alt"', desktopHorizon);
  const desktopAltFive = squadPlannerSource.indexOf('title={columnTitles.alternativeFive}', desktopAlt);
  const mobileMetrics = squadPlannerSource.indexOf('grid-cols-4');
  const mobilePrice = squadPlannerSource.indexOf('formatNumber(player.price, 1)', mobileMetrics);
  const mobileAlt = squadPlannerSource.indexOf('formatAlternativeScore(player.alternativePredictedFp)', mobilePrice);

  assert.ok(desktopNext >= 0 && desktopHorizon > desktopNext && desktopAlt > desktopHorizon && desktopAltFive > desktopAlt);
  assert.ok(mobileMetrics >= 0 && mobilePrice > mobileMetrics && mobileAlt > mobilePrice);
  assert.equal(squadPlannerSource.match(/formatAlternativeScore\(player\.alternativePredictedFp\)/g)?.length, 3);
  assert.match(squadPlannerSource, /Display only: not used by auto-pick, value, transfers, or round points\./);
  assert.equal(formatScore(null), NULL_GLYPH);
  assert.equal(formatAlternativeScore(null), "0");
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
