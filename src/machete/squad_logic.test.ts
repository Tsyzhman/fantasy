import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransferSuggestions,
  buildTransferPlanSuggestions,
  canAddFantasyPlayer,
  countFantasySquadTransfers,
  defaultFantasySquadRules,
  fantasyAddBlockReason,
  fantasyTransferLimitForHorizon,
  nextFantasyPoints,
  normalizeFantasyHorizon,
  normalizeFantasyPosition,
  optimizeFantasySquad,
  optimizeFantasyStarters,
  selectionForPlayer,
  summarizeFantasySquad,
  validateFantasySquadForSave,
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

test("full-squad optimizer returns a legal squad within budget and respects locks and exclusions", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 82, maxPlayersPerTeam: 3 };
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const pool = positions.flatMap((position, positionIndex) =>
    Array.from({ length: 20 }, (_, index) =>
      player(
        `${positionIndex + 1}${String(index).padStart(2, "0")}`,
        `${position} candidate ${index}`,
        String((index + positionIndex * 3) % 20),
        position,
        4 + (index % 5) * 0.5,
        [2 + index * 0.35, 2 + index * 0.3, 2 + index * 0.25]
      )
    )
  );
  const lockedPlayer = pool.find((candidate) => candidate.positionGroup === "DEF" && candidate.name.endsWith("0"));
  const excludedPlayer = pool.find((candidate) => candidate.positionGroup === "MID" && candidate.name.endsWith("19"));
  assert.ok(lockedPlayer);
  assert.ok(excludedPlayer);

  const optimized = optimizeFantasySquad({
    pool,
    selections: [{ ...selectionForPlayer(lockedPlayer, 0, false), isLocked: true }],
    rules,
    horizon: 3,
    excludedPlayerIds: [excludedPlayer.playerId]
  });
  assert.ok(optimized);

  const summary = summarizeFantasySquad(pool, optimized, rules, 3);
  assert.equal(optimized.length, rules.squadSize);
  assert.deepEqual(summary.violations, []);
  assert.equal(summary.spent <= rules.budgetLimit, true);
  assert.equal(optimized.some((selection) => selection.playerId === lockedPlayer.playerId && selection.isLocked), true);
  assert.equal(optimized.some((selection) => selection.playerId === excludedPlayer.playerId), false);
  assert.equal(optimized.filter((selection) => selection.isCaptain).length, 1);
  assert.equal(optimized.filter((selection) => selection.isViceCaptain).length, 1);
});

test("full-squad optimizer spends available budget on a higher forecast without selecting an unaffordable star", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 76, maxPlayersPerTeam: 20 };
  const basePool = [
    ...rangePlayers("GK", 2, 1),
    ...rangePlayers("DEF", 5, 10),
    ...rangePlayers("MID", 5, 20),
    ...rangePlayers("FWD", 3, 30)
  ];
  const upgrade = player("upgrade", "Affordable upgrade", "90", "MID", 6, [10]);
  const unaffordable = player("unaffordable", "Unaffordable star", "91", "MID", 30, [100]);
  const pool = [...basePool, upgrade, unaffordable];

  const optimized = optimizeFantasySquad({ pool, rules, horizon: 1 });
  assert.ok(optimized);
  assert.equal(optimized.some((selection) => selection.playerId === upgrade.playerId), true);
  assert.equal(optimized.some((selection) => selection.playerId === unaffordable.playerId), false);
  assert.deepEqual(summarizeFantasySquad(pool, optimized, rules, 1).violations, []);
});

test("auto-pick strategies produce distinct legal squads when risk profiles differ", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 100, maxPlayersPerTeam: 20 };
  const fixedPlayers = [
    ...rangePlayers("GK", 2, 1),
    ...rangePlayers("DEF", 5, 10),
    ...rangePlayers("MID", 4, 20),
    ...rangePlayers("FWD", 3, 30)
  ].map((candidate) => ({ ...candidate, roundPoints: [20, 20, 20], predictedFp: 20 }));
  const balancedMid = {
    ...player("balanced-mid", "Balanced Mid", "90", "MID", 5, [7, 7, 7]),
    priceSource: "SPORTS_RU" as const,
    expectedMinutes: 18,
    startProbability: 0.1,
    forecastConfidence: 0.1,
    forecastRisks: ["Rotation", "Low minutes", "Low confidence"]
  };
  const reliableMid = {
    ...player("reliable-mid", "Reliable Mid", "91", "MID", 5, [6.8, 6.8, 6.8]),
    priceSource: "SPORTS_RU" as const,
    expectedMinutes: 90,
    startProbability: 1,
    forecastConfidence: 1,
    forecastRisks: []
  };
  const upsideMid = {
    ...player("upside-mid", "Upside Mid", "92", "MID", 5, [12, 3, 3]),
    priceSource: "SPORTS_RU" as const,
    expectedMinutes: 55,
    startProbability: 0.55,
    forecastConfidence: 0.55,
    forecastRisks: ["Volatile output"]
  };
  const pool = [...fixedPlayers, balancedMid, reliableMid, upsideMid];

  const variants = (["balanced", "reliable", "upside"] as const).map((strategy) => {
    const selections = optimizeFantasySquad({ pool, rules, horizon: 3, strategy });
    assert.ok(selections);
    assert.deepEqual(summarizeFantasySquad(pool, selections, rules, 3).violations, []);
    return { strategy, selections, ids: new Set(selections.map((selection) => selection.playerId)) };
  });

  assert.equal(variants[0].ids.has("balanced-mid"), true);
  assert.equal(variants[1].ids.has("reliable-mid"), true);
  assert.equal(variants[2].ids.has("upside-mid"), true);
  assert.equal(new Set(variants.map((variant) => [...variant.ids].sort().join(":"))).size, 3);
});

