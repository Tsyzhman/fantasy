import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveScoringModel } from "@/lib/scoring";

import {
  classifyPlayingTime,
  runFantasyBacktest,
  summarizeFantasyBacktestSamples,
  type FantasyBacktestObservation,
  type FantasyBacktestPositionGroup,
  type FantasyBacktestSample
} from "./fantasy_backtest";

const model: ActiveScoringModel = {
  modelSource: "MACHETE",
  customFormula: null,
  customFormulaGk: null,
  customFormulaDef: null,
  customFormulaMid: null,
  customFormulaFwd: null,
  customFormulaEnabled: false,
  scoringFormulaGk: null,
  scoringFormulaDef: null,
  scoringFormulaMid: null,
  scoringFormulaFwd: null,
  scoringFormulaEnabled: false,
  alternativeFormulaGk: null,
  alternativeFormulaDef: null,
  alternativeFormulaMid: null,
  alternativeFormulaFwd: null,
  alternativeFormulaEnabled: false,
  rules: []
};

test("rolling backtest predicts a match from earlier matches only", () => {
  const observations = [observation(1, { goals: 0, xg: 0.2 }), observation(2, { goals: 1, xg: 0.7 }), observation(3, { goals: 2, xg: 1.4 })];

  const result = runFantasyBacktest(observations, model, { minimumHistory: 2, historyMatches: 2 });

  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].matchId, "3");
  assert.deepEqual(result.samples[0].historyMatchIds, ["1", "2"]);
  assert.equal(result.summary.skipped.insufficientHistory, 2);
});

test("changing the target outcome cannot change its prediction or baseline", () => {
  const history = [observation(1, { goals: 0, xg: 0.1 }), observation(2, { goals: 1, xg: 0.9 })];
  const ordinaryTarget = observation(3, { goals: 0, xg: 0 });
  const exceptionalTarget = observation(3, { goals: 5, xg: 4.5, redCards: 1 });

  const ordinary = runFantasyBacktest([...history, ordinaryTarget], model, { minimumHistory: 2, historyMatches: 2 }).samples[0];
  const exceptional = runFantasyBacktest([...history, exceptionalTarget], model, { minimumHistory: 2, historyMatches: 2 }).samples[0];

  assert.equal(ordinary.predictedPoints, exceptional.predictedPoints);
  assert.equal(ordinary.baselinePoints, exceptional.baselinePoints);
  assert.notEqual(ordinary.actualPoints, exceptional.actualPoints);
});

test("zero-minute matchday rows reduce the round forecast instead of disappearing", () => {
  const played = observation(1, { minutes: 90, started: true, goals: 1, xg: 0.8 });
  const bench = observation(2, { minutes: null, started: false, substitutedIn: false, rating: null, goals: null, xg: null });
  const target = observation(3, { minutes: 90, started: true, goals: 0, xg: 0.1 });

  const withBench = runFantasyBacktest([played, bench, target], model, { minimumHistory: 2, historyMatches: 2 }).samples[0];
  const alwaysPlayed = runFantasyBacktest([played, observation(2, { minutes: 90, started: true, goals: 0, xg: 0 }), target], model, {
    minimumHistory: 2,
    historyMatches: 2
  }).samples[0];

  assert.equal(withBench.historyFeatures.expectedMinutes, 45);
  assert.ok(withBench.predictedPoints < alwaysPlayed.predictedPoints);
  assert.ok(withBench.baselinePoints < alwaysPlayed.baselinePoints);
});

test("playing-time groups use historical starts and minutes", () => {
  const stable = [observation(1, { started: true, minutes: 90 }), observation(2, { started: true, minutes: 80 }), observation(3, { started: true, minutes: 75 })];
  const uncertain = [observation(1, { started: true, minutes: 90 }), observation(2, { started: false, minutes: 15 }), observation(3, { started: true, minutes: 70 })];

  assert.equal(classifyPlayingTime(stable), "STABLE_STARTER");
  assert.equal(classifyPlayingTime(uncertain), "UNCERTAIN_MINUTES");
});

test("quality gate requires the configured improvement in three position groups", () => {
  const positions: FantasyBacktestPositionGroup[] = ["GK", "DEF", "MID", "FWD"];
  const samples = positions.map((position, index) => sample(position, index < 3 ? 1 : 3, 2));

  const summary = summarizeFantasyBacktestSamples(samples, undefined, {
    minimumImprovementPercent: 10,
    requiredPassingPositions: 3
  });

  assert.deepEqual(summary.qualityGate.passingPositions, ["MID", "DEF", "GK"]);
  assert.equal(summary.qualityGate.passed, true);
  assert.equal(summary.byPosition.GK.maeImprovementPercent, 50);
  assert.equal(summary.byPosition.FWD.passesImprovementThreshold, false);
});

function sample(position: FantasyBacktestPositionGroup, predictedPoints: number, baselinePoints: number): FantasyBacktestSample {
  return {
    matchId: `match-${position}`,
    playerId: `player-${position}`,
    teamId: `team-${position}`,
    opponentTeamId: `opponent-${position}`,
    isHome: true,
    homeTeamId: `team-${position}`,
    awayTeamId: `opponent-${position}`,
    homeScore: 1,
    awayScore: 0,
    homeXg: 1.2,
    awayXg: 0.7,
    matchDate: "2025-01-01T12:00:00.000Z",
    position,
    playingTimeGroup: "STABLE_STARTER",
    historyMatchIds: ["history-1"],
    historyFeatures: {
      expectedMinutes: 90,
      startRate: 1,
      minutesDeviation: 0,
      averageRating: 7,
      recentPointsDeviation: 0,
      recentPointsTrend: 0
    },
    predictedPoints,
    baselinePoints,
    seasonBaselinePoints: baselinePoints,
    actualPoints: 0
  };
}

function observation(matchId: number, overrides: Partial<FantasyBacktestObservation> = {}): FantasyBacktestObservation {
  return {
    matchId: BigInt(matchId),
    playerId: 100n,
    teamId: 10n,
    opponentTeamId: 20n,
    isHome: true,
    started: true,
    substitutedIn: false,
    minutes: 90,
    position: "Forward",
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: true,
    xg: 0,
    xgot: 0,
    xa: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    recoveries: 0,
    rating: 7,
    matchDate: new Date(`2025-01-${String(matchId).padStart(2, "0")}T12:00:00.000Z`),
    match: {
      homeTeamId: 10n,
      awayTeamId: 20n,
      homeScore: 1,
      awayScore: 0,
      homeXg: 1.2,
      awayXg: 0.7
    },
    ...overrides
  };
}
