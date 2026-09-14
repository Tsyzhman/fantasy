/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHistory, summarizeHockeyHistory } from './history-projection';
import { applyOpponent, expectedTotals, goalCalculation, rateCalculation } from './forecast-explanation';
import { opponentAdjustment } from './opponent-adjustment';
import { unknown, type KhlPlayer } from './contracts';
import type { HockeyMarket } from '@/providers/fonbet/hockey-markets';
const current = summarizeHockeyHistory(Array.from({ length: 3 }, () => ({ participationStatus: 'PLAYED', points: 62 / 3, goals: 1, assists: 4 / 3, plusMinus: 2 / 3, pimMinutes: 4 / 3, shotsOnGoal: 4 })), 'current', 'Sports');
const input = { position: 'F' as const, current, pairedGoals: 3, pairedShots: 12, leagueGoals: 19, leagueShots: 200 };
const asOf = new Date('2026-09-14T08:00:00Z'), startsAt = new Date('2026-09-14T12:00:00Z');
const markets: HockeyMarket[] = ['HOME','DRAW','AWAY'].map((selection, i) => ({ type: '1X2', scope: 'REGULATION_60', period: 0, selection, line: null, odds: [1.6,4,6][i], status: 'AVAILABLE' }));
test('raw expected goals and source inputs explain FP without reversing rounded contributions', () => {
  const e = projectHistory(input)!, d = e.details!;
  assert.equal(d.expected.goals, 0.75); assert.equal(d.expected.shotsOnGoal, 4);
  assert.equal(d.expected.assists, 4 / 3); assert.equal(d.expected.pimMinutes, 4 / 3);
  assert.ok(Math.abs(e.perGame - 109 / 6) < 1e-12);
  assert.equal(d.rates.goals.currentSum, 3); assert.equal(d.rates.goals.currentCount, 3);
  assert.equal(d.conversion!.value, 0.125); assert.equal(d.conversion!.leagueWeight, 50);
  assert.match(goalCalculation(e), /0,75/); assert.match(rateCalculation(d.rates.goals), /3 \/ 3/);
});
test('each opponent changes attacks, preserves penalties and accounts for participation exactly once', () => {
  const e = projectHistory(input)!; e.appearanceRate = 0.5;
  const fav = opponentAdjustment({ markets, home: true, startsAt, asOf, observedAt: asOf });
  const dog = opponentAdjustment({ markets, home: false, startsAt, asOf, observedAt: asOf });
  assert.ok(fav.factor > 1 && dog.factor < 1);
  const a = applyOpponent(e, fav), b = applyOpponent(e, dog);
  assert.ok(a.expected.goals! > b.expected.goals!); assert.equal(a.expected.pimMinutes, b.expected.pimMinutes);
  const p = { ep: { value: (a.perGame + b.perGame) * e.appearanceRate }, forecastExplanation: e, forecastHorizonEnd: '2026-09-21T08:00:00Z', fixtures: [a,b].map((forecast, i) => ({ id: String(i), startsAt: startsAt.toISOString(), status: 'SCHEDULED', forecast })) } as KhlPlayer;
  assert.equal(expectedTotals(p).goals, (a.expected.goals! + b.expected.goals!) * 0.5);
  p.ep = unknown('Неполный горизонт'); assert.equal(expectedTotals(p).goals, null);
  const goalie = projectHistory({ ...input, position: 'G' })!;
  assert.equal(applyOpponent(goalie, fav).perGame, goalie.perGame); assert.equal(applyOpponent(goalie, fav).expected.goals, null);
});
test('unavailable, mixed, stale, future, suspended and started markets never change expectations', () => {
  const base = { markets, home: true, startsAt, asOf, observedAt: asOf };
  for (const change of [{ markets: markets.slice(1) }, { markets: markets.map(m => ({ ...m, scope: 'INCLUDING_OT_SO' as const })) }, { observedAt: new Date(asOf.getTime()-6*60000) }, { observedAt: new Date(asOf.getTime()+1) }, { startsAt: asOf }, { markets: markets.map(m => ({ ...m, status: 'SUSPENDED' as const })) }]) {
    assert.equal(opponentAdjustment({ ...base, ...change }).factor, 1);
    assert.equal(opponentAdjustment({ ...base, ...change }).probability, null);
  }
});
