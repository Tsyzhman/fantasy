import assert from "node:assert/strict";
import test from "node:test";

import type { FantasyPlannerPlayer } from "./squad_logic";
import { fantasyPlayerProjectionDetails, toFantasyPlayerPoolListItem } from "./squad-player-dto";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
test("squad list DTO preserves provider identity, strips breakdowns and keeps projection metrics", () => {
  const player = {
    playerId: "7",
    providerPlayerId: "315",
    projectedFixtureComponents: {
      sixtyMinutesProbability: 0.7,
      fullMatchProbability: 0.5,
      expectedGoals: 0.3,
      expectedAssists: 0.2,
      expectedRecoveries: 4,
      expectedSaves: 0,
      expectedYellowCards: 0.1,
      expectedRedCards: 0.01,
      expectedGoalsConceded: 1.1,
      expectedCleanSheets: 0.35
    },
    projectionComponents: { total: 5.2 },
    projectionFormula: { formula: "xg * 5", total: 5.2, terms: [{ expression: "xg * 5", resolvedExpression: "0.3 * 5", sign: 1, value: 1.5 }] },
    alternativeProjectedFixtureComponents: { expectedGoals: 0.3 },
    alternativeProjectionComponents: { total: 4.8 },
    alternativeProjectionFormula: { formula: "xg * 4", total: 4.8, terms: [] }
  } as unknown as FantasyPlannerPlayer;

  const listItem = toFantasyPlayerPoolListItem(player);
  assert.equal(listItem.providerPlayerId, "315");
  assert.equal("projectionFormula" in listItem, false);
  assert.equal("projectedFixtureComponents" in listItem, false);
  assert.deepEqual(listItem.projectionListMetrics, {
    sixtyMinutesProbability: 0.7,
    fullMatchProbability: 0.5,
    expectedGoals: 0.3,
    expectedAssists: 0.2,
    expectedRecoveries: 4,
    expectedSaves: 0,
    expectedYellowCards: 0.1,
    expectedRedCards: 0.01,
    expectedGoalsConceded: 1.1,
    expectedCleanSheets: 0.35
  });

  const details = fantasyPlayerProjectionDetails(player);
  assert.equal(details.playerId, "7");
  assert.equal(details.projectionFormula?.total, 5.2);
  assert.equal(details.alternativeProjectionFormula?.total, 4.8);
});
