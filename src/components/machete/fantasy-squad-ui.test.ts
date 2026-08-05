import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatAlternativeScore, formatScore, NULL_GLYPH } from "@/lib/format";
import {
  fixtureChipPresentations,
  isSquadReplacementTarget,
  orderSquadSelectionsWithBenchGoalkeeperLast,
  startingXiFoontasyPoints,
  startingXiAlternativeHorizonPoints,
  startingXiAlternativeRoundPoints,
  startingXiRoundPoints,
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
const formulaAdaptationHoverCardSource = readFileSync(new URL("./FormulaAdaptationHoverCard.tsx", import.meta.url), "utf8");
const squadPlannerBackendSource = readFileSync(new URL("../../machete/squad_planner.ts", import.meta.url), "utf8");
const squadPageSource = readFileSync(new URL("../../app/machete/squad/page.tsx", import.meta.url), "utf8");
const playerTableExportRouteSource = readFileSync(new URL("../../app/api/machete/squads/export-table/route.ts", import.meta.url), "utf8");
const globalStylesSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("round forecast totals available alternative projections and keeps missing players visible through warnings", () => {
  const players = [
    { playerId: "captain", alternativePredictedFp: 4.5, alternativeRoundPoints: [4.5, 5, null] },
    { playerId: "starter", alternativePredictedFp: 3, alternativeRoundPoints: [null, 2.5, 4] }
  ];

  assert.equal(startingXiAlternativeRoundPoints(players, 0), 7.5);
  assert.equal(startingXiAlternativeRoundPoints(players, 1), 7.5);
  assert.equal(startingXiAlternativeRoundPoints(players, 2), 4);
  assert.equal(startingXiAlternativeHorizonPoints(players, 3), 19);
  assert.equal(startingXiAlternativeRoundPoints(players, 0, "captain"), 12);
  assert.equal(startingXiAlternativeHorizonPoints(players, 3, "captain"), 28.5);
  assert.match(squadPlannerSource, /en="Starting XI Alt FP" ru="Альт FP старта"/);
  assert.match(squadPlannerSource, /startingXiAlternativeRoundPoints\(summary\.starterPlayers, index, captainId\)/);
  assert.doesNotMatch(squadPlannerSource, /function playerAlternativeHorizonPoints/);
  assert.match(squadPlannerSource, /Missing rounds are not silently treated as zero/);
});

test("primary round forecast doubles only the captain", () => {
  const players = [
    { playerId: "captain", predictedFp: 4, roundPoints: [4, 5] },
    { playerId: "starter", predictedFp: 3, roundPoints: [3, 2] }
  ];

  assert.equal(startingXiRoundPoints(players, 0, "captain"), 11);
  assert.equal(startingXiRoundPoints(players, 1, "captain"), 12);
});

test("Foontasy total doubles the captain and never treats a missing forecast as zero", () => {
  assert.deepEqual(startingXiFoontasyPoints([
    { playerId: "captain", foontasyPoints: 5 },
    { playerId: "starter", foontasyPoints: 3 }
  ], "captain"), { available: 2, total: 13 });

  assert.deepEqual(startingXiFoontasyPoints([
    { playerId: "captain", foontasyPoints: 5 },
    { playerId: "starter", foontasyPoints: null }
  ], "captain"), { available: 1, total: null });
});

test("transfer suggestions expose FO, ALT, and FFO, while FFO remains a current-round source", () => {
  assert.match(squadPlannerSource, /transferSuggestionForecastSourceOptions/);
  assert.match(squadPlannerSource, /value: "FO", label: "FO"/);
  assert.match(squadPlannerSource, /value: "ALT", label: "ALT"/);
  assert.match(squadPlannerSource, /value: "FFO", label: "FFO"/);
  assert.match(squadPlannerSource, /FFO is published only for the current round/);
  assert.match(squadPlannerSource, /horizon: transferSuggestionHorizon/);
  assert.match(squadPlannerSource, /plannerReadinessBlocksForecastActions/);
  assert.match(squadPlannerSource, /freeTransfers: usesRplTransferRules \? transferLimit : undefined/);
  assert.match(squadPlannerSource, /paidTransferPointCost: usesRplTransferRules \? 0 : undefined/);
  assert.match(squadPlannerSource, /TransferSuggestionPlayerCard/);
  assert.match(squadPlannerSource, /TransferSuggestionCaptain/);
  assert.match(squadPlannerSource, /captainPlayerId/);
  assert.doesNotMatch(squadPlannerSource, /Paid-transfer cost is not configured/);
  assert.doesNotMatch(squadPlannerSource, /The data-quality audit needs attention/);
  assert.doesNotMatch(squadPageSource, /transfer recommendations use the available forecasts/);
});

test("compact transfer suggestions include bookmaker favorites with separate clean-sheet and over-1.5 probabilities", () => {
  assert.match(squadPlannerSource, /xl:grid-cols-3/);
  assert.match(squadPlannerSource, /BookmakerFavoritesTable/);
  assert.match(squadPlannerSource, /en="Bookmaker favorites" ru="Рыночные фавориты"/);
  assert.match(squadPlannerSource, /en="Clean sheet" ru="Сухарь"/);
  assert.match(squadPlannerSource, /en="Team O1\.5" ru="ИТБ 1\.5"/);
  assert.match(squadPlannerSource, /activeRoundBookmakerFavorites/);
  assert.match(squadPlannerBackendSource, /bookmakerFavorites: buildBookmakerFavorites\(roundsAndFixtures\)/);
  assert.match(squadPlannerBackendSource, /pricedSides\.length === 0/);
  assert.match(squadPlannerBackendSource, /if \(fixture\.finished\) continue/);
});

test("auto-pick ignores audit-only warnings but still requires real projections and fresh source data", () => {
  assert.match(squadPlannerSource, /const forecastActionsBlockedByReadiness = plannerReadinessBlocksForecastActions\(readiness\)/);
  assert.match(squadPlannerSource, /const plannerForecastReady = !forecastActionsBlockedByReadiness && hasRealRoundProjections/);
  assert.doesNotMatch(squadPlannerSource, /const plannerForecastReady = readiness\.ready/);
});

test("top forecast metrics use only the starting XI and expose Alt totals", () => {
  assert.match(squadPlannerSource, /value=\{formatScore\(summary\.projectedNext\)\}/);
  assert.doesNotMatch(squadPlannerSource, /summary\.projectedNext\s*\+\s*\(captainBonus/);
  assert.match(squadPlannerSource, /startingXiAlternativeRoundPoints\(summary\.starterPlayers, 0, captainId\)/);
  assert.match(squadPlannerSource, /startingXiAlternativeHorizonPoints\(summary\.starterPlayers, horizon, captainId\)/);
  assert.match(squadPlannerSource, /startingXiFoontasyPoints\(summary\.starterPlayers, captainId\)/);
  assert.match(squadPlannerSource, /tertiaryLabel="FFO"/);
  assert.match(squadPlannerSource, /summary\.starterPlayers\.length === rules\.starterSize/);
});

test("stored Sports squad action sits immediately left of save in the one-line squad header", () => {
  const squadHeading = squadPlannerSource.indexOf('<I18nText en="Your squad" ru="Ваш состав" />');
  const pitch = squadPlannerSource.indexOf("<SquadPitch", squadHeading);
  const headingBlock = squadPlannerSource.slice(squadHeading, pitch);
  const sportsButton = headingBlock.indexOf("onClick={importStoredSportsRuSquad}");
  const saveButton = headingBlock.indexOf("onClick={() => saveSquad(false)}");

  assert.ok(squadHeading >= 0);
  assert.ok(sportsButton >= 0);
  assert.ok(saveButton > sportsButton);
  assert.match(squadPlannerSource, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(headingBlock, /en="Sports squad" ru="Состав Sports"/);
  assert.match(headingBlock, /whitespace-nowrap/);
  assert.match(headingBlock, /id="sports-ru-import-status"/);
  assert.match(headingBlock, /role="status"/);
  assert.match(squadPlannerSource, /Requesting the published Sports\.ru squad and matching its players/);
  assert.match(squadPlannerSource, /response\.status === 202 && payload\.pending/);
  assert.match(squadPlannerSource, /setRoundPlans\(importedRoundPlans\)/);
  assert.match(squadPlannerSource, /setSavedRoundPlans\(cloneFantasyRoundPlans\(importedRoundPlans\)\)/);
  assert.match(squadPlannerSource, /window\.history\.replaceState/);
  assert.doesNotMatch(squadPlannerSource, /window\.location\.replace/);
  assert.equal(squadPlannerSource.match(/onClick=\{\(\) => saveSquad\(false\)\}/g)?.length, 1);
  assert.doesNotMatch(squadPageSource, /SportsRuSquadImport/);
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

test("click replacement targets only the opposite squad group and the same goalkeeper class", () => {
  const starter = squadSelection("def", true, 1);
  const bench = squadSelection("mid", false, 2);
  const benchGoalkeeper = squadSelection("bench-gk", false, 3);

  assert.equal(isSquadReplacementTarget(starter, bench, "DEF", "MID"), true);
  assert.equal(isSquadReplacementTarget(starter, starter, "DEF", "DEF"), false);
  assert.equal(isSquadReplacementTarget(starter, benchGoalkeeper, "DEF", "GK"), false);
  assert.equal(isSquadReplacementTarget(
    squadSelection("starter-gk", true, 0),
    benchGoalkeeper,
    "GK",
    "GK"
  ), true);
});

test("squad exposes a localized click replacement mode and reuses formation validation", () => {
  assert.match(squadPlannerSource, /<I18nText en="Replace" ru="Замена" \/>/);
  assert.match(squadPlannerSource, /onReplacementPlayerClick\(player\.playerId\)/);
  assert.match(squadPlannerSource, /summarizeFantasySquad\(players, nextSelections, rules, horizon\)\.violations\.length > 0/);
  assert.match(squadPlannerSource, /if \(swapPlayers\(replacementSourcePlayerId, playerId\)\)/);
});

test("desktop fixture window uses five compact opponent codes before overflow", () => {
  assert.match(squadPlannerSource, /visibleFixtureChips = fixtureChips\.slice\(0, 5\)/);
  assert.match(squadPlannerSource, /flex-nowrap gap-0\.5 overflow-hidden/);
});

test("desktop planner keeps the club column readable without horizontal overflow", () => {
  assert.match(squadPlannerSource, /xl:grid-cols-\[minmax\(360px,0\.76fr\)_minmax\(620px,1\.24fr\)\]/);
  assert.match(squadPlannerSource, /<col className="w-\[15%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[7%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[5%\]" \/>/);
  assert.match(squadPlannerSource, /<col className="w-\[19%\]" \/>/);
  assert.match(squadPlannerSource, /w-\[3\.6rem\] sm:w-\[3\.8rem\] 2xl:w-\[4\.25rem\]/);
  assert.match(squadPlannerSource, /sm:flex-nowrap/);
});

test("custom player pool uses horizontal scrolling when selected columns exceed the container", () => {
  assert.match(squadPlannerSource, /max-h-\[720px\] w-full max-w-full overflow-auto/);
  assert.match(squadPlannerSource, /table-fixed divide-y/);
  assert.match(squadPlannerSource, /minWidth: `\$\{tableWidth\}px`/);
  assert.doesNotMatch(squadPlannerSource, /min-w-\[720px\]/);
  assert.match(squadPlannerSource, /text-left text-\[10px\] font-semibold uppercase/);
  assert.match(squadPlannerSource, /colSpan=\{5 \+ visibleColumns\.length\}/);
});

test("every desktop player-pool column has a tooltip", () => {
  for (const key of [
    "player",
    "team",
    "position",
    "price",
    "next",
    "horizon",
    "foontasyNext",
    "alternative",
    "alternativeFive",
    "fixtures",
    "action"
  ]) {
    assert.match(squadPlannerSource, new RegExp(`title=\\{columnTitles\\.${key}\\}`));
  }
  assert.doesNotMatch(squadPlannerSource, /columnTitles\.foontasyHorizon|FFO \$\{horizon\}T/);
  assert.match(squadPlannerSource, /initialVisiblePlayerPoolColumns/);
  assert.match(squadPlannerSource, /\/api\/user\/squad-table-columns/);
});

test("Russian player-pool headers stay compact and contained inside their columns", () => {
  assert.match(squadPlannerSource, /en="Team" ru="Клуб"/);
  assert.match(squadPlannerSource, /en="FP" ru="ФО"/);
  assert.match(squadPlannerSource, /en="ALT" ru="Альт"/);
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

test("squad player pool offers imported Wyscout aggregates as optional columns", () => {
  assert.match(squadPlannerSource, /column\("baltikaXg", "W xG"/);
  assert.match(squadPlannerSource, /column\("baltikaXa", "W xA"/);
});

test("custom player table keeps one-line headers and the action as fixed column five", () => {
  assert.match(squadPlannerSource, /player-pool-sortable table-fixed/);
  assert.match(squadPlannerSource, /whitespace-nowrap/);
  assert.match(globalStylesSource, /\.player-pool-sortable th\[data-sortable="true"\]::after[\s\S]*?position: absolute/);

  const rowStart = squadPlannerSource.indexOf("function CustomPlayerPoolRow");
  const priceCell = squadPlannerSource.indexOf("data-sort-value={player.price}", rowStart);
  const actionCell = squadPlannerSource.indexOf('onClick={() => onRemove(player.playerId)}', priceCell);
  const optionalCells = squadPlannerSource.indexOf("columns.map((column) => customPlayerPoolCell", actionCell);
  assert.ok(rowStart >= 0 && priceCell > rowStart && actionCell > priceCell && optionalCells > actionCell);
});

test("custom player table keeps the player name visible during horizontal scrolling", () => {
  assert.match(squadPlannerSource, /<th className="sticky left-0 z-20[\s\S]*?PlayerPoolHeaderLabel/);
  assert.match(squadPlannerSource, /sticky left-0 z-\[5\][\s\S]*?fixedColumnTitles\.player/);
});

test("player table exposes per-field advanced filters and detailed forecast cell tooltips", () => {
  assert.match(squadPlannerSource, /ru="Расширенные фильтры"/);
  assert.match(squadPlannerSource, /playerPoolAdvancedFilterColumns/);
  assert.match(squadPlannerSource, /squadTableValueMatchesFilter/);
  assert.match(squadPlannerSource, /playerPrimaryNextForecastTitle\(player, language, numericValue\)/);
  assert.match(squadPlannerSource, /alternativePlayerForecastTitle\(player, language\)/);
  assert.match(squadPlannerSource, /readableResolvedFormulaExpression/);
  assert.match(squadPlannerSource, /formulaContributionTotalLine/);
  assert.match(squadPlannerSource, /term\.sign === -1/);
  assert.match(squadPlannerSource, /Ожидаемые голы/);
  assert.match(squadPlannerSource, /-poisson_groups\(\$\{expectedGoalsConceded\}, 2\)/);
  assert.match(squadPlannerSource, /legacy calibrated forecast does not expose a component-level arithmetic breakdown/);
  assert.match(squadPlannerSource, /Nearest-fixture starter floor: max\(base/);
  assert.match(squadPlannerSource, /final reliability min\(sample/);
  assert.match(squadPlannerSource, /Starter-role rate blend/);
  assert.match(squadPlannerBackendSource, /starter_role_reliability/);
  assert.match(squadPlannerBackendSource, /blendStarterRoleRate/);
  assert.match(squadPlannerSource, /Минимум основы только на ближайший матч: max\(базовые/);
  assert.match(squadPlannerSource, /It is not applied to later fixtures/);
  assert.doesNotMatch(squadPlannerSource, /club starting-XI uplift/);
  assert.match(squadPlannerBackendSource, /alternativeProjectionFormula: nextFriendFormula/);
  assert.match(squadPlannerSource, /`\$\{horizon\}Т ФФО`/);
});

test("custom player pool restores minutes and confidence under the name with detailed column help", () => {
  assert.match(squadPlannerSource, /playerMetadata[\s\S]*player\.expectedMinutes[\s\S]*player\.forecastConfidence/);
  assert.match(squadPlannerSource, /Уверенность — не вероятность точности прогноза/);
  assert.match(squadPlannerSource, /55% — полнота выборки/);
  assert.match(squadPlannerSource, /30% — стабильность минут/);
  assert.match(squadPlannerSource, /15% — доля матчей/);
  assert.match(squadPlannerSource, /function PlayerPoolHeaderLabel/);
  assert.doesNotMatch(squadPlannerSource, /CircleHelp/);
  assert.match(squadPlannerSource, /sticky left-0 z-\[5\][\s\S]*?Forecast inputs:/);
  assert.match(squadPlannerSource, /Full club name/);
  assert.match(squadPlannerSource, /Полное название клуба/);
  assert.match(squadPlannerSource, /const fullTeamName = player\.teamName\.trim\(\) \|\| teamDisplayName/);
  assert.match(squadPlannerSource, /title=\{teamCellTitle\}/);
  assert.match(squadPlannerSource, /player\.positionGroup\}\\n\$\{fixedColumnTitles\.position\}/);
  assert.match(squadPlannerSource, /verified Sports\.ru fantasy price/);
  assert.match(squadPlannerSource, /title=\{column\.title\}/);
});

test("each account can resize player-pool columns and persist the widths", () => {
  assert.match(squadPlannerSource, /data-column-resize-handle="true"/);
  assert.match(squadPlannerSource, /startColumnResize/);
  assert.match(squadPlannerSource, /body: JSON\.stringify\(\{ columns: visibleColumnKeys, widths: columnWidths \}\)/);
  assert.match(squadPlannerSource, /initialPlayerPoolColumnWidths/);
  assert.match(squadPlannerSource, /ru="Сбросить ширину"/);
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
  assert.match(tileSource, /cardPrimaryNextForecast = nextFantasyPoints\(player\)/);
  assert.match(tileSource, /formatCompactScore\(cardPrimaryNextForecast \* \(isCaptain \? 2 : 1\)\)/);
  assert.match(tileSource, /cardPrimaryHorizonForecast = playerHorizonPoints\(player, 3\)/);
  assert.match(tileSource, /scaleCaptainForecast\(cardAlternativeNextForecast, isCaptain\)/);
  assert.match(tileSource, /scaleCaptainForecast\(cardAlternativeHorizonForecast, isCaptain\)/);
  assert.match(tileSource, /cardFoontasyForecast = scaleCaptainForecast\(player\.foontasyPoints, isCaptain\)/);
  assert.match(tileSource, /formatCompactScore\(cardFoontasyForecast\)/);
  assert.match(tileSource, />FFO<\/dt>/);
  assert.match(tileSource, />ALT1<\/dt>/);
  assert.match(tileSource, />ALT3<\/dt>/);
  assert.match(tileSource, /grid grid-cols-3 gap-x-px/);
  assert.match(tileSource, /grid grid-cols-2 gap-x-px px-1/);
  assert.match(tileSource, /playerPrimaryNextForecastTitle\(player, language, cardPrimaryNextForecast\)/);
  assert.match(tileSource, /playerPrimaryHorizonForecastTitle\(player, language, cardPrimaryHorizonForecast, 3\)/);
  assert.match(tileSource, /alternativePlayerForecastTitle\(player, language\)/);
  assert.match(tileSource, /alternativePlayerHorizonForecastTitle\(player, language, 3\)/);
  assert.match(tileSource, /title=\{cardPrimaryNextTitle\}/);
  assert.match(tileSource, /title=\{cardAlternativeNextTitle\}/);
  assert.match(tileSource, /text-sky-700/);
  assert.doesNotMatch(tileSource, /playerHorizonPoints\(player, horizon\)/);
});

test("squad cards use a smaller position badge", () => {
  assert.match(squadPlannerSource, /rounded px-0\.5 py-px text-\[7px\] font-bold/);
});

test("squad cards place the compact team name in the top-left corner", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /absolute left-0\.5 top-0\.5[\s\S]*?fantasyPlayerTeamDisplayName\(player\)/);
  assert.match(tileSource, /max-w-\[1\.45rem\]/);
  assert.match(tileSource, /flex translate-x-1 items-center justify-center/);
});

test("squad cards show captain to the left and price to the right of the player photo", () => {
  const tileStart = squadPlannerSource.indexOf("function SquadPlayerTile(");
  const tileEnd = squadPlannerSource.indexOf("function fantasyForecastTitle(", tileStart);
  const tileSource = squadPlannerSource.slice(tileStart, tileEnd);
  assert.match(tileSource, /grid-cols-\[1fr_1\.75rem_1fr\][\s\S]*?isCaptain \? "C" : "VC"[\s\S]*?<SquadPlayerPhoto player=\{player\} \/>[\s\S]*?Fantasy price[\s\S]*?formatNumber\(player\.price, 1\)/);
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
  const desktopNext = squadPlannerSource.indexOf('title={columnTitles.next}');
  const desktopHorizon = squadPlannerSource.indexOf('title={columnTitles.horizon}', desktopNext);
  const desktopAlt = squadPlannerSource.indexOf('title={columnTitles.alternative}', desktopHorizon);
  const desktopAltFive = squadPlannerSource.indexOf('title={columnTitles.alternativeFive}', desktopAlt);
  const mobileMetrics = squadPlannerSource.indexOf('grid-cols-4');
  const mobilePrice = squadPlannerSource.indexOf('formatNumber(player.price, 1)', mobileMetrics);
  const mobileAlt = squadPlannerSource.indexOf('formatAlternativeScore(player.alternativePredictedFp)', mobilePrice);

  assert.ok(desktopNext >= 0 && desktopHorizon > desktopNext && desktopAlt > desktopHorizon && desktopAltFive > desktopAlt);
  assert.ok(mobileMetrics >= 0 && mobilePrice > mobileMetrics && mobileAlt > mobilePrice);
  assert.equal(squadPlannerSource.match(/formatAlternativeScore\(player\.alternativePredictedFp\)/g)?.length, 2);
  assert.match(squadPlannerSource, /formatCompactScore\(scaleCaptainForecast\(cardAlternativeNextForecast, isCaptain\), "0"\)/);
  assert.match(squadPlannerSource, /Alternative forecast for next fixture/);
  assert.equal(formatScore(null), NULL_GLYPH);
  assert.equal(formatAlternativeScore(null), "0");
});

test("planner exposes mobile-safe history controls and sends the applied settings when saving", () => {
  assert.match(squadPlannerSource, /fantasyHistoryScopes\.map/);
  assert.match(squadPlannerSource, /fantasyHistoryWindows\.map/);
  assert.match(squadPlannerSource, /type="checkbox"/);
  assert.match(squadPlannerSource, /requestHistorySettings\(historyDraft\)/);
  assert.match(squadPlannerSource, /window\.history\.replaceState/);
  assert.match(squadPlannerSource, /fetch\(playerPoolRequestHref/);
  assert.match(squadPlannerSource, /historyScope: appliedHistorySettings\.scope/);
  assert.match(squadPlannerSource, /historyWindow: appliedHistorySettings\.window/);
  assert.match(squadPlannerSource, /historySeasons: appliedHistorySettings\.selectedSeasons/);
});

test("player pool exposes team, price, local match-scope and typed XLSX export controls", () => {
  assert.match(squadPlannerSource, /value=\{teamFilter\}/);
  assert.match(squadPlannerSource, /value=\{minimumPrice \?\? "ALL"\}/);
  assert.match(squadPlannerSource, /value=\{maximumPrice \?\? "ALL"\}/);
  assert.match(squadPlannerSource, /const \[detailedFormulaTooltips, setDetailedFormulaTooltips\] = useState\(false\)/);
  assert.match(squadPlannerSource, /checked=\{detailedFormulaTooltips\}/);
  assert.match(squadPlannerSource, /ru="Подробные подсказки"/);
  assert.match(squadPlannerSource, /applyQuickHistoryScope\("ALL_PLAYER_MATCHES"\)/);
  assert.match(squadPlannerSource, /downloadPlayerPoolXlsx\(exportPlayers, tableHorizon/);
  assert.match(squadPlannerSource, /player: player\.fotmobName \?\? player\.name/);
  assert.match(playerTableExportRouteSource, /body\.rows\.length > 1_000/);
  assert.doesNotMatch(playerTableExportRouteSource, /at most 140/);
  assert.match(squadPlannerSource, /const filteredPlayers = matchingPlayers/);
  assert.doesNotMatch(squadPlannerSource, /slice\(0, 140\)/);
  assert.match(squadPlannerSource, /\/api\/machete\/squads\/export-table/);
  assert.match(squadPlannerSource, /\.xlsx`/);
  assert.doesNotMatch(squadPlannerSource, /starterPoolFilter/);
  assert.match(squadPlannerSource, /createFantasyFitEvaluator/);
  assert.match(squadPlannerSource, /setTimeout\(resolve, 0\)/);
  assert.match(squadPlannerSource, /Calculating\.\.\./);
});

test("player-pool XLSX follows the selected optional-column order", () => {
  assert.match(squadPlannerSource, /const \[exportColumnKeys, setExportColumnKeys\] = useState\(initialVisiblePlayerPoolColumns\)/);
  assert.match(squadPlannerSource, /onVisibleColumnsChange=\{setExportColumnKeys\}/);
  assert.match(squadPlannerSource, /downloadPlayerPoolXlsx\(exportPlayers, tableHorizon, language, leagueId, season, exportColumnKeys\)/);
  assert.match(squadPlannerSource, /visibleColumnKeys[\s\S]*optionalColumnsByKey\.get\(key\)/);
  assert.match(squadPlannerSource, /\.\.\.selectedColumns\.map\(\(column\) => \(\{ key: column\.key, header: column\.label \}\)\)/);
  assert.match(squadPlannerSource, /Object\.fromEntries\(selectedColumns\.map/);
  assert.match(playerTableExportRouteSource, /fixedColumnKeys = \["player", "team", "position", "price"\]/);
  assert.match(playerTableExportRouteSource, /isSquadTableColumnsInput\(columns\.slice/);
  assert.match(playerTableExportRouteSource, /requestedColumns\.map/);
  assert.match(playerTableExportRouteSource, /typeof value === "number"/);
});

test("every one-round forecast exposes sortable points-per-price asset efficiency", () => {
  assert.match(squadPlannerSource, /column\("nextFpPerPrice", "FP\/price", "ФО\/цена"/);
  assert.match(squadPlannerSource, /column\("foontasyPerPrice", "FFO\/price", "ФФО\/цена"/);
  assert.match(squadPlannerSource, /column\("alternativePerPrice", "Alt\/price", "Альт\/цена"/);
  assert.match(squadPlannerSource, /forecastPointsPerPrice\(nextFantasyPoints\(player\), player\.price\)/);
  assert.match(squadPlannerSource, /forecastPointsPerPrice\(player\.foontasyPoints, player\.price\)/);
  assert.match(squadPlannerSource, /forecastPointsPerPrice\(player\.alternativePredictedFp, player\.price\)/);
  assert.doesNotMatch(squadPlannerSource, /inlineEfficiency/);
});

test("squad player pool exposes every formula-adaptation forecast as a separate column", () => {
  for (const [key, label] of [
    ["foPositionCalibratedFp", "FO position cal."],
    ["altPositionCalibratedFp", "Alt position cal."],
    ["altJointAllFp", "Alt Joint all"],
    ["foJointAllFp", "FO Joint all"],
    ["altJointAcceptedFp", "Alt Joint accepted"],
    ["foJointAcceptedFp", "FO Joint accepted"]
  ]) {
    assert.match(squadPlannerSource, new RegExp(`column\\("${key}", "${label.replaceAll(".", "\\.")}"`));
    assert.match(squadPlannerSource, new RegExp(`case "${key}": return player\\.${key} \\?\\? null`));
  }
  assert.match(squadPlannerSource, /Weather is not used/);
  assert.match(squadPlannerSource, /Weather is excluded/);
  assert.match(squadPlannerSource, /<FormulaAdaptationHoverCard/);
  assert.match(squadPlannerSource, /detailed=\{detailedFormulaTooltips\}/);
  assert.match(squadPlannerSource, /formulaAdaptationForecastKeys/);
  assert.match(formulaAdaptationHoverCardSource, /numericTerms\.map/);
  assert.match(formulaAdaptationHoverCardSource, /categoricalTerms\.map/);
  assert.match(formulaAdaptationHoverCardSource, /numericContributionTotal/);
  assert.match(formulaAdaptationHoverCardSource, /missingContribution/);
  assert.match(formulaAdaptationHoverCardSource, /trainedMedian/);
  assert.match(formulaAdaptationHoverCardSource, /requestCacheMaximumEntries = 80/);
});

test("player-pool controls use two desktop rows and the search targets only player names", () => {
  assert.match(squadPlannerSource, /relative z-30 mb-2 flex flex-wrap items-center justify-between gap-2 overflow-visible/);
  assert.match(squadPlannerSource, /flex min-w-0 flex-wrap items-center justify-end gap-2/);
  assert.match(squadPlannerSource, /whitespace-nowrap rounded border border-emerald-200/);
  assert.match(squadPlannerSource, /toolbar={\(/);
  assert.match(squadPlannerSource, /mb-3 flex min-w-0 flex-wrap items-start gap-2 xl:flex-nowrap/);
  assert.match(squadPlannerSource, /placeholder=\{localizedText\(language, "Name", "Имя"\)\}/);
  assert.match(squadPlannerSource, /player\.name\.toLowerCase\(\)\.includes\(normalizedQuery\)/);
  assert.doesNotMatch(squadPlannerSource, /`\$\{player\.name\} \$\{player\.teamName\}/);
  assert.match(squadPlannerSource, /grid-cols-2 gap-2 lg:grid-cols-5/);
  assert.match(squadPlannerSource, /en="Fits" ru="Проходит"/);
  assert.match(squadPlannerSource, /<details className="relative shrink-0">[\s\S]*?<I18nText en="Columns" ru="Столбцы"/);
  assert.match(squadPlannerSource, /className="col-span-full hidden min-w-0 max-w-full/);
});

test("preset and advanced-filter popovers are not clipped by the player-pool toolbar", () => {
  assert.match(squadPlannerSource, /relative z-30 mb-2 flex flex-wrap items-center justify-between gap-2 overflow-visible/);
  assert.doesNotMatch(squadPlannerSource, /mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto/);
  assert.equal((squadPlannerSource.match(/<details className="relative open:z-50">/g) ?? []).length, 2);
});

test("name search masks cached player rows without rerendering the planner and export applies the same query", () => {
  assert.match(squadPlannerSource, /function PlayerPoolMaskedNameSearch/);
  assert.match(squadPlannerSource, /queryRef\.current = query/);
  assert.match(squadPlannerSource, /requestAnimationFrame/);
  assert.match(squadPlannerSource, /querySelectorAll<HTMLElement>\("\[data-player-search-row\]"\)/);
  assert.match(squadPlannerSource, /row\.hidden = !matches/);
  assert.match(squadPlannerSource, /data-player-search-name=\{player\.name\.toLowerCase\(\)\}/);
  assert.match(squadPlannerSource, /filterPlayerPoolByNameQuery\(matchingPlayers, playerNameQueryRef\.current\)/);
  assert.doesNotMatch(squadPlannerSource, /const \[query, setQuery\] = useState/);
  assert.doesNotMatch(squadPlannerSource, /deferredQuery/);
});

test("table forecast tooltips and compact controls cover both English and Russian", () => {
  assert.match(squadPlannerSource, /"Appearance FP": "ФО за выход"/);
  assert.ok(squadPlannerSource.includes("`- Expected minutes: ${expectedMinutes}`"));
  assert.ok(squadPlannerSource.includes("`- Ожидаемые минуты: ${expectedMinutes}`"));
  assert.match(squadPlannerSource, /"No round-by-round values available yet\."/);
  assert.match(squadPlannerSource, /"Значений по отдельным турам пока нет\."/);
  assert.match(squadPlannerSource, /Nearest-fixture starter floor/);
  assert.match(squadPlannerSource, /Минимум основы только на ближайший матч/);
  assert.match(squadPlannerSource, /Cautious per-90 exposure/);
  assert.match(squadPlannerSource, /Осторожная экспозиция per 90/);
  assert.match(squadPlannerSource, /Effective per-90 transfer penalty/);
  assert.match(squadPlannerSource, /negative Poisson groups of 2 from expected goals conceded/);
  assert.doesNotMatch(squadPlannerSource, /not used in alternative score/);
  assert.doesNotMatch(squadPlannerSource, /не используется в формуле Альт/);
  assert.match(squadPlannerSource, /en="Export table" ru="Выгрузить таблицу"/);
  assert.match(squadPlannerSource, /en="Presets" ru="Пресеты"/);
});

test("every player-pool value cell gets player-specific provenance and arithmetic", () => {
  assert.match(squadPlannerSource, /return playerPoolMetricValueTitle\(column, player, language, rawValue\)/);
  assert.match(squadPlannerSource, /History sample:/);
  assert.match(squadPlannerSource, /Exposure ratio:/);
  assert.match(squadPlannerSource, /not a universal direct multiplier/);
  assert.match(squadPlannerSource, /55% sample completeness \+ 30% minute stability \+ 15% completeness/);
  assert.match(squadPlannerSource, /appendHistoricalMetricCalculation/);
  assert.match(squadPlannerSource, /× 90 \//);
  assert.match(squadPlannerSource, /next fixtures/);
  assert.doesNotMatch(squadPlannerSource, /if \(column\.key === "alternativeHorizon"\)[^\n]+\n  return column\.title/);
});

test("player-pool columns use compact padding and allow narrow saved widths", () => {
  assert.match(squadPlannerSource, /width = 72/);
  assert.match(squadPlannerSource, /const minimumPlayerPoolColumnWidth = 40/);
  assert.match(squadPlannerSource, /action: 40/);
  assert.match(squadPlannerSource, /overflow-hidden text-ellipsis whitespace-nowrap px-1 py-1\.5/);
});

test("Sports.ru XLSX price import is not exposed on the squad page", () => {
  assert.doesNotMatch(squadPageSource, /FantasyPriceSheetImportForm/);
});

test("squad page shows source freshness and has no data-tools menu", () => {
  assert.match(squadPageSource, /Стата FotMob:/);
  assert.match(squadPageSource, /Цены Sports\.ru:/);
  assert.match(squadPageSource, /Кэфы букмекера:/);
  assert.match(squadPageSource, /formatDateTime\(freshness\.fotmobStatsAt\)/);
  assert.match(squadPageSource, /formatDateTime\(freshness\.bookmakerOddsAt\)/);
  assert.doesNotMatch(squadPageSource, /Data tools|Инструменты|squadExportHref/);
});
