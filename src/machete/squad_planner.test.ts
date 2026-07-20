import assert from "node:assert/strict";
import test from "node:test";

import {
  addPromotedTeamStrengthProfiles,
  buildFantasyForecastExplanation,
  buildPlannerRoundFixtures,
  buildTeamStrengthProfilesFromMatches,
  bookmakerFixtureMultiplier,
  componentProjectionFantasyPoints,
  componentProjectionFormulaMetrics,
  calibratedPlayerFixturePoints,
  compareFantasyPlannerPlayers,
  configuredFantasyProjectionEngine,
  fantasyPlannerPosition,
  fantasyPlannerSharedRowIdentity,
  fantasySquadRoundPlansFromFilters,
  fantasySquadRoundIdsFromFilters,
  fantasySquadRoundShift,
  fantasyTeamShortName,
  fantasyTeamShortNamesByTeamId,
  fixtureDifficultyFromMultipliers,
  fixtureFormulaMetrics,
  fixtureStrengthProjection,
  friendAlternativeProjectionFantasyPoints,
  friendAlternativeScoringModel,
  friendStartingRows,
  loadFantasySquadPlannerData,
  normalizeFantasySquadName,
  projectFixtureFantasyPoints,
  resolveFantasyPlannerPrice,
  rolloverFantasySquadRoundPlans,
  saveFantasySquad,
  sportsRuFantasyPriceRefsByScopedPlayer,
  sportsRuFantasyPriceScopeKey,
  sportsRuFantasyPositionsByPlayerId,
  sportsRuPricedFantasyPlayers,
  sportsRuPricePosition,
  sportsRuSeasonAliases,
  uniqueFantasySquadName
} from "./squad_planner";

import { fitFantasyProjectionCalibration } from "./fantasy_projection_calibration";
import type { FantasyBacktestSample } from "./fantasy_backtest";
import type { PlayerFixtureProjection } from "./deterministic_fantasy_projection";
import type { ActiveScoringModel } from "@/lib/scoring";
import { friendAlternativeFormulaDefaults } from "@/lib/scoring/formula-display";
import type { SharedMachetePlayerRow } from "./shared_read_model";
import { defaultFantasySquadRules } from "./squad_logic";

test("component xFP is the default primary engine and legacy remains a one-flag rollback", () => {
  assert.equal(configuredFantasyProjectionEngine(undefined), "COMPONENT_XFP_V1");
  assert.equal(configuredFantasyProjectionEngine("component"), "COMPONENT_XFP_V1");
  assert.equal(configuredFantasyProjectionEngine("legacy"), "LEGACY_RIDGE19_V1");
});

test("friend Alt is shared in the squad while a personal formula overrides only its own position", () => {
  const base = componentFormulaModel();
  const shared = friendAlternativeScoringModel(base, null);
  assert.equal(shared.alternativeFormulaEnabled, true);
  assert.equal(shared.alternativeFormulaGk, friendAlternativeFormulaDefaults.alternativeFormulaGk);

  const personal = friendAlternativeScoringModel(base, {
    alternativeFormulaGk: "9*{Saves}",
    alternativeFormulaDef: null,
    alternativeFormulaMid: null,
    alternativeFormulaFwd: null,
    alternativeFormulaEnabled: true
  });
  assert.equal(personal.alternativeFormulaGk, "9*{Saves}");
  assert.equal(personal.alternativeFormulaDef, friendAlternativeFormulaDefaults.alternativeFormulaDef);
  assert.equal(base.alternativeFormulaEnabled, false);
});

test("fixture formula metrics expose direct de-vigged bookmaker inputs without replacing FotMob xG", () => {
  const metrics = fixtureFormulaMetrics(
    { xg: 4.2, matches_played: 3 },
    {
      id: "fixture-1", roundId: "round-1", teamId: "1", opponentTeamId: "2", opponentName: "BAL",
      opponentFullName: "Baltika", side: "H", kickoffAt: new Date("2026-07-24T17:00:00.000Z"),
      projectedXg: 1.44, projectedXga: 0.98, attackMultiplier: 1.1, defenseMultiplier: 1.05,
      teamOver15Probability: 0.431, cleanSheetProbability: 0.407,
      oddsFetchedAt: new Date("2026-07-20T12:00:00.000Z")
    },
    new Date("2026-07-20T15:00:00.000Z")
  );

  assert.equal(metrics.xg, 4.2);
  assert.equal(metrics.fixture_projected_xg, 1.44);
  assert.equal(metrics.fixture_projected_xga, 0.98);
  assert.equal(metrics.fixture_team_over_1_5_probability, 0.431);
  assert.equal(metrics.fixture_clean_sheet_probability, 0.407);
  assert.equal(metrics.fixture_bookmaker_odds_available, 1);
  assert.equal(metrics.fixture_bookmaker_odds_age_hours, 3);
});

