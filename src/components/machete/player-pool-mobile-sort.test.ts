/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FantasyPlannerPlayer } from "@/machete/squad_logic";
import {
  customPlayerPoolCell, customPlayerPoolColumnDisplay, customPlayerPoolColumnValue, playerPoolOptionalColumns, playerPoolSortOptions, playerPoolValueCellTitle,
  sortPlayerPoolRows, supportedPlayerPoolSort, type PlayerPoolOptionalColumn
} from "./PlayerPool";
import { squadResearchColumnKeys } from "@/machete/squad-research-columns";
import { toFantasyPlayerPoolListItem } from "@/machete/squad-player-dto";
import { squadTableValueMatchesFilter } from "@/machete/squad-table-columns";
import { playerPoolExportCellValue } from "./planner-data";
import { fantasyPlayerAtRoundOffset } from "./planner-squad-commands";

function player(id: string, fields: Partial<FantasyPlannerPlayer> = {}): FantasyPlannerPlayer {
  return { id, playerId: id, name: id, teamId: "club", teamName: "Club", leagueName: "Fixture", position: "MID", positionGroup: "MID", price: 5, priceSource: "ESTIMATED", predictedFp: 0, valueScore: 0, roundPoints: [0], fixtures: [], fixtureDifficulties: [], ...fields };
}
const column = (key: string): PlayerPoolOptionalColumn => ({ key, label: key, title: key, numeric: true, width: 72 });
const rows = [player("missing", { foontasyPoints: null }), player("zero", { foontasyPoints: 0 }), player("tie-first", { foontasyPoints: 4 }), player("tie-second", { foontasyPoints: 4 }), player("negative", { foontasyPoints: -2 })];

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast */
test("opponent columns expose the selected round and sort complete horizons ahead of old snapshots", () => {
  const adjusted = player("adjusted", {
    opponentAdjustedRoundPoints: [4.5, 0, 3.2],
    alternativeOpponentAdjustedRoundPoints: [4.61, 0, 3.18],
    opponentAttackAdjustment: { goalFactor: 1.08, assistFactor: 0.96, ratedMatches: 7 }
  });
  const old = player("old");
  const options = playerPoolOptionalColumns([adjusted, old], 3, "ru");
  const next = options.find((item) => item.key === "opponentAdjustedFp")!;
  assert.equal(next.label, "ФО соп.");
  assert.match(playerPoolValueCellTitle(next, adjusted, 3, "ru", 4.5), /Матчей с рейтингом соперника — 7/);
  assert.equal(customPlayerPoolColumnValue(next.key, fantasyPlayerAtRoundOffset(adjusted, 1), 3), 0);
  assert.equal(customPlayerPoolColumnValue("opponentAdjustedHorizon", adjusted, 3), 7.7);
  assert.equal(customPlayerPoolColumnValue("opponentAdjustedHorizon", fantasyPlayerAtRoundOffset(adjusted, 1), 3), null);
  assert.deepEqual(sortPlayerPoolRows([old, adjusted], { key: "opponentAdjustedHorizon", direction: "desc" }, 3).map((row) => row.playerId), ["adjusted", "old"]);
  assert.ok(!playerPoolOptionalColumns([], 3, "en", "FPL").some((item) => item.key === next.key));
  const alt = options.find((item) => item.key === "alternativeOpponentAdjustedFp")!;
  assert.equal(alt.label, "Альт соп.");
  assert.match(playerPoolValueCellTitle(alt, adjusted, 3, "ru", 4.61), /Матчей с рейтингом соперника — 7/);
  assert.equal(customPlayerPoolColumnValue(alt.key, fantasyPlayerAtRoundOffset(adjusted, 1), 3), 0);
  assert.equal(customPlayerPoolColumnValue("alternativeOpponentAdjustedHorizon", adjusted, 3), 7.79);
  assert.equal(customPlayerPoolColumnValue("alternativeOpponentAdjustedHorizon", fantasyPlayerAtRoundOffset(adjusted, 1), 3), null);
  assert.deepEqual(sortPlayerPoolRows([old, adjusted], { key: alt.key, direction: "desc" }, 3).map((row) => row.playerId), ["adjusted", "old"]);
  assert.ok(!playerPoolOptionalColumns([], 3, "en", "FPL").some((item) => item.key === alt.key));
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#projection-precision */
test("forecast columns display and sort numeric hundredths for a round and a horizon", () => {
  const barco = player("barco", {
    roundPoints: [6.26, 5.61],
    alternativeRoundPoints: [5.24, 4.62],
    opponentAdjustedRoundPoints: [6.25, 5.62]
  });
  for (const [key, expected] of [
    ["nextFp", 6.26], ["opponentAdjustedFp", 6.25], ["horizonFp", 11.87],
    ["opponentAdjustedHorizon", 11.87], ["alternativeHorizon", 9.86]
  ] as const) {
    const value = customPlayerPoolColumnValue(key, barco, 2);
    assert.equal(value, expected);
    assert.equal(customPlayerPoolColumnDisplay(key, value, "ru"), expected.toFixed(2));
  }
  assert.equal(customPlayerPoolColumnDisplay("nextFp", 6.3, "ru"), "6.30");
  assert.equal(customPlayerPoolColumnDisplay("alternativeOpponentAdjustedFp", 0, "ru"), "0.00");
  assert.equal(customPlayerPoolColumnDisplay("alternativeOpponentAdjustedFp", null, "ru"), "—");
  assert.equal(customPlayerPoolColumnDisplay("nextFp", 6.3, "ru", "FPL"), "6.3");
  const altOpp = playerPoolOptionalColumns([], 2, "ru").find(({ key }) => key === "alternativeOpponentAdjustedFp")!;
  const withComparison = { ...barco, alternativeOpponentAdjustedRoundPoints: [6.3, 0] };
  const cell = renderToStaticMarkup(customPlayerPoolCell(altOpp, withComparison, 2, "ru", false, undefined, false, "SPORTS_RU"));
  assert.match(cell, /data-sort-value="6\.3"[^>]*>6\.30<\/td>/);
  const second = player("second", { opponentAdjustedRoundPoints: [6.24] });
  const sort = { key: "opponentAdjustedFp", direction: "desc" } as const;
  assert.deepEqual(sortPlayerPoolRows([second, barco], sort, 1).map(({ playerId }) => playerId), ["barco", "second"]);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts */
test("research forecasts keep numeric round values in the compact table, filters, sort and export", () => {
  const options = playerPoolOptionalColumns([], 3, "ru");
  assert.deepEqual(options.filter(({ key }) => key.startsWith("research")).map(({ key }) => key), squadResearchColumnKeys);
  assert.ok(playerPoolOptionalColumns([], 3, "ru", "FPL").every(({ key }) => !key.startsWith("research")));
  const latest = toFantasyPlayerPoolListItem(player("latest", {
    researchRoundPoints: [[4.23, 3.99, 4.01, 3.75, 4.18], [0, 0, 0, 0, 0], null]
  }));
  const old = player("old");
  const key = "researchRidge";
  assert.equal(customPlayerPoolColumnValue(key, latest, 3), 4.23);
  assert.equal(customPlayerPoolColumnDisplay(key, customPlayerPoolColumnValue(key, latest, 3), "ru"), "4.23");
  assert.equal(customPlayerPoolColumnValue(key, fantasyPlayerAtRoundOffset(latest, 1), 3), 0);
  assert.equal(customPlayerPoolColumnValue(key, fantasyPlayerAtRoundOffset(latest, 2), 3), null);
  assert.equal(playerPoolExportCellValue(key, latest, 3), 4.23);
  assert.ok(squadTableValueMatchesFilter(playerPoolExportCellValue(key, latest, 3), { minimum: "4.20", maximum: "4.25", query: "" }, true));
  assert.deepEqual(sortPlayerPoolRows([old, latest], { key, direction: "asc" }, 3).map(({ playerId }) => playerId), ["latest", "old"]);
});

for (const language of ["en", "ru"] as const) {
  test(`mobile choices include fixed and selected metrics, excluding fixtures/actions: ${language}`, () => {
    const options = playerPoolSortOptions([column("foontasy"), column("stat:shots"), column("fixtures"), column("action")], rows, 3, language);
    assert.deepEqual(options.map(({ key }) => key), ["player", "team", "position", "price", "foontasy", "stat:shots"]);
    assert.ok(options.find(({ key }) => key === "foontasy")?.available);
    assert.equal(options.find(({ key }) => key === "stat:shots")?.available, false);
    assert.equal(options[0].label, language === "en" ? "Player" : "Игрок");
  });
}

test("known zero enables a metric; wholly absent or nonfinite values do not", () => {
  assert.equal(playerPoolSortOptions([column("foontasy")], [player("zero", { foontasyPoints: 0 })], 3, "en").at(-1)?.available, true);
  for (const value of [null, NaN, Infinity, -Infinity]) assert.equal(playerPoolSortOptions([column("foontasy")], [player("unavailable", { foontasyPoints: value })], 3, "en").at(-1)?.available, false);
});

for (const direction of ["asc", "desc"] as const) {
  test(`shared numeric arithmetic keeps zero, null last and stable ties: ${direction}`, () => {
    const result = sortPlayerPoolRows(rows, { key: "foontasy", direction }, 3).map(({ playerId }) => playerId);
    assert.deepEqual(result, direction === "asc" ? ["negative", "zero", "tie-first", "tie-second", "missing"] : ["tie-first", "tie-second", "zero", "negative", "missing"]);
    assert.equal(rows[0].playerId, "missing");
  });

  test(`position sort preserves the established fantasy order and unknown-last: ${direction}`, () => {
    const players = [player("unknown", { positionGroup: "UNK" }), player("gk", { positionGroup: "GK" }), player("mid", { positionGroup: "MID" }), player("fwd", { positionGroup: "FWD" }), player("def", { positionGroup: "DEF" })];
    assert.deepEqual(sortPlayerPoolRows(players, { key: "position", direction }, 3).map(({ playerId }) => playerId), direction === "asc" ? ["fwd", "mid", "def", "gk", "unknown"] : ["gk", "def", "mid", "fwd", "unknown"]);
  });
}

test("selected historical metrics sort the whole filtered array without mutating it", () => {
  const source = Array.from({ length: 42 }, (_, index) => player(`p${index}`, { historicalStats: { shots: index === 0 ? null : index } }));
  const filtered = source.filter((_, index) => index % 2 === 0);
  const sorted = sortPlayerPoolRows(filtered, { key: "stat:shots", direction: "desc" }, 3);
  assert.equal(sorted[0].playerId, "p40");
  assert.equal(sorted.at(-1)?.playerId, "p0");
  assert.equal(sorted.length, 21);
  assert.equal(filtered[0].playerId, "p0");
  assert.equal(sortPlayerPoolRows(filtered, null, 3), filtered);
});

test("shared text sorting remains natural and stable", () => {
  const source = [player("first", { name: "Player 10" }), player("second", { name: "Player 2" }), player("third", { name: "Player 2" })];
  assert.deepEqual(sortPlayerPoolRows(source, { key: "player", direction: "asc" }, 3).map(({ playerId }) => playerId), ["second", "third", "first"]);
});

test("effective sort follows current column definitions without depending on filtered values", () => {
  const sort = { key: "stat:shots", direction: "desc" } as const;
  assert.equal(supportedPlayerPoolSort(sort, [column("stat:shots")]), sort);
  assert.equal(supportedPlayerPoolSort(sort, []), null);
  assert.equal(supportedPlayerPoolSort({ key: "price", direction: "asc" }, [])?.key, "price");
  assert.equal(supportedPlayerPoolSort({ key: "fixtures", direction: "asc" }, [column("fixtures")]), null);
  assert.equal(playerPoolSortOptions([column("stat:shots")], [], 3, "en").at(-1)?.available, false);
  assert.equal(supportedPlayerPoolSort(sort, [column("stat:shots")]), sort);
});
