/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { optimizeGlobalSquad, buildGlobalTransferSuggestions, isGlobalRecommendationCurrent } from "./global-strategy-planner";
import { globalStrategyConfig } from "./global-strategy-config";
import { defaultFantasySquadRules, selectionForPlayer, summarizeFantasySquad, type FantasyPlannerPlayer } from "./squad_logic";
import type { GlobalStrategyRequestContext } from "./global-strategy";

const now = Date.parse("2026-09-07T10:00:00Z");
const request: GlobalStrategyRequestContext = { config: globalStrategyConfig("FPL", "fpl"), ownershipRevision: "o1", forecastRevision: "f1", ownershipExpiresAt: "2026-09-07T11:00:00Z",
  context: { provider: "FPL", contestId: "1", tournamentKey: "fpl", season: "2026/2027", providerSquadId: "1", revision: "c1", fieldSize: 500, rank: 490, managerPoints: 300, leaderPoints: 600, totalRounds: 38, remainingRounds: 1, roundScoreScale: 70, scoreSampleCount: 6, standingsRoundId: "37", observedAt: "2026-09-07T09:59:00Z", expiresAt: "2026-09-07T10:04:00Z" } };
function player(id: number, position: FantasyPlannerPlayer["positionGroup"], points: number[], ownershipPercent = 95): FantasyPlannerPlayer {
  return { id: String(id), playerId: String(id), providerPlayerId: String(id), teamId: String(id), name: `Player ${id}`, teamName: String(id), leagueName: "Test", position, positionGroup: position,
    price: 5, priceSource: "FPL", predictedFp: points[0], valueScore: 1, roundPoints: points, ownershipPercent, fixtures: [], fixtureDifficulties: [] };
}
function squad() {
  return [player(1, "GK", [5, 5]), player(2, "GK", [1, 1]), ...Array.from({ length: 5 }, (_, i) => player(i + 3, "DEF", [i < 4 ? 7 : 1, 7])),
    ...Array.from({ length: 5 }, (_, i) => player(i + 8, "MID", [i < 4 ? 8 : 1, 8])), player(13, "FWD", [9, 9]), player(14, "FWD", [9, 9]), player(15, "FWD", [1, 1])];
}
const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 3 };