test("admin Expected FP formula overrides COMPONENT_XFP_V1 totals with visible component fields", () => {
  const projection: PlayerFixtureProjection = {
    playerId: "player-1",
    position: "FWD",
    expectedMinutes: 72,
    probabilities: { appearance: 0.9, sixtyMinutes: 0.75, fullMatch: 0.2 },
    allocationWeights: { goals: 0.2, assists: 0.15, recoveries: 0.1, saves: 0 },
    expectedEvents: {
      goals: 0.3, assists: 0.2, recoveries: 4, saves: 0, yellowCards: 0.1,
      redCards: 0.01, goalsConceded: 0, cleanSheets: 0
    },
    components: {
      appearance: 0.9, sixtyMinutes: 0.75, fullMatch: 0.2, goals: 1.2, assists: 0.6,
      cleanSheet: 0, saves: 0, recoveries: 1, goalsConceded: 0, yellowCards: -0.1,
      redCards: -0.03, total: 4.52
    }
  };
  const model = {
    modelSource: "MACHETE",
    customFormula: null,
    customFormulaGk: null,
    customFormulaDef: null,
    customFormulaMid: null,
    customFormulaFwd: "{Goal FP} * 2 + {Appearance FP}",
    customFormulaEnabled: true,
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
  } satisfies ActiveScoringModel;

  const metrics = componentProjectionFormulaMetrics(projection, null);
  assert.equal(metrics.goal_fp, 1.2);
  assert.equal(metrics["60_minutes_fp"], 0.75);
  assert.equal(componentProjectionFantasyPoints(projection, null, model), 3.3);
  assert.equal(componentProjectionFantasyPoints(projection, null, { ...model, customFormulaEnabled: false }), 4.52);
});

test("friend Alt uses fixture components without bookmaker or goals-conceded penalties", () => {
  const projection: PlayerFixtureProjection = {
    playerId: "gk-1",
    position: "GK",
    expectedMinutes: 90,
    probabilities: { appearance: 1, sixtyMinutes: 1, fullMatch: 1 },
    allocationWeights: { goals: 0.01, assists: 0.02, recoveries: 0, saves: 3 },
    expectedEvents: {
      goals: 0.1, assists: 0.1, recoveries: 0, saves: 3, yellowCards: 0.1,
      redCards: 0.01, goalsConceded: 4, cleanSheets: 0.4
    },
    components: {
      appearance: 1, sixtyMinutes: 1, fullMatch: 0, goals: 0.6, assists: 0.3,
      cleanSheet: 1.6, saves: 1, recoveries: 0, goalsConceded: -2, yellowCards: -0.1,
      redCards: -0.03, total: 3.37
    }
  };
  const model = {
    ...componentFormulaModel(),
    alternativeFormulaGk: friendAlternativeFormulaDefaults.alternativeFormulaGk,
    alternativeFormulaDef: friendAlternativeFormulaDefaults.alternativeFormulaDef,
    alternativeFormulaMid: friendAlternativeFormulaDefaults.alternativeFormulaMid,
    alternativeFormulaFwd: friendAlternativeFormulaDefaults.alternativeFormulaFwd,
    alternativeFormulaEnabled: true
  } satisfies ActiveScoringModel;

  assert.equal(friendAlternativeProjectionFantasyPoints(projection, null, model), 5.37);
});

test("friend Alt probable XI prioritizes starter flags and is capped at eleven", () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    id: String(index),
    isStarter: index >= 10,
    startProbability: index / 20,
    expectedMinutes: index,
    minutesPlayed: index * 90
  })) as unknown as SharedMachetePlayerRow[];
  const selected = friendStartingRows(rows);

  assert.equal(selected.length, 11);
  assert.deepEqual(selected.slice(0, 4).map((row) => row.id), ["13", "12", "11", "10"]);
});

