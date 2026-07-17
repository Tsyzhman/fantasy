import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFantasyForecastExplanation,
  buildPlannerRoundFixtures,
  buildTeamStrengthProfilesFromMatches,
  calibratedPlayerFixturePoints,
  compareFantasyPlannerPlayers,
  fantasyPlannerPosition,
  fantasyTeamShortName,
  loadFantasySquadPlannerData,
  normalizeFantasySquadName,
  projectFixtureFantasyPoints,
  resolveFantasyPlannerPrice,
  saveFantasySquad,
  sportsRuFantasyPriceRefsByScopedPlayer,
  sportsRuFantasyPriceScopeKey,
  sportsRuFantasyPositionsByPlayerId,
  sportsRuPricePosition,
  sportsRuSeasonAliases,
  uniqueFantasySquadName
} from "./squad_planner";
import { fitFantasyProjectionCalibration } from "./fantasy_projection_calibration";
import type { FantasyBacktestSample } from "./fantasy_backtest";
import { defaultFantasySquadRules } from "./squad_logic";

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
    ingestionJob: { findFirst: async () => null },
    dataQualityAuditRun: { findFirst: async () => null },
    fantasyPlayerPrice: { findMany: async () => [] },
    fantasyModel: { findFirst: async () => null },
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

test("squad planner normalizes forecast horizon before creating a variant", async () => {
  const creates: Array<{ data: { horizonRounds: number; name: string } }> = [];
  let insideTransaction = false;
  const prisma = {
    teamPlayerSeason: { findMany: async () => [] },
    fantasyPlayerPrice: { findMany: async () => [] },
    userFantasySquad: {
      create: async (args: { data: { horizonRounds: number; name: string } }) => {
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
    rules: defaultFantasySquadRules
  });

  assert.equal(creates[0]?.data.horizonRounds, 5);
  assert.equal(creates[0]?.data.name, "My squad");
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
  assert.equal(team?.away.xgForPerMatch, 0.5);
  assert.equal(team?.away.xgAgainstPerMatch, 1.75);
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
