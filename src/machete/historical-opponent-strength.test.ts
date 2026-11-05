import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoricalOpponentFactors, historicalOpponentAttackAdjustment } from "./historical-opponent-strength";

const date = (day: number) => new Date(Date.UTC(2026, 8, day));

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast */
test("opponent factors use the historical venue, league and strictly earlier kickoff groups", () => {
  const earlier = Array.from({ length: 20 }, (_, index) => ({
    id: BigInt(index + 1),
    leagueId: 47n,
    matchDate: date(index + 1),
    homeTeamId: 4n,
    awayTeamId: index % 2 ? 2n : 3n,
    homeAttack: index % 2 ? 0.3 : 3,
    awayAttack: 1.4
  }));
  const fixture = { ...earlier[0], id: 21n, matchDate: date(21), homeTeamId: 1n, awayTeamId: 2n, homeAttack: 5 };
  const sameKickoff = { ...fixture, id: 22n, awayTeamId: 3n, homeAttack: 0 };
  const later = { ...fixture, id: 23n, matchDate: date(22) };
  const overlapping = { ...fixture, id: 26n, matchDate: new Date(date(21).getTime() + 90 * 60_000) };
  const foreign = { ...fixture, id: 24n, leagueId: 55n };
  const otherVenue = { ...fixture, id: 25n, homeTeamId: 2n, awayTeamId: 1n };
  const factors = buildHistoricalOpponentFactors([...earlier, fixture, sameKickoff, overlapping, later, foreign, otherVenue]);
  const strong = factors.get("21:1")!;
  const weak = factors.get("22:1")!;
  assert.ok(strong > 1 && strong <= 1.125);
  assert.ok(weak >= 0.9 && weak < 1);
  assert.equal(factors.get("24:1"), undefined);
  assert.equal(factors.get("25:1"), undefined);

  const changedTargets = buildHistoricalOpponentFactors([
    ...earlier, earlier[0],
    { ...fixture, homeAttack: 0 }, { ...sameKickoff, homeAttack: 8 }, overlapping
  ]);
  assert.equal(changedTargets.get("21:1"), strong);
  assert.equal(changedTargets.get("22:1"), weak);
  assert.equal(changedTargets.get("26:1"), factors.get("26:1"));
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast */
test("player adjustment preserves explicit zero, uses actual fallback and requires rated minutes", () => {
  const history = [
    { matchId: 1n, teamId: 5n, minutes: 90, xg: 0.4, xa: null, assists: 1 },
    { matchId: 2n, teamId: 5n, minutes: 90, xg: 0, goals: 3, xa: 0.2 },
    { matchId: 3n, teamId: 5n, minutes: 90, xg: 0.2, xa: 0 },
    { matchId: 4n, teamId: 5n, minutes: 90, xg: 0.3, xa: 0.1 }
  ];
  const factors = new Map([["1:5", 1.125], ["2:5", 0.9], ["3:5", 1], ["4:6", 0.9]]);
  const result = historicalOpponentAttackAdjustment(history, factors);
  assert.equal(result?.ratedMatches, 3);
  assert.ok(Math.abs(result!.goalFactor - (0.4 * 1.125 + 0.2 + 0.3) / 0.9) < 1e-12);
  assert.ok(Math.abs(result!.assistFactor - (1.125 + 0.2 * 0.9 + 0.1) / 1.3) < 1e-12);
  assert.equal(historicalOpponentAttackAdjustment(history.slice(1), factors), undefined);
  assert.equal(historicalOpponentAttackAdjustment(history.map((row) => ({ ...row, minutes: 30 })), factors), undefined);
});
