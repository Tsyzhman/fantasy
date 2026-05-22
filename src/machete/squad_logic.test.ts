import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransferSuggestions,
  canAddFantasyPlayer,
  defaultFantasySquadRules,
  nextFantasyPoints,
  normalizeFantasyPosition,
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

test("squad summary counts projected points from starters only", () => {
  const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 3 };
  const starter = player("1", "Starter", "10", "GK", 5, [4, 5]);
  const bench = player("2", "Bench", "11", "MID", 5, [20, 20]);
  const summary = summarizeFantasySquad(
    [starter, bench],
    [selectionForPlayer(starter, 0, true), selectionForPlayer(bench, 1, false)],
    rules,
    2
  );

  assert.equal(summary.projectedNext, 4);
  assert.equal(summary.projectedHorizon, 9);
  assert.deepEqual(summary.starterPlayers.map((item) => item.playerId), ["1"]);
  assert.deepEqual(summary.benchPlayers.map((item) => item.playerId), ["2"]);
});

test("full squad enforces roster shape and starting formation", () => {
  const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 3 };
  const pool = [
    ...rangePlayers("GK", 2, 1),
    ...rangePlayers("DEF", 5, 10),
    ...rangePlayers("MID", 5, 20),
    ...rangePlayers("FWD", 3, 30)
  ];
  const validStarterIds = new Set(["1", "10", "11", "12", "13", "20", "21", "22", "23", "30", "31"]);
  const validSummary = summarizeFantasySquad(
    pool,
    pool.map((item, index) => selectionForPlayer(item, index, validStarterIds.has(item.playerId))),
    rules,
    1
  );
  const invalidStarterIds = new Set(["1", "2", "10", "11", "12", "20", "21", "22", "23", "30", "31"]);
  const invalidSummary = summarizeFantasySquad(
    pool,
    pool.map((item, index) => selectionForPlayer(item, index, invalidStarterIds.has(item.playerId))),
    rules,
    1
  );

  assert.deepEqual(validSummary.violations, []);
  assert.equal(validSummary.starterPlayers.length, 11);
  assert.equal(validSummary.benchPlayers.length, 4);
  assert.equal(invalidSummary.violations.some((violation) => violation.includes("GK starters exceeded")), true);
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

test("next fantasy points fall back to predicted FP when no fixture rounds are loaded", () => {
  assert.equal(nextFantasyPoints(player("1", "No Fixtures", "10", "MID", 5, [])), 0);
  assert.equal(nextFantasyPoints({ ...player("2", "Projected", "10", "MID", 5, []), predictedFp: 6.4 }), 6.4);
});

test("position normalizer accepts Sports.ru labels", () => {
  assert.equal(normalizeFantasyPosition("\u0432\u0440"), "GK");
  assert.equal(normalizeFantasyPosition("\u0437\u0430\u0449"), "DEF");
  assert.equal(normalizeFantasyPosition("\u043f\u0437"), "MID");
  assert.equal(normalizeFantasyPosition("\u043d\u0430\u043f"), "FWD");
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
    predictedFp: roundPoints[0] ?? null,
    valueScore: 1,
    roundPoints,
    fixtures: []
  };
}

function rangePlayers(positionGroup: FantasyPlannerPlayer["positionGroup"], count: number, startId: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = String(startId + index);
    return player(id, `${positionGroup} ${index + 1}`, id, positionGroup, 5, [1]);
  });
}
