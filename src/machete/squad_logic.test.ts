import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransferSuggestions,
  canAddFantasyPlayer,
  countFantasySquadTransfers,
  defaultFantasySquadRules,
  fantasyAddBlockReason,
  fantasyTransferLimitForHorizon,
  nextFantasyPoints,
  normalizeFantasyHorizon,
  normalizeFantasyPosition,
  optimizeFantasyStarters,
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
  assert.equal(validSummary.benchByPosition.GK, 1);
  assert.equal(invalidSummary.violations.some((violation) => violation.includes("GK starters exceeded")), true);
  assert.equal(invalidSummary.violations.some((violation) => violation.includes("Bench GK must be 1")), true);
});

test("optimizer picks the best valid starting XI while respecting locks", () => {
  const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 20 };
  const pool = [
    player("1", "Weak GK", "1", "GK", 5, [1]),
    player("2", "Strong GK", "2", "GK", 5, [9]),
    player("10", "DEF 8", "10", "DEF", 5, [8]),
    player("11", "DEF 7", "11", "DEF", 5, [7]),
    player("12", "DEF 6", "12", "DEF", 5, [6]),
    player("13", "DEF 1", "13", "DEF", 5, [1]),
    player("14", "Locked DEF", "14", "DEF", 5, [1]),
    player("20", "MID 9", "20", "MID", 5, [9]),
    player("21", "MID 8", "21", "MID", 5, [8]),
    player("22", "MID 7", "22", "MID", 5, [7]),
    player("23", "MID 6", "23", "MID", 5, [6]),
    player("24", "MID 1", "24", "MID", 5, [1]),
    player("30", "Locked Bench FWD", "30", "FWD", 5, [10]),
    player("31", "FWD 5", "31", "FWD", 5, [5]),
    player("32", "FWD 1", "32", "FWD", 5, [1])
  ];
  const startingIds = new Set(["1", "10", "13", "14", "20", "21", "22", "23", "24", "31", "32"]);
  const selections = pool.map((item, index) => ({
    ...selectionForPlayer(item, index, startingIds.has(item.playerId)),
    isLocked: item.playerId === "14" || item.playerId === "30"
  }));

  const optimized = optimizeFantasyStarters({ pool, selections, rules, horizon: 1 });
  assert.ok(optimized);

  const optimizedSummary = summarizeFantasySquad(pool, optimized, rules, 1);
  assert.deepEqual(optimizedSummary.violations, []);
  assert.equal(optimized.find((selection) => selection.playerId === "2")?.isStarter, true);
  assert.equal(optimized.find((selection) => selection.playerId === "14")?.isStarter, true);
  assert.equal(optimized.find((selection) => selection.playerId === "30")?.isStarter, false);
  assert.equal(optimizedSummary.projectedHorizon > summarizeFantasySquad(pool, selections, rules, 1).projectedHorizon, true);
});

test("player additions are blocked when position or team slots are full", () => {
  const rules = { ...defaultFantasySquadRules, maxPlayersPerTeam: 2 };
  const gks = rangePlayers("GK", 3, 1);
  const teamMids = [
    player("10", "Team Mid 1", "90", "MID", 5, [1]),
    player("11", "Team Mid 2", "90", "MID", 5, [1]),
    player("12", "Team Mid 3", "90", "MID", 5, [1])
  ];

  assert.equal(fantasyAddBlockReason(gks[2], gks, [selectionForPlayer(gks[0], 0), selectionForPlayer(gks[1], 1)], rules), "GK limit reached");
  assert.equal(
    fantasyAddBlockReason(teamMids[2], teamMids, [selectionForPlayer(teamMids[0], 0), selectionForPlayer(teamMids[1], 1)], rules),
    "Team 90 limit reached"
  );
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
  assert.deepEqual(
    buildTransferSuggestions({
      pool: [out, goodIn, trapIn],
      selections: [selectionForPlayer(out, 0)],
      rules,
      horizon: 3,
      transferCount: 0
    }),
    []
  );
});

test("transfer limit scales with forecast horizon", () => {
  assert.equal(fantasyTransferLimitForHorizon(1), 3);
  assert.equal(fantasyTransferLimitForHorizon(5), 15);
  assert.equal(fantasyTransferLimitForHorizon(0), 3);
});

test("forecast horizon accepts only configured options", () => {
  assert.equal(normalizeFantasyHorizon(3, [1, 3, 5, 10]), 3);
  assert.equal(normalizeFantasyHorizon("10", [1, 3, 5, 10]), 10);
  assert.equal(normalizeFantasyHorizon(999, [1, 3, 5, 10]), 5);
  assert.equal(normalizeFantasyHorizon(0, [1, 3, 5, 10]), 5);
  assert.equal(normalizeFantasyHorizon(5, [1, 3], 3), 3);
});

test("transfer counter treats a paired out and in as one move", () => {
  const saved = [{ playerId: "1" }, { playerId: "2" }, { playerId: "3" }];

  assert.equal(countFantasySquadTransfers(saved, [{ playerId: "1" }, { playerId: "2" }, { playerId: "4" }]), 1);
  assert.equal(countFantasySquadTransfers(saved, [{ playerId: "1" }]), 2);
  assert.equal(countFantasySquadTransfers([{ playerId: "1" }], saved), 2);
});

test("next fantasy points fall back to predicted FP when no fixture rounds are loaded", () => {
  assert.equal(nextFantasyPoints(player("1", "No Fixtures", "10", "MID", 5, [])), 0);
  assert.equal(nextFantasyPoints({ ...player("2", "Projected", "10", "MID", 5, []), predictedFp: 6.4 }), 6.4);
});

test("position normalizer accepts Sports.ru labels", () => {
  assert.equal(normalizeFantasyPosition("\u0432\u0440"), "GK");
  assert.equal(normalizeFantasyPosition("\u0412\u0420\u0422"), "GK");
  assert.equal(normalizeFantasyPosition("\u0412\u0440\u0430\u0442\u0430\u0440\u0438"), "GK");
  assert.equal(normalizeFantasyPosition("\u0437\u0430\u0449"), "DEF");
  assert.equal(normalizeFantasyPosition("\u0417\u0429"), "DEF");
  assert.equal(normalizeFantasyPosition("\u043f\u0437"), "MID");
  assert.equal(normalizeFantasyPosition("\u041f"), "MID");
  assert.equal(normalizeFantasyPosition("\u043d\u0430\u043f"), "FWD");
  assert.equal(normalizeFantasyPosition("\u041d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0435"), "FWD");
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
    fixtures: [],
    fixtureDifficulties: []
  };
}

function rangePlayers(positionGroup: FantasyPlannerPlayer["positionGroup"], count: number, startId: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = String(startId + index);
    return player(id, `${positionGroup} ${index + 1}`, id, positionGroup, 5, [1]);
  });
}