test("every auto-pick strategy stays below the five-second beta limit for a 640-player pool", { timeout: 16_000 }, () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 100, maxPlayersPerTeam: 3 };
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const pool = positions.flatMap((position, positionIndex) =>
    Array.from({ length: 160 }, (_, index) =>
      player(
        `load-${positionIndex}-${index}`,
        `${position} load candidate ${index}`,
        String(index % 20),
        position,
        4 + (index % 20) * 0.25,
        [2 + (index % 30) * 0.2, 2 + (index % 30) * 0.18, 2 + (index % 30) * 0.16]
      )
    )
  );

  for (const strategy of ["balanced", "reliable", "upside"] as const) {
    const startedAt = Date.now();
    const optimized = optimizeFantasySquad({ pool, rules, horizon: 3, strategy });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(optimized);
    assert.equal(optimized.length, rules.squadSize);
    assert.ok(elapsedMs < 5_000, `Expected ${strategy} optimizer under 5000 ms, got ${elapsedMs} ms`);
  }
});

test("save validation ignores client prices and enforces the authoritative budget", () => {
  const authoritative = player("1", "Authoritative price", "10", "MID", 9, [5]);
  const forgedSelection = { ...selectionForPlayer(authoritative, 0), purchasePrice: 0.1 };
  const rejected = validateFantasySquadForSave({
    pool: [authoritative],
    selections: [forgedSelection],
    rules: { ...defaultFantasySquadRules, budgetLimit: 8 },
    horizon: 1
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.error, /Budget exceeded/);

  const accepted = validateFantasySquadForSave({
    pool: [authoritative],
    selections: [forgedSelection],
    rules: { ...defaultFantasySquadRules, budgetLimit: 10 },
    horizon: 1
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.selections[0].purchasePrice, 9);
});

test("save validation rejects players outside the active league-season pool", () => {
  const available = player("1", "Available", "10", "MID", 5, [5]);
  const unavailable = player("2", "Unavailable", "11", "MID", 5, [5]);
  const validation = validateFantasySquadForSave({
    pool: [available],
    selections: [selectionForPlayer(unavailable, 0)],
    rules: defaultFantasySquadRules,
    horizon: 1
  });

  assert.equal(validation.ok, false);
  if (!validation.ok) assert.match(validation.error, /not active/);
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

test("transfer plans return at least three alternatives when three valid upgrades exist", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 20, maxPlayersPerTeam: 3 };
  const out = player("1", "Old Mid", "10", "MID", 5, [2, 2, 2, 2, 2]);
  const alternatives = [
    player("2", "New Mid A", "11", "MID", 5, [4, 4, 4, 4, 4]),
    player("3", "New Mid B", "12", "MID", 5, [3.8, 3.8, 3.8, 3.8, 3.8]),
    player("4", "New Mid C", "13", "MID", 5, [3.5, 3.5, 3.5, 3.5, 3.5])
  ];

  const plans = buildTransferPlanSuggestions({
    pool: [out, ...alternatives],
    selections: [selectionForPlayer(out, 0)],
    rules,
    horizon: 5,
    transferCount: 1,
    maximumPlans: 3
  });

  assert.equal(plans.length, 3);
  assert.equal(plans.every((plan) => plan.transferCount === 1 && plan.round1Delta > 0 && (plan.round5Delta ?? 0) > 0), true);
});

test("linked transfer plan can fund an upgrade that is invalid as a single move", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 10, maxPlayersPerTeam: 3 };
  const expensiveOut = player("1", "Old Forward", "10", "FWD", 8, [2, 2, 2, 2, 2]);
  const cheapOut = player("2", "Old Mid", "20", "MID", 2, [1, 1, 1, 1, 1]);
  const expensiveIn = player("3", "Premium Forward", "30", "FWD", 9, [5, 5, 5, 5, 5]);
  const cheapIn = player("4", "Budget Mid", "40", "MID", 1, [1.5, 1.5, 1.5, 1.5, 1.5]);

  const plans = buildTransferPlanSuggestions({
    pool: [expensiveOut, cheapOut, expensiveIn, cheapIn],
    selections: [selectionForPlayer(expensiveOut, 0), selectionForPlayer(cheapOut, 1)],
    rules,
    horizon: 5,
    transferCount: 2,
    maximumPlans: 6,
    freeTransfers: 1,
    paidTransferPointCost: 4
  });
  const linked = plans.find((plan) => plan.transferCount === 2);

  assert.ok(linked);
  assert.equal(linked.priceDelta, 0);
  assert.equal(linked.round5Delta, 17.5);
  assert.equal(linked.paidTransferLoss, 4);
  assert.equal(linked.netHorizonDelta, 13.5);
});

