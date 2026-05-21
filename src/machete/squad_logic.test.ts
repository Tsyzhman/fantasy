import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransferSuggestions,
  canAddFantasyPlayer,
  defaultFantasySquadRules,
  selectionForPlayer,
  summarizeFantasySquad,
  type FantasyPlannerPlayer
} from "./squad_logic";

test("squad summary enforces budget and max players per team", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 20, maxPlayersPerTeam: 2 };
  const pool = [
    player("1", "GK A", "10", "GK", 6, [3]),
    player("2", "DEF A", "10", "DEF", 7, [4]),
    player("3", "MID A", "10", "MID", 8, [5])
  ];
  const selections = pool.map((item, index) => selectionForPlayer(item, index));
  const summary = summarizeFantasySquad(pool, selections, rules, 1);

  assert.equal(summary.spent, 21);
  assert.equal(summary.violations.some((violation) => violation.includes("Budget exceeded")), true);
  assert.equal(summary.violations.some((violation) => violation.includes("Team 10")), true);
});

test("can add rejects players that break a team cap", () => {
  const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 1 };
  const pool = [player("1", "GK A", "10", "GK", 5, [2]), player("2", "DEF A", "10", "DEF", 5, [2])];
  const selections = [selectionForPlayer(pool[0], 0)];

  assert.equal(canAddFantasyPlayer(pool[1], pool, selections, rules), false);
});

test("transfer suggestions improve next round and stay non-negative over horizon", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 100, maxPlayersPerTeam: 3 };
  const out = player("1", "Old Mid", "10", "MID", 6, [4, 4, 4]);
  const goodIn = player("2", "New Mid", "11", "MID", 6, [6, 4, 4]);
  const trapIn = player("3", "Trap Mid", "12", "MID", 6, [7, 1, 1]);
  const suggestions = buildTransferSuggestions({
    pool: [out, goodIn, trapIn],
    selections: [selectionForPlayer(out, 0)],
    rules,
    horizon: 3,
    transferCount: 3
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].inPlayerId, "2");
  assert.equal(suggestions[0].nextDelta, 2);
  assert.equal(suggestions[0].horizonDelta, 2);
});

function player(
  id: string,
  name: string,
  teamId: string,
  positionGroup: FantasyPlannerPlayer["positionGroup"],
  price: number,
  roundPoints: number[]
): FantasyPlannerPlayer {
  return {
    id,
    playerId: id,
    teamId,
    name,
    teamName: `Team ${teamId}`,
    leagueName: "League",
    position: positionGroup,
    positionGroup,
    price,
    priceSource: "ESTIMATED",
    valueScore: 1,
    roundPoints,
    fixtures: []
  };
}
