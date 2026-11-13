/** @spec spec://modules/machete/FEAT-015-league-strength#model */

import assert from "node:assert/strict";
import test from "node:test";

import { calculateLeagueStrength, type LeagueStrengthMatch } from "./league-strength";

const teams = ["A", "B", "C", "D"].map((id) => ({ id, name: id }));

function fixture(id: string, homeId: string, awayId: string, homeGoals: number, awayGoals: number, homeXg: number | null = homeGoals, awayXg: number | null = awayGoals): LeagueStrengthMatch {
  return { id, homeId, awayId, homeGoals, awayGoals, homeXg, awayXg };
}

test("the same raw xG margin against a stronger opponent produces a stronger rating and harder schedule", () => {
  const matches = [
    fixture("1", "A", "C", 1, 0),
    fixture("2", "B", "D", 1, 0),
    fixture("3", "C", "D", 3, 0),
    fixture("4", "D", "C", 0, 3)
  ];
  const result = calculateLeagueStrength(teams, matches);
  const a = result.rows.find(({ id }) => id === "A")!;
  const b = result.rows.find(({ id }) => id === "B")!;
  assert.equal(a.xgDifference, b.xgDifference);
  assert.equal(a.xgRank, b.xgRank);
  assert.ok(a.rating! > b.rating!);
  assert.ok(a.schedule! > b.schedule!);
  assert.deepEqual(result.rows, calculateLeagueStrength(teams, [...matches].reverse()).rows);
});

test("venue strength is separate from team strength even with one opening fixture", () => {
  const { rows, homeAdvantage } = calculateLeagueStrength(teams, [fixture("1", "A", "B", 1, 0, null, null)]);
  assert.equal(homeAdvantage, 1);
  assert.deepEqual(rows.map(({ id, rating, ratingRank, schedule }) => [id, rating, ratingRank, schedule]), [
    ["A", 0, 1, -1],
    ["B", 0, 1, 1],
    ["C", null, null, null],
    ["D", null, null, null]
  ]);
});

test("paired xG can cancel a goal margin and zero is counted; missing xG uses goals only", () => {
  const matches = [fixture("1", "A", "B", 1, 0, 0, 1), fixture("2", "B", "A", 0, 1, 1, 0)];
  const complete = calculateLeagueStrength(teams, matches);
  assert.equal(complete.pairedXgMatches, 2);
  assert.equal(complete.rows[0].rating, 0);
  assert.equal(complete.rows.find(({ id }) => id === "B")?.xgDifference, 1);

  const partial = calculateLeagueStrength(teams, [matches[0], { ...matches[1], awayXg: null }]);
  assert.equal(partial.pairedXgMatches, 1);
  assert.equal(partial.rows[0].id, "A");
  assert.equal(partial.rows[0].played, 2);
  assert.equal(partial.rows[0].pairedXg, 1);
  assert.equal(partial.rows[0].xgDifference, -1);
  assert.ok(partial.rows[0].rating! > 0);
});

test("unscored fixtures, foreign teams and duplicate IDs do not enter the fit", () => {
  const played = fixture("1", "A", "B", 2, 0);
  const result = calculateLeagueStrength(teams, [played, played, { ...played, id: "2", homeGoals: null }, fixture("3", "A", "X", 5, 0)]);
  assert.deepEqual(result, calculateLeagueStrength(teams, [played]));
  const empty = calculateLeagueStrength(teams, []);
  assert.equal(empty.matches, 0);
  assert.equal(empty.homeAdvantage, null);
  assert.ok(empty.rows.every((row) => row.rating === null && row.xgDifference === null && row.schedule === null));
});