test("transfer plans reject fast-path candidates that break the budget or team cap", () => {
  const rules = { ...defaultFantasySquadRules, budgetLimit: 7, maxPlayersPerTeam: 2 };
  const out = player("1", "Old Mid", "10", "MID", 5, [1, 1, 1, 1, 1]);
  const sameTeamDef = player("2", "Team Def", "20", "DEF", 1, [1, 1, 1, 1, 1]);
  const sameTeamFwd = player("3", "Team Fwd", "20", "FWD", 1, [1, 1, 1, 1, 1]);
  const overBudget = player("4", "Too Expensive", "30", "MID", 8, [9, 9, 9, 9, 9]);
  const overTeamCap = player("5", "Third Team Player", "20", "MID", 5, [8, 8, 8, 8, 8]);
  const valid = player("6", "Valid Upgrade", "40", "MID", 5, [3, 3, 3, 3, 3]);

  const plans = buildTransferPlanSuggestions({
    pool: [out, sameTeamDef, sameTeamFwd, overBudget, overTeamCap, valid],
    selections: [selectionForPlayer(out, 0), selectionForPlayer(sameTeamDef, 1), selectionForPlayer(sameTeamFwd, 2)],
    rules,
    horizon: 5,
    transferCount: 1,
    maximumPlans: 6
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].moves[0].inPlayerId, valid.playerId);
});

test("linked transfer recommendations stay below the ten-second beta limit for a 500-player pool", () => {
  const selected = [
    ...rangePlayers("GK", 2, 1),
    ...rangePlayers("DEF", 5, 20),
    ...rangePlayers("MID", 5, 50),
    ...rangePlayers("FWD", 3, 80)
  ].map((value) => ({ ...value, roundPoints: [2, 2, 2, 2, 2], predictedFp: 2 }));
  const extra = Array.from({ length: 485 }, (_, index) => {
    const positions: Array<FantasyPlannerPlayer["positionGroup"]> = ["GK", "DEF", "MID", "FWD"];
    const position = positions[index % positions.length];
    return player(String(1_000 + index), `Candidate ${index}`, String(2_000 + index), position, 5, [3 + (index % 7) / 10, 3, 3, 3, 3]);
  });
  const selections = selected.map((value, index) => {
    const positionIndex = selected.slice(0, index + 1).filter((playerRow) => playerRow.positionGroup === value.positionGroup).length - 1;
    const starter =
      (value.positionGroup === "GK" && positionIndex === 0) ||
      (value.positionGroup === "DEF" && positionIndex < 4) ||
      (value.positionGroup === "MID" && positionIndex < 3) ||
      value.positionGroup === "FWD";
    return selectionForPlayer(value, index, starter);
  });
  const startedAt = performance.now();
  const plans = buildTransferPlanSuggestions({
    pool: [...selected, ...extra],
    selections,
    rules: { ...defaultFantasySquadRules, budgetLimit: 100, maxPlayersPerTeam: 3 },
    horizon: 5,
    transferCount: 3,
    maximumPlans: 6
  });
  const elapsed = performance.now() - startedAt;

  assert.equal(plans.length >= 3, true);
  assert.equal(elapsed < 10_000, true, `transfer recommendations took ${Math.round(elapsed)} ms`);
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
  assert.equal(normalizeFantasyPosition("CB,LB"), "DEF");
  assert.equal(normalizeFantasyPosition("CDM,CM,CAM"), "MID");
  assert.equal(normalizeFantasyPosition("ST,CAM"), "FWD");
  assert.equal(normalizeFantasyPosition("GK"), "GK");
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
