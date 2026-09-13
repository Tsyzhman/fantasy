/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blendHistory, projectHistory, summarizeHockeyHistory, type HistoryFact } from "./history-projection";
import { formatKhlNumber, formatToi } from "./contracts";
const game: HistoryFact = { participationStatus: "PLAYED", points: 15, goals: 1, assists: 0, plusMinus: 1, pimMinutes: 2, shotsOnGoal: 5 };
const previous = summarizeHockeyHistory(Array.from({ length: 68 }, () => game), "2025/2026", "Sports");
const current = summarizeHockeyHistory([{ ...game, goals: 0, points: 5 }], "2026/2027", "Sports");
const input = { position: "F" as const, current, previous, pairedGoals: 0, pairedShots: 5, leagueGoals: 10, leagueShots: 100 };
test("historical prior stabilizes a short season without adding 68 old games as current facts", () => {
  assert.equal(blendHistory({ sum: 0, count: 1 }, { sum: 68, count: 68 }), 20 / 21);
  const projected = projectHistory(input)!;
  assert.equal(projected.currentGames, 1); assert.equal(projected.previousGames, 68); assert.equal(projected.priorWeight, 20);
  assert.ok(projected.perGame > projectHistory({ ...input, previous: undefined })!.perGame);
  const priorOnly = projectHistory({ ...input, current: summarizeHockeyHistory([], "current", "Sports"), pairedGoals: 0, pairedShots: 0 })!;
  assert.ok(priorOnly.perGame > 0); assert.ok(priorOnly.warnings.includes("PREVIOUS_SEASON_ONLY"));
  assert.equal(projectHistory({ ...input, previous: undefined, current: summarizeHockeyHistory([], "current", "Sports") }), null);
});
test("goals, assists, shots, penalties and plus-minus affect one additive points formula", () => {
  const base = projectHistory(input)!;
  for (const [field, sign] of [["goals", 1], ["assists", 1], ["shotsOnGoal", 1], ["plusMinus", 1], ["pimMinutes", -1]] as const) {
    const changed = structuredClone(current); changed.totals[field].value! += 2;
    assert.ok((projectHistory({ ...input, current: changed })!.perGame - base.perGame) * sign > 0, field);
  }
  const c = base.components;
  assert.equal(base.perGame, c.goals + c.assists + c.plusMinus + c.penalty + c.other);
  assert.equal(base.appearanceRate, 1);
  const absent = summarizeHockeyHistory([{ ...game, participationStatus: "DNP" }], "current", "Sports");
  assert.equal(projectHistory({ ...input, current: absent })!.appearanceRate, 20 / 21);
});
test("missing observations retain null; goalies use official scores and formatting never leaks long decimals", () => {
  const emptyShots = structuredClone(current); emptyShots.totals.shotsOnGoal = { value: null, knownGames: 0 };
  const noShots = projectHistory({ ...input, previous: undefined, current: emptyShots })!;
  assert.ok(noShots.warnings.includes("SHOTS_UNAVAILABLE")); assert.equal(noShots.perGame, 5);
  assert.equal(projectHistory({ ...input, position: "G" })!.perGame, (5 + 20 * 15) / 21);
  assert.equal(formatKhlNumber(1.23456789), "1,23"); assert.equal(formatKhlNumber(1), "1");
  assert.equal(formatKhlNumber(null), "—"); assert.equal(formatKhlNumber(0), "0");
  assert.equal(formatToi(119.9), "2:00");
});
