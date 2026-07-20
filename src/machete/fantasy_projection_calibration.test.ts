import assert from "node:assert/strict";
import test from "node:test";

import {
  FANTASY_PROJECTION_CALIBRATION,
  buildFantasyBacktestHorizonSamples,
  calibrateFantasyBacktestSamples,
  fantasyBacktestHoldoutStart,
  fitFantasyProjectionCalibration,
  predictCalibratedFantasyPoints
} from "./fantasy_projection_calibration";
import type { FantasyBacktestSample } from "./fantasy_backtest";

test("calibration does not learn from another target on the same date", () => {
  const history = Array.from({ length: 30 }, (_, index) => sample(index + 1, `2025-01-${String(index + 1).padStart(2, "0")}`, index % 4));
  const targetA = sample(31, "2025-02-01", 2);
  const targetB = { ...sample(32, "2025-02-01", 3), playerId: "player-2" };

  const ordinary = calibrateFantasyBacktestSamples([...history, targetA, targetB]);
  const changed = calibrateFantasyBacktestSamples([...history, { ...targetA, actualPoints: 25 }, targetB]);

  assert.equal(ordinary.at(-1)?.predictedPoints, changed.at(-1)?.predictedPoints);
});

test("five-observation horizon uses only complete chronological player windows", () => {
  const rows = Array.from({ length: 6 }, (_, index) => sample(index + 1, `2025-01-${String(index + 1).padStart(2, "0")}`, index + 1));
  const horizons = buildFantasyBacktestHorizonSamples(rows, 5);

  assert.equal(horizons.length, 2);
  assert.equal(horizons[0].predictedPoints, rows.slice(0, 5).reduce((total, row) => total + row.predictedPoints, 0));
  assert.equal(horizons[0].baselinePoints, rows.slice(0, 5).reduce((total, row) => total + row.baselinePoints, 0));
  assert.equal(horizons[0].actualPoints, 15);
});

test("fixed production fit is deterministic and exposes the preselected holdout", () => {
  const rows = Array.from({ length: 40 }, (_, index) => sample(index + 1, `2025-${index < 20 ? "01" : "02"}-${String((index % 20) + 1).padStart(2, "0")}`, index % 5));
  const model = fitFantasyProjectionCalibration(rows);
  const upcoming = { ...sample(100, "2025-03-01", 0), actualPoints: 0 };

  assert.equal(predictCalibratedFantasyPoints(model, upcoming), predictCalibratedFantasyPoints(model, upcoming));
  assert.equal(model.configuration.lambda, 25);
  assert.equal(model.configuration.minimumTrainingSamples, 30);
  assert.equal(model.configuration.betaHorizon, 5);
  assert.equal(fantasyBacktestHoldoutStart(rows), "2025-02-11T12:00:00.000Z");
  assert.equal(FANTASY_PROJECTION_CALIBRATION.featureVersion, "ridge19-v1");
});

function sample(matchId: number, date: string, actualPoints: number): FantasyBacktestSample {
  return {
    matchId: String(matchId),
    playerId: "player-1",
    teamId: "team-1",
    opponentTeamId: "team-2",
    isHome: true,
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    homeScore: 1,
    awayScore: 0,
    homeXg: 1.2,
    awayXg: 0.7,
    matchDate: `${date}T12:00:00.000Z`,
    position: "FWD",
    playingTimeGroup: "STABLE_STARTER",
    historyMatchIds: ["h1", "h2", "h3", "h4", "h5"],
    historyFeatures: {
      expectedMinutes: 80,
      startRate: 0.9,
      minutesDeviation: 10,
      averageRating: 7,
      recentPointsDeviation: 1.2,
      recentPointsTrend: 0.5
    },
    predictedPoints: 4,
    baselinePoints: 3,
    seasonBaselinePoints: 3,
    actualPoints
  };
}