test("a completed Worker result rejects expiry or revised ownership/forecast when applied", () => {
  const result = optimizeGlobalSquad({ pool: squad(), rules, horizon: 1, globalStrategy: request }, now);
  assert.ok(result.analysis);
  assert.equal(isGlobalRecommendationCurrent(result.analysis, request, now), true);
  assert.equal(isGlobalRecommendationCurrent(result.analysis, request, Date.parse(request.context.expiresAt)), false);
  assert.equal(isGlobalRecommendationCurrent(result.analysis, { ...request, ownershipExpiresAt: new Date(now).toISOString() }, now), false);
  assert.equal(isGlobalRecommendationCurrent(result.analysis, { ...request, ownershipRevision: "o2" }, now), false);
  assert.equal(isGlobalRecommendationCurrent(result.analysis, { ...request, forecastRevision: "f2" }, now), false);
});
test("weak rare players cannot exceed the whole-XI loss budget; inputs are unchanged", () => {
  const pool = [...squad(), player(20, "MID", [6, 6], 0)];
  const original = JSON.stringify(pool);
  const result = optimizeGlobalSquad({ pool, rules, horizon: 1, globalStrategy: request }, now);
  assert.ok(result.selections && result.analysis);
  assert.equal(summarizeFantasySquad(pool, result.selections, rules, 1).violations.length, 0);
  assert.ok(result.analysis.expectedPointsLoss <= result.analysis.maxExpectedPointsLoss + 1e-7);
  assert.equal(result.selections.some((selection) => selection.playerId === "20" && selection.isStarter), false);
  assert.equal(JSON.stringify(pool), original);
});
test("captain uses this round, while horizon includes each round's XI and captain; bench scores zero", () => {
  const pool = squad();
  pool[12] = player(13, "FWD", [20, 0]);
  pool[13] = player(14, "FWD", [10, 100]);
  const result = optimizeGlobalSquad({ pool, rules, horizon: 2, globalStrategy: request }, now);
  assert.ok(result.selections && result.analysis);
  assert.equal(result.selections.find((selection) => selection.isCaptain)?.playerId, "13");
  assert.ok(result.analysis.candidateExpectedPoints > 200);
});
test("missing ownership/provider mapping and expiry fall back with explicit unavailable status", () => {
  for (const patch of [{ ownershipPercent: null }, { priceSource: "SPORTS_RU" as const }, { providerPlayerId: null }]) {
    const pool = squad(); pool[0] = { ...pool[0], ...patch };
    assert.equal(optimizeGlobalSquad({ pool, rules, horizon: 1, globalStrategy: request }, now).analysis?.evaluation.status, "UNAVAILABLE");
  }
  assert.equal(optimizeGlobalSquad({ pool: squad(), rules, horizon: 1, globalStrategy: request }, Date.parse(request.context.expiresAt)).analysis?.evaluation.reasonCodes[0], "STALE_CONTEXT");
});
test("no-op, transfer penalties and symmetric rarity do not reward useless moves", () => {
  const pool: FantasyPlannerPlayer[] = squad().map((p) => ({ ...p, ownershipPercent: 0 }));
  const selections = pool.map((p, i) => selectionForPlayer(p, i, ![1, 6, 11, 14].includes(i)));
  pool.push(player(20, "MID", [8, 8], 0));
  const result = buildGlobalTransferSuggestions({ pool, selections, rules, horizon: 1, globalStrategy: request, transferCount: 2, freeTransfers: 0, paidTransferPointCost: 4 }, now);
  assert.equal(result.length, 0);
});
test("a small negative transfer EP delta is admitted only with a positive strategy delta and B", () => {
  const pool = squad();
  const selections = pool.map((p, i) => ({ ...selectionForPlayer(p, i, ![1, 6, 11, 14].includes(i)), isLocked: p.playerId !== "8" }));
  pool.push(player(20, "MID", [7.95, 7.95], 0));
  const results = buildGlobalTransferSuggestions({ pool, selections, rules, horizon: 1, globalStrategy: request, transferCount: 1, freeTransfers: 1, paidTransferPointCost: 4 }, now);
  const plan = results.find((p) => p.netHorizonDelta !== null && p.netHorizonDelta < 0);
  assert.ok(plan?.globalStrategy);
  assert.ok(plan.globalStrategy.strategyScoreDelta > 0);
  assert.ok(plan.globalStrategy.expectedPointsLoss <= plan.globalStrategy.maxExpectedPointsLoss + 1e-7);
  assert.equal(new Set(plan.selections!.map((p) => p.playerId)).size, 15);
});

test("keeping the squad retains the best observed EP baseline, and cannot exceed its loss budget", () => {
  for (const improvement of [0.05, 4]) {
    const pool = squad();
    pool[7].ownershipPercent = 0;
    const selections = pool.map((p, i) => ({ ...selectionForPlayer(p, i, ![1, 6, 11, 14].includes(i)), isLocked: p.playerId !== "8" }));
    pool.push(player(20, "MID", [8 + improvement, 8 + improvement], 95));
    const result = optimizeGlobalSquad({ pool, selections, rules, horizon: 1, globalStrategy: request, maximumTransfers: 1, freeTransfers: 1, paidTransferPointCost: 4 }, now);
    assert.ok(result.analysis && result.selections);
    assert.ok(result.analysis.expectedPointsLoss <= result.analysis.maxExpectedPointsLoss + 1e-7);
    if (improvement === 0.05) {
      assert.ok(result.selections.some((selection) => selection.playerId === "8"));
      assert.ok(Math.abs(result.analysis.expectedPointsLoss - 0.05) < 1e-7);
    } else {
      assert.ok(result.selections.some((selection) => selection.playerId === "20"));
    }
  }
});
