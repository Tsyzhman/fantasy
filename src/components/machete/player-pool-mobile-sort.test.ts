/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import assert from "node:assert/strict";
import test from "node:test";
import type { FantasyPlannerPlayer } from "@/machete/squad_logic";
import { playerPoolSortOptions, sortPlayerPoolRows, supportedPlayerPoolSort, type PlayerPoolOptionalColumn } from "./PlayerPool";

function player(id: string, fields: Partial<FantasyPlannerPlayer> = {}): FantasyPlannerPlayer {
  return { id, playerId: id, name: id, teamId: "club", teamName: "Club", leagueName: "Fixture", position: "MID", positionGroup: "MID", price: 5, priceSource: "ESTIMATED", predictedFp: 0, valueScore: 0, roundPoints: [0], fixtures: [], fixtureDifficulties: [], ...fields };
}
const column = (key: string): PlayerPoolOptionalColumn => ({ key, label: key, title: key, numeric: true, width: 72 });
const rows = [player("missing", { foontasyPoints: null }), player("zero", { foontasyPoints: 0 }), player("tie-first", { foontasyPoints: 4 }), player("tie-second", { foontasyPoints: 4 }), player("negative", { foontasyPoints: -2 })];

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
