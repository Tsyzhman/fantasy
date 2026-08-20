import assert from "node:assert/strict";
import test from "node:test";

import { expectedPoissonGroups, type PlayerFixtureProjection } from "@/machete/deterministic_fantasy_projection";

import { aggregateFplForecastResults, fplForecastPointsFromProjection, fplOfficialScoreInputFromStats } from "./fpl-scoring";

const projection: PlayerFixtureProjection = {
  playerId: "1",
  position: "DEF",
  expectedMinutes: 90,
  probabilities: { appearance: 1, sixtyMinutes: 0.8, fullMatch: 0.7 },
  allocationWeights: { goals: 1, assists: 1, recoveries: 1, saves: 0 },
  expectedEvents: {
    goals: 0.4,
    assists: 0.2,
    recoveries: 8,
    saves: 0,
    yellowCards: 0.1,
    redCards: 0,
    goalsConceded: 1.2,
    cleanSheets: 0.5
  },
  components: {
    appearance: 1,
    sixtyMinutes: 0.8,
    fullMatch: 0,
    goals: 2.4,
    assists: 0.6,
    cleanSheet: 2,
    saves: 0,
    recoveries: 2,
    goalsConceded: -0.6,
    yellowCards: -0.1,
    redCards: 0,
    total: 8.1
  }
};

test("FPL forecast adapter uses FPL weights, excludes recoveries and marks missing official history", () => {
  const result = fplForecastPointsFromProjection(projection);
  assert.ok(Math.abs(result.breakdown.goals - 2.4) < 1e-9);
  assert.equal(result.breakdown.cleanSheets, 2);
  assert.equal(Object.hasOwn(result.breakdown, "recoveries"), false);
  assert.equal(result.breakdown.bonus, 0);
  assert.equal(result.breakdown.defensiveContributions, 0);
  assert.equal(result.coverage.bonus, 0);
  assert.equal(result.status, "OFFICIAL_SCORING_WITH_PARTIAL_BONUS_AND_DEFENSIVE_CONTRIBUTIONS");
  assert.ok(result.points > 5);
  assert.ok(Math.abs(result.points - Object.entries(result.breakdown).filter(([key]) => key !== "total").reduce((sum, [, value]) => sum + value, 0)) < 1e-9);
});

test("FPL forecast recoveries never create points directly", () => {
  const noRecoveries = fplForecastPointsFromProjection({
    ...projection,
    expectedEvents: { ...projection.expectedEvents, recoveries: 0 }
  });
  const manyRecoveries = fplForecastPointsFromProjection({
    ...projection,
    expectedEvents: { ...projection.expectedEvents, recoveries: 100 }
  });
  assert.equal(manyRecoveries.points, noRecoveries.points);
  assert.equal(Object.hasOwn(manyRecoveries.breakdown, "recoveries"), false);
});

test("official-history bonus and defensive-contribution estimates are appearance weighted and capped", () => {
  const result = fplForecastPointsFromProjection({
    ...projection,
    probabilities: { appearance: 0.5, sixtyMinutes: 0.4, fullMatch: 0.3 }
  }, {
    expectedBonusPerAppearance: 10,
    expectedDefensiveContributionPointsPerAppearance: 10,
    bonusCoverage: 2,
    defensiveContributionCoverage: 2
  });
  assert.equal(result.breakdown.bonus, 1.5);
  assert.equal(result.breakdown.defensiveContributions, 1);
  assert.deepEqual(result.coverage, { bonus: 1, defensiveContributions: 1 });
  assert.equal(result.status, "OFFICIAL_SCORING_WITH_ROLLING_BONUS_AND_DEFENSIVE_CONTRIBUTIONS");
});

test("FPL position scoring matches the 2026/27 direct-points table", () => {
  const expectedGoalPoints = { GK: 10, DEF: 6, MID: 5, FWD: 4 } as const;
  const expectedCleanSheetPoints = { GK: 4, DEF: 4, MID: 1, FWD: 0 } as const;
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    const result = fplForecastPointsFromProjection({
      ...projection,
      position,
      expectedEvents: {
        ...projection.expectedEvents,
        goals: 1,
        assists: 1,
        cleanSheets: 1,
        saves: 3,
        goalsConceded: 2,
        yellowCards: 1,
        redCards: 1,
        recoveries: 100
      }
    });
    assert.equal(result.breakdown.goals, expectedGoalPoints[position]);
    assert.equal(result.breakdown.assists, 3);
    assert.equal(result.breakdown.cleanSheets, expectedCleanSheetPoints[position]);
    assert.equal(result.breakdown.saves, position === "GK" ? expectedPoissonGroups(3, 3) : 0);
    assert.equal(result.breakdown.goalsConceded, position === "GK" || position === "DEF" ? -expectedPoissonGroups(2, 2) : 0);
    assert.equal(result.breakdown.yellowCards, -1);
    assert.equal(result.breakdown.redCards, -3);
  }
});

test("goalkeeper never receives defensive-contribution forecast points", () => {
  const result = fplForecastPointsFromProjection({ ...projection, position: "GK" }, {
    expectedBonusPerAppearance: 2,
    expectedDefensiveContributionPointsPerAppearance: 2,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
  assert.equal(result.breakdown.bonus, 2);
  assert.equal(result.breakdown.defensiveContributions, 0);
  assert.equal(result.coverage.defensiveContributions, 1);
});

test("FPL double gameweek forecast sums independently scored fixtures", () => {
  const first = fplForecastPointsFromProjection(projection, {
    expectedBonusPerAppearance: 1,
    expectedDefensiveContributionPointsPerAppearance: 0.5,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
  const second = fplForecastPointsFromProjection({
    ...projection,
    probabilities: { appearance: 0.5, sixtyMinutes: 0.4, fullMatch: 0.3 },
    expectedEvents: {
      ...projection.expectedEvents,
      goals: 0.1,
      assists: 0.4,
      cleanSheets: 0.2
    }
  }, {
    expectedBonusPerAppearance: 1,
    expectedDefensiveContributionPointsPerAppearance: 0.5,
    bonusCoverage: 0.6,
    defensiveContributionCoverage: 0.8
  });
  const round = aggregateFplForecastResults([first, second]);

  assert.ok(round);
  assert.equal(round.breakdown.fixtureCount, 2);
  assert.ok(Math.abs(round.points - first.points - second.points) < 1e-9);
  assert.ok(Math.abs(round.breakdown.goals - first.breakdown.goals - second.breakdown.goals) < 1e-9);
  assert.deepEqual(round.coverage, { bonus: 0.6, defensiveContributions: 0.8 });
  assert.equal(round.status, "OFFICIAL_SCORING_WITH_PARTIAL_BONUS_AND_DEFENSIVE_CONTRIBUTIONS");
});

test("FPL official live stats map to the versioned rules input", () => {
  assert.deepEqual(fplOfficialScoreInputFromStats("MID", {
    minutes: 90,
    goals_scored: 1,
    assists: 1,
    clean_sheets: 1,
    penalties_saved: 1,
    penalties_missed: 1,
    own_goals: 1,
    yellow_cards: 1,
    red_cards: 1,
    goals_conceded: 2,
    bonus: 3,
    defensive_contribution: 12
  }), {
    position: "MID",
    minutes: 90,
    goals: 1,
    assists: 1,
    cleanSheet: true,
    saves: 0,
    penaltySaves: 1,
    penaltyMisses: 1,
    ownGoals: 1,
    yellowCards: 1,
    redCards: 1,
    goalsConceded: 2,
    bonus: 3,
    defensiveContributions: 12
  });
});
