import assert from "node:assert/strict";
import test from "node:test";

import { createFantasySquadRoundPlans, defaultFantasySquadRules, type FantasyPlannerPlayer, type FantasySquadSelection } from "./squad_logic";
import { mergeImportedSquadWithFuturePlans } from "./sports_ru_squad_import";

test("Sports.ru import replaces current and linked rounds while retaining a valid independent future plan", () => {
  const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"] as const;
  const pool = positions.map((position, index) => fantasyPlayer(String(index + 1), position));
  pool.push(fantasyPlayer("16", "DEF"));
  const starterIndexes = new Set([0, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13]);
  const imported = positions.map((_, index) => selection(String(index + 1), index, starterIndexes.has(index)));
  const existing = createFantasySquadRoundPlans(imported);
  existing[2] = {
    roundOffset: 2,
    linkedToPrevious: false,
    selections: imported.map((item) => item.playerId === "3" ? { ...item, playerId: "16" } : { ...item })
  };
  existing[3].linkedToPrevious = true;

  const merged = mergeImportedSquadWithFuturePlans({ importedSelections: imported, existingPlans: existing, pool, rules: { ...defaultFantasySquadRules, maxPlayersPerTeam: 15 } });

  assert.deepEqual(merged[1].selections.map((item) => item.playerId), imported.map((item) => item.playerId));
  assert.equal(merged[2].linkedToPrevious, false);
  assert.ok(merged[2].selections.some((item) => item.playerId === "16"));
  assert.deepEqual(merged[3].selections.map((item) => item.playerId), merged[2].selections.map((item) => item.playerId));
});

function selection(playerId: string, slotIndex: number, isStarter: boolean): FantasySquadSelection {
  return { playerId, slotIndex, isStarter, isLocked: false, isCaptain: playerId === "3", isViceCaptain: playerId === "8", purchasePrice: 5 };
}

function fantasyPlayer(playerId: string, positionGroup: FantasyPlannerPlayer["positionGroup"]): FantasyPlannerPlayer {
  return {
    id: playerId,
    playerId,
    teamId: `team-${playerId}`,
    name: `Player ${playerId}`,
    teamName: `Team ${playerId}`,
    leagueName: "League",
    position: positionGroup,
    positionGroup,
    price: 5,
    priceSource: "SPORTS_RU",
    predictedFp: 5,
    valueScore: 1,
    roundPoints: [5],
    fixtures: ["OPP"],
    fixtureDifficulties: [3]
  };
}