function componentFormulaModel(): ActiveScoringModel {
  return {
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
}

test("default forecasts use only the bookmaker delta from the FotMob xG baseline", () => {
  const projectedXg = 1.5;
  const projectedXga = 1;
  const baselineOver15 = 1 - Math.exp(-projectedXg) * (1 + projectedXg);
  const baselineCleanSheet = Math.exp(-projectedXga);
  const neutral = {
    projectedXg,
    projectedXga,
    teamOver15Probability: baselineOver15,
    cleanSheetProbability: baselineCleanSheet
  };
  assert.ok(Math.abs(bookmakerFixtureMultiplier(neutral, "FWD") - 1) < 1e-12);

  const attackMoreOptimistic = {
    ...neutral,
    teamOver15Probability: baselineOver15 * 1.2,
  };
  assert.ok(bookmakerFixtureMultiplier(attackMoreOptimistic, "FWD") > bookmakerFixtureMultiplier(attackMoreOptimistic, "DEF"));

  const defenseMoreOptimistic = {
    ...neutral,
    cleanSheetProbability: baselineCleanSheet * 1.2
  };
  assert.ok(bookmakerFixtureMultiplier(defenseMoreOptimistic, "DEF") > bookmakerFixtureMultiplier(defenseMoreOptimistic, "FWD"));
});

test("legacy squads expand to five linked planning rounds and saved round plans stay independent", () => {
  const base = [{ playerId: "1", isStarter: true, isLocked: false, isCaptain: true, isViceCaptain: false, slotIndex: 0, purchasePrice: 7 }];
  const legacy = fantasySquadRoundPlansFromFilters(null, base);
  assert.equal(legacy.length, 5);
  assert.equal(legacy[0].linkedToPrevious, false);
  assert.equal(legacy[4].linkedToPrevious, true);
  assert.deepEqual(legacy[4].selections, base);
  assert.notEqual(legacy[4].selections, base);

  const stored = fantasySquadRoundPlansFromFilters({
    roundPlans: [
      { roundOffset: 0, linkedToPrevious: false, selections: base },
      { roundOffset: 1, linkedToPrevious: false, selections: [{ ...base[0], playerId: "2", isCaptain: false }] }
    ]
  }, base);
  assert.equal(stored[1].linkedToPrevious, false);
  assert.equal(stored[1].selections[0].playerId, "2");
  assert.equal(stored[2].linkedToPrevious, true);
});

test("saved five-round plans roll forward and keep only valid future variants", () => {
  const pool = rolloverPlayerPool();
  const base = rolloverSelections();
  const roundOne = replaceSelection(base, "8", "16");
  const overBudget = replaceSelection(roundOne, "15", "17");
  const validAfterRejectedRound = replaceSelection(roundOne, "9", "18");
  const tooManyTransfers = [
    ["3", "19"],
    ["4", "20"],
    ["10", "21"],
    ["13", "22"]
  ].reduce((selections, [outId, inId]) => replaceSelection(selections, outId, inId), validAfterRejectedRound);
  const plans = [base, roundOne, overBudget, validAfterRejectedRound, tooManyTransfers].map((selections, roundOffset) => ({
    roundOffset,
    linkedToPrevious: roundOffset > 0 ? roundOffset !== 1 : false,
    selections
  }));

  const rolled = rolloverFantasySquadRoundPlans({
    plans,
    shift: 1,
    fallbackSelections: base,
    pool,
    rules: defaultFantasySquadRules
  });

  assert.deepEqual(rolled[0].selections.map((selection) => selection.playerId), roundOne.map((selection) => selection.playerId));
  assert.equal(rolled[0].linkedToPrevious, false);
  assert.deepEqual(rolled[1].selections.map((selection) => selection.playerId), roundOne.map((selection) => selection.playerId));
  assert.equal(rolled[1].linkedToPrevious, true, "over-budget plan must inherit the previous valid plan");
  assert.deepEqual(rolled[2].selections.map((selection) => selection.playerId), validAfterRejectedRound.map((selection) => selection.playerId));
  assert.deepEqual(rolled[3].selections.map((selection) => selection.playerId), validAfterRejectedRound.map((selection) => selection.playerId));
  assert.equal(rolled[3].linkedToPrevious, true, "plan with more than three transfers must be rejected");
  assert.deepEqual(rolled[4].selections.map((selection) => selection.playerId), validAfterRejectedRound.map((selection) => selection.playerId));
});

test("round rollover resolves exact stored rounds, numeric gaps, and legacy filters safely", () => {
  assert.equal(fantasySquadRoundShift(["round:12", "round:13", "round:14"], ["round:13", "round:14"]), 1);
  assert.equal(fantasySquadRoundShift(["round:12", "round:13"], ["round:17"]), 5);
  assert.equal(fantasySquadRoundShift(["date:2026-08-01"], ["date:2026-08-08"]), 0);
  assert.deepEqual(fantasySquadRoundIdsFromFilters({ roundPlanRoundIds: [" round:12 ", 7, "", "round:13"] }), ["round:12", "round:13"]);
  assert.deepEqual(fantasySquadRoundIdsFromFilters({ roundPlans: [] }), []);
});

test("planner extracts team and player IDs from selected and combined history rows", () => {
  assert.deepEqual(fantasyPlannerSharedRowIdentity("47:2025/2026:10:20"), { teamId: "10", playerId: "20" });
  assert.deepEqual(fantasyPlannerSharedRowIdentity("combined:10:20:47:2025/2026"), { teamId: "10", playerId: "20" });
});

test("squad planner groups upcoming matches into fixture rounds", () => {
  const result = buildPlannerRoundFixtures(
    [
      match({ id: "1", round: "12", date: "2026-05-25T17:00:00.000Z", homeTeamId: "10", awayTeamId: "20" }),
      match({ id: "2", round: "12", date: "2026-05-25T19:00:00.000Z", homeTeamId: "30", awayTeamId: "40" }),
      match({ id: "3", round: "13", date: "2026-06-01T17:00:00.000Z", homeTeamId: "10", awayTeamId: "30" })
    ],
    new Date("2026-05-22T00:00:00.000Z")
  );

  assert.equal(result.rounds.length, 2);
  assert.equal(result.rounds[0].label, "Round 12");
  assert.equal(result.rounds[0].fixtureCount, 2);
  assert.equal(result.fixturesByTeamRound.get("round:12")?.get("10")?.[0].opponentName, "Away 20");
  assert.equal(result.fixturesByTeamRound.get("round:12")?.get("10")?.[0].opponentTeamId, "20");
});

test("squad planner uses provider team short names with a full-name fallback", () => {
  assert.equal(fantasyTeamShortName({ short_name: "Man United" }, "Manchester United"), "Man United");
  assert.equal(fantasyTeamShortName({ shortName: "Nottm Forest" }, "Nottingham Forest"), "Nottm Forest");
  assert.equal(fantasyTeamShortName({ short_name: "  " }, "Brighton & Hove Albion"), "Brighton & Hove Albion");
});

test("squad planner keeps the selected-season short name and fills gaps from another season", () => {
  const result = fantasyTeamShortNamesByTeamId(
    [
      { teamId: 10n, metadata: { short_name: "Current United" } },
      { teamId: 20n, metadata: {} },
      { teamId: 30n, metadata: null }
    ],
    [
      { teamId: 10n, metadata: { short_name: "Old United" } },
      { teamId: 20n, metadata: { short_name: "Fallback City" } },
      { teamId: 30n, metadata: { short_name: "  " } }
    ]
  );

  assert.equal(result.get("10"), "Current United");
  assert.equal(result.get("20"), "Fallback City");
  assert.equal(result.has("30"), false);
});

test("sports ru season aliases support long and compact FotMob season labels", () => {
  assert.deepEqual(sportsRuSeasonAliases("2025/2026"), ["2025/2026", "2025/26"]);
  assert.deepEqual(sportsRuSeasonAliases("2025/26"), ["2025/26", "2025/2026"]);
});

test("squad planner prefers Sports.ru position over FotMob roster position", () => {
  assert.equal(fantasyPlannerPosition("DEF", "Midfielder", "Forward"), "DEF");
  assert.equal(fantasyPlannerPosition(null, "Midfielder", "Forward"), "Midfielder");
  assert.equal(fantasyPlannerPosition("unknown", "Defender", "Forward"), "Defender");
});

test("squad planner falls back to estimated prices when Sports.ru price is missing", () => {
  assert.deepEqual(resolveFantasyPlannerPrice({ price: 7.5 }, 12, "FWD"), {
    price: 7.5,
    priceSource: "SPORTS_RU"
  });
  assert.deepEqual(resolveFantasyPlannerPrice(null, 8, "MID"), {
    price: 8.8,
    priceSource: "ESTIMATED"
  });
});

test("squad planner ranks real Sports.ru prices before estimated price ties", () => {
  const estimated = plannerPlayer({ name: "Estimated", priceSource: "ESTIMATED", valueScore: 9 });
  const sportsRu = plannerPlayer({ name: "Sports", priceSource: "SPORTS_RU", valueScore: 1 });

  assert.deepEqual([estimated, sportsRu].sort(compareFantasyPlannerPlayers).map((player) => player.name), ["Sports", "Estimated"]);
});

test("squad planner exposes only players with a real Sports.ru price", () => {
  const estimated = plannerPlayer({ name: "Estimated", priceSource: "ESTIMATED", valueScore: 9 });
  const sportsRu = plannerPlayer({ name: "Sports", priceSource: "SPORTS_RU", valueScore: 1 });

  assert.deepEqual(sportsRuPricedFantasyPlayers([estimated, sportsRu]).map((player) => player.name), ["Sports"]);
});

test("forecast explanation exposes positive factors and playing-time risks", () => {
  const explanation = buildFantasyForecastExplanation({
    matchesPlayed: 5,
    expectedMinutes: 42,
    forecastConfidence: 0.55,
    recentFp: [2, 2, 3, 5, 6],
    fixtureDifficulties: [2, 4],
    isStarter: false
  });

  assert.equal(explanation.factors.includes("Five-match historical sample"), true);
  assert.equal(explanation.factors.includes("Recent fantasy-points trend is positive"), true);
  assert.equal(explanation.risks.includes("Expected minutes only 42"), true);
  assert.equal(explanation.risks.includes("Low forecast confidence"), true);
});

test("squad planner normalizes saved forecast horizon on load", async () => {
  const prisma = {
    sportsRuFantasyContest: { findFirst: async () => null },
    userFantasySquad: {
      findMany: async () => [
        {
          id: "squad-newer",
          name: "Newer squad",
          horizonRounds: 1,
          players: [],
          updatedAt: new Date("2026-05-03T00:00:00.000Z"),
          createdAt: new Date("2026-05-03T00:00:00.000Z")
        },
        {
          id: "squad-1",
          name: "Saved squad",
          horizonRounds: 999,
          players: [],
          updatedAt: new Date("2026-05-02T00:00:00.000Z"),
          createdAt: new Date("2026-05-01T00:00:00.000Z")
        }
      ]
    },
    teamPlayerSeason: { findMany: async () => [], count: async () => 0 },
    ingestionJob: { findMany: async () => [] },
    dataQualityAuditRun: { findFirst: async () => null },
    fantasyPlayerPrice: { findMany: async () => [] },
    fantasyModel: { findFirst: async () => null },
    userScoringPreference: { findUnique: async () => null },
    playerSnapshot: { findMany: async () => [] },
    leagueSeasonTeam: { findMany: async () => [] },
    coreMatch: { findMany: async () => [], count: async () => 0 },
    macheteLeague: { findFirst: async () => null }
  };

  const data = await loadFantasySquadPlannerData(
    prisma as never,
    "user-1",
    {
      leagueId: 47n,
      season: "2025/2026",
      name: "Premier League",
      displayName: "Premier League",
      country: "England",
      providerLeagueId: "47",
      isCurrent: true,
      updatedAt: new Date("2026-05-01T00:00:00.000Z")
    },
    "squad-1"
  );

  assert.equal(data.squad.horizonRounds, 5);
  assert.equal(data.squad.id, "squad-1");
  assert.deepEqual(data.squads.map((squad) => squad.name), ["Newer squad", "Saved squad"]);
});

test("squad planner normalizes forecast horizon and stores its round anchors before creating a variant", async () => {
  const creates: Array<{ data: { horizonRounds: number; name: string; filters: unknown } }> = [];
  let insideTransaction = false;
  const prisma = {
    teamPlayerSeason: { findMany: async () => [] },
    fantasyPlayerPrice: { findMany: async () => [] },
    userFantasySquad: {
      create: async (args: { data: { horizonRounds: number; name: string; filters: unknown } }) => {
        assert.equal(insideTransaction, true, "parent squad creation must run inside the save transaction");
        creates.push(args);
        return { id: "squad-1", name: args.data.name };
      }
    },
    userFantasySquadPlayer: {
      deleteMany: () => {
        assert.equal(insideTransaction, true, "player replacement must run inside the save transaction");
        return {};
      }
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      insideTransaction = true;
      try {
        return await callback(prisma);
      } finally {
        insideTransaction = false;
      }
    }
  };

  await saveFantasySquad(prisma as never, {
    userId: "user-1",
    leagueId: 47n,
    season: "2025/2026",
    horizonRounds: 999,
    selections: [],
    roundPlanRoundIds: ["round:12", "round:13"],
    rules: defaultFantasySquadRules
  });

  assert.equal(creates[0]?.data.horizonRounds, 5);
  assert.equal(creates[0]?.data.name, "My squad");
  assert.deepEqual(creates[0]?.data.filters, {
    roundPlans: Array.from({ length: 5 }, (_, roundOffset) => ({ roundOffset, linkedToPrevious: roundOffset > 0, selections: [] })),
    roundPlanRoundIds: ["round:12", "round:13"]
  });
});

test("squad planner updates only the requested owned variant", async () => {
  const updates: Array<{ where: { id: string }; data: { name: string } }> = [];
  let insideTransaction = false;
  const prisma = {
    teamPlayerSeason: { findMany: async () => [] },
    fantasyPlayerPrice: { findMany: async () => [] },
    userFantasySquad: {
      findFirst: async () => ({ id: "squad-2" }),
      update: async (args: { where: { id: string }; data: { name: string } }) => {
        assert.equal(insideTransaction, true, "parent squad update must run inside the save transaction");
        updates.push(args);
        return { id: args.where.id, name: args.data.name };
      }
    },
    userFantasySquadPlayer: {
      deleteMany: () => {
        assert.equal(insideTransaction, true, "player replacement must run inside the save transaction");
        return {};
      }
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      insideTransaction = true;
      try {
        return await callback(prisma);
      } finally {
        insideTransaction = false;
      }
    }
  };

  const saved = await saveFantasySquad(prisma as never, {
    userId: "user-1",
    leagueId: 47n,
    season: "2025/2026",
    squadId: "squad-2",
    name: "  Long   horizon  ",
    horizonRounds: 3,
    selections: [],
    rules: defaultFantasySquadRules
  });

  assert.equal(saved.id, "squad-2");
  assert.deepEqual(updates[0]?.where, { id: "squad-2" });
  assert.equal(updates[0]?.data.name, "Long horizon");
});

test("squad save rejects a player deactivated before the transactional lock", async () => {
  let parentCreated = false;
  const prisma = {
    $queryRaw: async () => [],
    fantasyPlayerPrice: { findMany: async () => [] },
    userFantasySquad: {
      create: async () => {
        parentCreated = true;
        return { id: "squad-1", name: "My squad" };
      }
    },
    userFantasySquadPlayer: { deleteMany: async () => ({}) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)
  };

  await assert.rejects(
    saveFantasySquad(prisma as never, {
      userId: "user-1",
      leagueId: 47n,
      season: "2025/2026",
      horizonRounds: 1,
      selections: [{
        playerId: "7",
        isStarter: true,
        isLocked: false,
        isCaptain: false,
        isViceCaptain: false,
        slotIndex: 0,
        purchasePrice: 5
      }],
      rules: defaultFantasySquadRules
    }),
    /no longer active/
  );
  assert.equal(parentCreated, false);
});

test("squad save rechecks position limits after locking the authoritative roster", async () => {
  let parentCreated = false;
  const prisma = {
    $queryRaw: async () => [1n, 2n, 3n].map((playerId) => ({ playerId, teamId: playerId + 10n, position: "Goalkeeper" })),
    fantasyPlayerPrice: { findMany: async () => [] },
    userFantasySquad: {
      create: async () => {
        parentCreated = true;
        return { id: "squad-1", name: "My squad" };
      }
    },
    userFantasySquadPlayer: { deleteMany: async () => ({}) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)
  };
  const selections = ["1", "2", "3"].map((playerId, slotIndex) => ({
    playerId,
    isStarter: false,
    isLocked: false,
    isCaptain: false,
    isViceCaptain: false,
    slotIndex,
    purchasePrice: 5
  }));

  await assert.rejects(
    saveFantasySquad(prisma as never, {
      userId: "user-1",
      leagueId: 47n,
      season: "2025/2026",
      horizonRounds: 1,
      selections,
      rules: defaultFantasySquadRules
    }),
    /GK limit exceeded/
  );
  assert.equal(parentCreated, false);
});

test("squad variant names are normalized and copies receive a unique suffix", () => {
  assert.equal(normalizeFantasySquadName("  My   differential   squad  "), "My differential squad");
  assert.equal(uniqueFantasySquadName(["Main", "Main (2)"], "main"), "main (3)");
});

test("squad planner resolves Sports.ru positions through manual mappings", () => {
  const positions = sportsRuFantasyPositionsByPlayerId(
    [
      { id: "price-1", playerId: 7n, position: "UNKNOWN", positionLabel: "\u041f\u0417" },
      { id: "price-2", playerId: 8n, position: "DEF" }
    ],
    [{ providerEntityId: "price-1", internalEntityId: "42" }]
  );

  assert.equal(positions.get("42"), "MID");
  assert.equal(positions.get("7"), undefined);
  assert.equal(positions.get("8"), "DEF");
});

test("squad planner resolves scoped Sports.ru price refs through manual mappings and season aliases", () => {
  const refs = sportsRuFantasyPriceRefsByScopedPlayer(
    [
      { id: "price-1", leagueId: 47n, season: "2025/26", playerId: 7n, playerName: "Sports Name", position: "UNKNOWN", positionLabel: "\u041f\u0417", price: 6.5 },
      { id: "price-2", leagueId: 47n, season: "2025/26", playerId: 8n, playerName: "Direct Name", position: "DEF", price: 5 }
    ],
    [{ providerEntityId: "price-1", internalEntityId: "42" }]
  );

  const mapped = refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/2026", "42"));
  assert.equal(mapped?.playerName, "Sports Name");
  assert.equal(mapped?.position, "MID");
  assert.equal(mapped?.price, 6.5);
  assert.equal(refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/26", "7")), undefined);
  assert.equal(refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/26", "8"))?.playerName, "Direct Name");
});

test("squad planner recovers Sports.ru positions from typed price metadata", () => {
  assert.equal(sportsRuPricePosition({ position: "UNKNOWN", positionLabel: "\u0412\u0420" }), "GK");
  assert.equal(sportsRuPricePosition({ position: "UNKNOWN", positionLabel: "\u0417\u0430\u0449" }), "DEF");
  assert.equal(sportsRuPricePosition({ position: null, sourceKind: "featured-field", sourceRowIndex: 2 }), "MID");
  assert.equal(sportsRuPricePosition({ position: null, sourceKind: "featured-field-fallback", sourceRowIndex: 9 }), "FWD");
});

test("team strength profiles derive attack and defense from parsed match xG", () => {
  const profiles = buildTeamStrengthProfilesFromMatches([
    {
      homeTeamId: "10",
      awayTeamId: "20",
      teamStats: [
        { teamId: "10", isHome: true, xg: 2 },
        { teamId: "20", isHome: false, xg: 0.4 }
      ]
    },
    {
      homeTeamId: "30",
      awayTeamId: "20",
      teamStats: [
        { teamId: "30", isHome: true, xg: 1.5 },
        { teamId: "20", isHome: false, xg: 0.6 }
      ]
    }
  ]);

  const team = profiles.byTeamId.get("20");
  assert.equal(team?.away.matches, 2);
  assert.ok((team?.away.xgForPerMatch ?? 0) > 0.4 && (team?.away.xgForPerMatch ?? 0) < 0.6);
  assert.ok((team?.away.xgAgainstPerMatch ?? 0) > 1.85 && (team?.away.xgAgainstPerMatch ?? 0) < 2.05);
});

test("team strength gives recent xG more weight and shrinks it toward the league", () => {
  const profiles = buildTeamStrengthProfilesFromMatches([
    {
      homeTeamId: "10",
      awayTeamId: "20",
      matchDate: "2025-01-01T12:00:00.000Z",
      teamStats: [
        { teamId: "10", isHome: true, xg: 3 },
        { teamId: "20", isHome: false, xg: 0.5 }
      ]
    },
    {
      homeTeamId: "10",
      awayTeamId: "30",
      matchDate: "2025-06-30T12:00:00.000Z",
      teamStats: [
        { teamId: "10", isHome: true, xg: 0.5 },
        { teamId: "30", isHome: false, xg: 1.5 }
      ]
    }
  ]);

  const recentWeighted = profiles.byTeamId.get("10")?.overall.xgForPerMatch ?? 0;
  assert.ok(recentWeighted < 1.75, `expected recent weighting below the unweighted 1.75, received ${recentWeighted}`);
  assert.ok(recentWeighted > 1.2, `expected six-match shrinkage to retain a team signal, received ${recentWeighted}`);
});

test("fixture strength is normalized against the league instead of the team's own level", () => {
  const profiles = buildTeamStrengthProfilesFromMatches([
    strengthMatch("10", "20", 0.8, 2.0),
    strengthMatch("20", "10", 2.0, 0.8),
    strengthMatch("30", "40", 1.8, 0.7),
    strengthMatch("40", "30", 0.7, 1.8)
  ]);

  const weakDefenseAgainstStrongAttack = fixtureStrengthProjection(
    { teamId: "10", opponentTeamId: "20", side: "H" },
    profiles
  );
  const strongDefenseAgainstWeakAttack = fixtureStrengthProjection(
    { teamId: "30", opponentTeamId: "40", side: "H" },
    profiles
  );

  assert.ok((weakDefenseAgainstStrongAttack.defenseMultiplier ?? 1) < 1);
  assert.ok((strongDefenseAgainstWeakAttack.defenseMultiplier ?? 1) > 1);
});

test("fixture difficulty keeps easy fixtures green-side and hard fixtures red-side", () => {
  assert.equal(fixtureDifficultyFromMultipliers({ attackMultiplier: 1.25, defenseMultiplier: 1.25, side: "A" }, "MID"), 1);
  assert.equal(fixtureDifficultyFromMultipliers({ attackMultiplier: 0.75, defenseMultiplier: 0.75, side: "H" }, "MID"), 5);
});

test("promoted teams use compressed lower-league strength without overriding top-flight evidence", () => {
  const topLeague = buildTeamStrengthProfilesFromMatches([
    strengthMatch("10", "20", 1.5, 1.5),
    strengthMatch("20", "10", 1.5, 1.5)
  ]);
  const feederLeague = buildTeamStrengthProfilesFromMatches([
    strengthMatch("30", "40", 2.2, 0.6),
    strengthMatch("30", "50", 2.0, 0.8),
    strengthMatch("40", "50", 1.0, 1.0),
    strengthMatch("10", "50", 2.4, 0.5)
  ]);
  const merged = addPromotedTeamStrengthProfiles(topLeague, feederLeague);
  const promoted = merged.byTeamId.get("30")?.overall;
  const weakerFeederTeam = merged.byTeamId.get("40")?.overall;

  assert.ok(promoted);
  assert.ok((promoted.xgForPerMatch ?? 0) > (weakerFeederTeam?.xgForPerMatch ?? 0));
  assert.ok((promoted.xgForPerMatch ?? Infinity) < (feederLeague.byTeamId.get("30")?.overall.xgForPerMatch ?? 0));
  assert.deepEqual(merged.byTeamId.get("10"), topLeague.byTeamId.get("10"));
});

test("fixture projection weights opponent difficulty by fantasy position", () => {
  const homeOnly = projectFixtureFantasyPoints(10, "FWD", {
    side: "H",
    attackMultiplier: null,
    defenseMultiplier: null
  });
  const attackerAgainstStrongDefense = projectFixtureFantasyPoints(10, "FWD", {
    side: "H",
    attackMultiplier: 0.75,
    defenseMultiplier: 1
  });
  const defenderInGoodCleanSheetSpot = projectFixtureFantasyPoints(10, "DEF", {
    side: "H",
    attackMultiplier: 1,
    defenseMultiplier: 1.25
  });

  assert.ok(attackerAgainstStrongDefense < homeOnly);
  assert.ok(defenderInGoodCleanSheetSpot > homeOnly);
});

test("squad planner applies the fitted production calibration to upcoming fixture points", () => {
  const training = Array.from({ length: 40 }, (_, index) => calibrationSample(index + 1));
  const calibration = fitFantasyProjectionCalibration(training);
  const row = {
    id: "47:2026/2027:team-1:player-1",
    name: "Player",
    position: "FWD",
    age: 25,
    nationality: "England",
    isStarter: true,
    matchesPlayed: 5,
    minutesPlayed: 400,
    goals: 2,
    assists: 1,
    shotsOnTarget: 6,
    keyPasses: 3,
    tackles: 1,
    averageRating: 7,
    fantasyScore: 4,
    scoringScore: 4,
    alternativeScore: null,
    recentFp: [3, 4, 5, 4, 4],
    expectedMinutes: 80,
    minutesDeviation: 10,
    startProbability: 0.9,
    forecastConfidence: 0.8,
    dataUpdatedAt: new Date("2026-07-15T00:00:00.000Z"),
    hasBasicStats: true,
    teamId: "team-1",
    playerId: "player-1"
  };
  const fixture = {
    id: "fixture-1",
    roundId: "round-1",
    teamId: "team-1",
    opponentTeamId: "team-2",
    opponentName: "Opponent",
    opponentFullName: "Opponent Football Club",
    side: "H" as const,
    kickoffAt: new Date("2026-08-15T12:00:00.000Z"),
    projectedXg: 1.5,
    projectedXga: 0.8,
    attackMultiplier: 1.1,
    defenseMultiplier: 1.1
  };

  assert.equal(calibratedPlayerFixturePoints(row, fixture, null), 4);
  const calibrated = calibratedPlayerFixturePoints(row, fixture, calibration);
  assert.equal(typeof calibrated, "number");
  assert.ok((calibrated ?? 0) > 8);
});

function match(input: {
  id: string;
  round: string | null;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
}) {
  return {
    id: input.id,
    round: input.round,
    matchDate: new Date(input.date),
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeTeamName: `Home ${input.homeTeamId}`,
    awayTeamName: `Away ${input.awayTeamId}`,
    finished: false,
    cancelled: false
  };
}

function strengthMatch(homeTeamId: string, awayTeamId: string, homeXg: number, awayXg: number) {
  return {
    homeTeamId,
    awayTeamId,
    matchDate: "2025-05-01T12:00:00.000Z",
    teamStats: [
      { teamId: homeTeamId, isHome: true, xg: homeXg },
      { teamId: awayTeamId, isHome: false, xg: awayXg }
    ]
  };
}

function plannerPlayer(input: { name: string; priceSource: "SPORTS_RU" | "ESTIMATED"; valueScore: number }) {
  return {
    id: input.name,
    playerId: input.name,
    teamId: "1",
    name: input.name,
    teamName: "Team",
    leagueName: "League",
    position: "MID",
    positionGroup: "MID" as const,
    price: 5,
    priceSource: input.priceSource,
    predictedFp: 5,
    valueScore: input.valueScore,
    roundPoints: [5],
    fixtures: [],
    fixtureDifficulties: []
  };
}

function rolloverPlayerPool() {
  const positions = [
    "GK", "GK",
    "DEF", "DEF", "DEF", "DEF", "DEF",
    "MID", "MID", "MID", "MID", "MID",
    "FWD", "FWD", "FWD",
    "MID", "FWD", "MID", "DEF", "DEF", "MID", "FWD"
  ] as const;
  return positions.map((positionGroup, index) => {
    const playerId = String(index + 1);
    return {
      id: playerId,
      playerId,
      teamId: `team-${playerId}`,
      name: `Player ${playerId}`,
      teamName: `Team ${playerId}`,
      leagueName: "League",
      position: positionGroup,
      positionGroup,
      price: playerId === "17" ? 50 : 5,
      priceSource: "SPORTS_RU" as const,
      predictedFp: 5,
      valueScore: 1,
      roundPoints: [5, 5, 5, 5, 5],
      fixtures: [],
      fixtureDifficulties: []
    };
  });
}

function rolloverSelections() {
  const starters = new Set(["1", "3", "4", "5", "6", "8", "9", "10", "11", "13", "14"]);
  return Array.from({ length: 15 }, (_, index) => {
    const playerId = String(index + 1);
    return {
      playerId,
      isStarter: starters.has(playerId),
      isLocked: false,
      isCaptain: playerId === "1",
      isViceCaptain: playerId === "3",
      slotIndex: index,
      purchasePrice: 5
    };
  });
}

function replaceSelection<T extends ReturnType<typeof rolloverSelections>>(selections: T, outPlayerId: string, inPlayerId: string): T {
  return selections.map((selection) =>
    selection.playerId === outPlayerId ? { ...selection, playerId: inPlayerId } : { ...selection }
  ) as T;
}

function calibrationSample(index: number): FantasyBacktestSample {
  const day = String((index % 28) + 1).padStart(2, "0");
  return {
    matchId: `history-${index}`,
    playerId: `player-${index}`,
    teamId: "team-1",
    opponentTeamId: "team-2",
    isHome: true,
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    homeScore: 2,
    awayScore: 0,
    homeXg: 1.5,
    awayXg: 0.8,
    matchDate: `2025-${index <= 28 ? "01" : "02"}-${day}T12:00:00.000Z`,
    position: "FWD",
    playingTimeGroup: "STABLE_STARTER",
    historyMatchIds: ["h1", "h2", "h3", "h4", "h5"],
    historyFeatures: {
      expectedMinutes: 80,
      startRate: 0.9,
      minutesDeviation: 10,
      averageRating: 7,
      recentPointsDeviation: 1,
      recentPointsTrend: 0
    },
    predictedPoints: 4,
    baselinePoints: 4,
    seasonBaselinePoints: 4,
    actualPoints: 12
  };
}
