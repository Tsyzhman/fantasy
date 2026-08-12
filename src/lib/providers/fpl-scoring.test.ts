import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerFixtureProjection } from "@/machete/deterministic_fantasy_projection";

import { fplForecastPointsFromProjection, fplOfficialScoreInputFromStats } from "./fpl-scoring";

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

test("FPL forecast adapter uses FPL weights and marks missing bonus/defcontribution coverage", () => {
  const result = fplForecastPointsFromProjection(projection);
  assert.ok(Math.abs(result.breakdown.goals - 2.4) < 1e-9);
  assert.equal(result.breakdown.cleanSheets, 2);
  assert.equal(Object.hasOwn(result.breakdown, "recoveries"), false);
  assert.equal(result.breakdown.bonus, 0);
  assert.equal(result.coverage.bonus, 0);
  assert.equal(result.status, "BETA_UNMODELED_BONUS_AND_DEFENSIVE_CONTRIBUTIONS");
  assert.ok(result.points > 5);
  assert.ok(Math.abs(result.points - Object.entries(result.breakdown).filter(([key]) => key !== "total").reduce((sum, [, value]) => sum + value, 0)) < 1e-9);
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
