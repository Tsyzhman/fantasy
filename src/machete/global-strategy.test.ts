/** @spec spec://modules/machete/FEAT-002-global-strategy-formula#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { globalStrategyConfig } from "./global-strategy-config";
import { evaluateGlobalStrategy, evaluateGlobalStrategyPlan, scoreGlobalStrategyPlayer, globalStrategyScoreHistory, validGlobalOwnership, type GlobalStrategyContext } from "./global-strategy";
const now = new Date("2026-09-07T10:00:00Z");
const config = globalStrategyConfig("FPL", "fpl");
const context: GlobalStrategyContext = { provider: "FPL", tournamentKey: "fpl", contestId: "contest", season: "2026/2027", providerSquadId: "1", revision: "r1", fieldSize: 500, rank: 250, managerPoints: 300, leaderPoints: 400, totalRounds: 38, remainingRounds: 3, roundScoreScale: 70, scoreSampleCount: 6, standingsRoundId: "35", observedAt: "2026-09-07T09:59:00Z", expiresAt: "2026-09-07T10:04:00Z" };
test("five published examples, exact arithmetic and displayed four-digit rounding", () => {
  for (const [rank, gap, remaining, displayed] of [[1, 0, 1, 0], [250, 100, 35, 0.0021], [250, 100, 19, 0.0829], [250, 100, 3, 0.2814], [490, 300, 1, 0.5959]]) {
    const result = evaluateGlobalStrategy({ ...context, rank, leaderPoints: 300 + gap, remainingRounds: remaining }, config, now);
    const exact = rank === 1 ? 0 : 0.8 * ((38 - remaining) / 37) ** 2 * (0.4 * (rank - 1) / 499 + 0.6 * gap / (gap + 210));
    assert.ok(Math.abs(result.k! - exact) < 1e-6);
    assert.equal(Number(result.k!.toFixed(4)), displayed);
  }
});
test("monotonic rank, gap and urgency in small and multimillion fields", () => {
  for (const n of [500, 10506303]) {
    const base = { ...context, fieldSize: n };
    for (const key of ["rank", "leaderPoints", "remainingRounds"] as const) {
      let previous = -1;
      const values = key === "rank" ? [2, 250, n] : key === "leaderPoints" ? [301, 400, 600] : [38, 19, 1];
      for (const value of values) {
        const result = evaluateGlobalStrategy({ ...base, [key]: value }, config, now);
        assert.ok(result.k! >= previous && result.k! <= config.kMax);
        previous = result.k!;
      }
    }
  }
});
test("invalid input and stale state never masquerade as neutral", () => {
  for (const patch of [{ rank: 1.5 }, { rank: 501 }, { fieldSize: Infinity }, { remainingRounds: -1 }, { totalRounds: NaN }, { rank: 1 }, { leaderPoints: 299 }, { provider: "SPORTS_RU" as const }, { tournamentKey: "england" }, { scoreSampleCount: 7 }]) {
    assert.equal(evaluateGlobalStrategy({ ...context, ...patch }, config, now).status, "UNAVAILABLE");
  }
  assert.equal(evaluateGlobalStrategy(context, config, Date.parse(context.expiresAt)).reasonCodes[0], "STALE_CONTEXT");
  for (const scale of [0, -1, NaN, Infinity]) assert.equal(evaluateGlobalStrategy({ ...context, roundScoreScale: scale }, config, now).reasonCodes[0], "INSUFFICIENT_SCORE_HISTORY");
});
test("neutral, single-round and completed competitions", () => {
  for (const patch of [{ rank: 1, leaderPoints: 300 }, { rank: 250, leaderPoints: 300 }, { rank: 1, fieldSize: 1, leaderPoints: 300 }, { totalRounds: 1, remainingRounds: 1, scoreSampleCount: 0, roundScoreScale: 0 }]) {
    assert.equal(evaluateGlobalStrategy({ ...context, ...patch }, config, now).status, "NEUTRAL");
  }
  assert.equal(evaluateGlobalStrategy({ ...context, remainingRounds: 0 }, config, now).status, "FINISHED");
});
test("ownership and negative EP do not invent forecasts; deterministic and immutable", () => {
  const frozen = Object.freeze({ ...context });
  const evaluation = evaluateGlobalStrategy(frozen, config, now);
  assert.deepEqual(evaluateGlobalStrategy(frozen, config, now), evaluation);
  for (const ownershipPercent of [0, 100, null, -1, 101, NaN]) {
    assert.equal(validGlobalOwnership(ownershipPercent), ownershipPercent === 0 || ownershipPercent === 100);
    for (const expectedPoints of [-5, 0, 8]) {
      const input = Object.freeze({ ownershipPercent, expectedPoints });
      const result = scoreGlobalStrategyPlayer(input, evaluation, config);
      assert.equal(result.expectedPoints, expectedPoints);
      if (expectedPoints <= 0 || !validGlobalOwnership(ownershipPercent)) assert.equal(result.strategyBonus, 0);
    }
  }
});
test("whole-plan loss budget uses full precision and requires a positive strategic gain", () => {
  const evaluation = { ...evaluateGlobalStrategy(context, config, now), k: 0.4 };
  const baseline = { expectedPoints: 70, strategyScore: 70 };
  assert.equal(evaluateGlobalStrategyPlan({ baseline, candidate: { expectedPoints: 68.95, strategyScore: 71 } }, evaluation, config).eligible, true);
  assert.equal(evaluateGlobalStrategyPlan({ baseline, candidate: { expectedPoints: 68.94999, strategyScore: 71 } }, evaluation, config).eligible, false);
  assert.equal(evaluateGlobalStrategyPlan({ baseline, candidate: baseline }, evaluation, config).eligible, false);
});
test("history retains zero/negative scores and no more than six observations", () => {
  const result = globalStrategyScoreHistory(Array.from({ length: 8 }, (_, i) => ({ id: String(i), score: i === 7 ? -2 : i === 6 ? 0 : 10 })))!;
  assert.equal(result.sampleCount, 6);
  assert.deepEqual(result.usedRoundIds, ["2", "3", "4", "5", "6", "7"]);
  assert.equal(result.roundScoreScale, 38 / 6);
  assert.equal(globalStrategyScoreHistory([{ id: "1", score: 1 }, { id: "1", score: 2 }]), null);
});
