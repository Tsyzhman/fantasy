import assert from "node:assert/strict";
import test from "node:test";

import {
  applySportsRuRosterOverrides,
  addPromotedTeamStrengthProfiles,
  aggregateRoundDifficulty,
  authoritativeFantasyRosterByPlayerId,
  buildFormulaProjectionIndex,
  buildFplOfficialForecastAdjustments,
  buildBookmakerFavorites,
  buildFantasyForecastExplanation,
  buildPlannerRoundFixtures,
  buildTeamStrengthProfilesFromMatches,
  bookmakerFixtureMultiplier,
  componentProjectionFantasyPoints,
  componentProjectionFormulaMetrics,
  countsAsFullFantasyMatch,
  calibratedPlayerFixturePoints,
  compareFantasyPlannerPlayers,
  configuredFantasyProjectionEngine,
  fantasyPlannerPosition,
  fantasyProviderRoundKey,
  fantasyPlayerPoolPreferenceGroups,
  fantasyPlannerSharedRowIdentity,
  fantasySquadRoundPlansFromFilters,
  fantasySquadRoundIdsFromFilters,
  fantasySquadRoundShift,
  fantasyTeamShortName,
  fantasyTeamShortNamesByTeamId,
  fillTeamStrengthStatsFromScore,
  fixtureDifficultyFromMultipliers,
  fixtureFormulaMetrics,
  fixtureOddsAreFresh,
  fixtureStrengthProjection,
  fixtureStrengthWithBookmaker,
  friendAlternativeProjectionFantasyPoints,
  friendAlternativeScoringModel,
  friendStartingRows,
  fantasyPlayerPoolCacheKey,
  loadFantasySquadPlannerData,
  normalizeFantasySquadName,
  preferredArchivedSeason,
  projectFixtureFantasyPoints,
  resolveFantasyPlannerPrice,
  rolloverFantasySquadRoundPlans,
  saveFantasySquad,
  sportsRuAuthoritativeRosterOverrides,
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
import { calculateFriendWindowMetrics, type SharedMachetePlayerRow } from "./shared_read_model";
import { defaultFantasySquadRules } from "./squad_logic";
import { expectedProjectionFormulaConfig, friendAltProjectionFormulaConfig } from "./projection-formula-config";
import { positionEventPriorPer90 } from "./player-season-prior";

test("FPL official forecast history applies position thresholds instead of recoveries groups", () => {
  const adjustments = buildFplOfficialForecastAdjustments([
    { playerId: 1n, gameweek: 3, points: 8, status: "OFFICIAL", breakdown: { minutes: 90, bonus: 3, defensive_contribution: 10 } },
    { playerId: 1n, gameweek: 2, points: 4, status: "OFFICIAL", breakdown: { minutes: 90, bonus: 1, defensive_contribution: 9 } },
    { playerId: 1n, gameweek: 1, points: 0, status: "OFFICIAL", breakdown: { minutes: 0, bonus: 0, defensive_contribution: 10 } },
    { playerId: 2n, gameweek: 3, points: 5, status: "OFFICIAL", breakdown: { minutes: 75, bonus: 0, defensive_contribution: 10 } },
    { playerId: 2n, gameweek: 2, points: 7, status: "OFFICIAL", breakdown: { minutes: 90, bonus: 2, defensive_contribution: 12 } },
    { playerId: 3n, gameweek: 3, points: 6, status: "OFFICIAL", breakdown: { minutes: 90, bonus: 1, defensive_contribution: 100 } },
    { playerId: 4n, gameweek: 3, points: 6, status: "PROVISIONAL", breakdown: { minutes: 90, bonus: 3, defensive_contribution: 12 } }
  ], new Map([
    ["1", "DEF"],
    ["2", "MID"],
    ["3", "GK"]
  ]), 2);

  assert.deepEqual(adjustments.get("1"), {
    expectedBonusPerAppearance: 2,
    expectedDefensiveContributionPointsPerAppearance: 1,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
  assert.deepEqual(adjustments.get("2"), {
    expectedBonusPerAppearance: 1,
    expectedDefensiveContributionPointsPerAppearance: 1,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
  assert.deepEqual(adjustments.get("3"), {
    expectedBonusPerAppearance: 1,
    expectedDefensiveContributionPointsPerAppearance: null,
    bonusCoverage: 0.5,
    defensiveContributionCoverage: 1
  });
  assert.equal(adjustments.has("4"), false);
});

test("FPL forecast history keeps double-gameweek fixtures as separate appearances", () => {
  const adjustments = buildFplOfficialForecastAdjustments([{
    playerId: 1n,
    gameweek: 8,
    points: 16,
    status: "OFFICIAL",
    breakdown: {
      minutes: 180,
      bonus: 4,
      defensive_contribution: 21,
      fixture_breakdowns: [
        { fixtureId: "801", stats: { minutes: { value: 90, points: 2 }, bonus: { value: 3, points: 3 }, defensive_contribution: { value: 10, points: 2 } } },
        { fixtureId: "802", stats: { minutes: { value: 90, points: 2 }, bonus: { value: 1, points: 1 }, defensive_contribution: { value: 11, points: 2 } } }
      ]
    }
  }], new Map([["1", "DEF"]]), 2);

  assert.deepEqual(adjustments.get("1"), {
    expectedBonusPerAppearance: 2,
    expectedDefensiveContributionPointsPerAppearance: 2,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
});

test("FPL per-fixture history treats omitted bonus and defensive-contribution awards as zero", () => {
  const adjustments = buildFplOfficialForecastAdjustments([{
    playerId: 1n,
    gameweek: 1,
    points: 2,
    status: "OFFICIAL",
    breakdown: {
      minutes: 90,
      bonus: 0,
      fixture_breakdowns: [{
        fixtureId: "101",
        stats: { minutes: { value: 90, points: 2 } }
      }]
    }
  }], new Map([["1", "DEF"]]), 1);

  assert.deepEqual(adjustments.get("1"), {
    expectedBonusPerAppearance: 0,
    expectedDefensiveContributionPointsPerAppearance: 0,
    bonusCoverage: 1,
    defensiveContributionCoverage: 1
  });
});

test("a new Foontasy fetch timestamp creates a new fantasy player pool cache key", () => {
  const base = {
    provider: "SPORTS_RU",
    contestId: "contest-47",
    leagueId: 47n,
    season: "2026/2027",
    leagueUpdatedAt: new Date("2026-08-13T08:00:00.000Z"),
    startingXiRevision: "no-xi-change",
    preferenceKey: "global",
    historySettingsKey: "LAST_5"
  };
  const first = fantasyPlayerPoolCacheKey({ ...base, foontasyRevision: "2026-08-13T08:01:00.000Z" });
  const same = fantasyPlayerPoolCacheKey({ ...base, foontasyRevision: "2026-08-13T08:01:00.000Z" });
  const refreshed = fantasyPlayerPoolCacheKey({ ...base, foontasyRevision: "2026-08-13T12:01:00.000Z" });

  assert.equal(first, same);
  assert.notEqual(first, refreshed);
});

test("component xFP is the default primary engine and legacy remains a one-flag rollback", () => {
  assert.equal(configuredFantasyProjectionEngine(undefined), "COMPONENT_XFP_V1");
  assert.equal(configuredFantasyProjectionEngine("component"), "COMPONENT_XFP_V1");
  assert.equal(configuredFantasyProjectionEngine("legacy"), "LEGACY_RIDGE19_V1");
});

test("franchise previews share the global player pool but isolate personal formulas", () => {
  const groups = fantasyPlayerPoolPreferenceGroups(
    ["global-1", "custom-1", "global-2", "custom-2", "global-1"],
    [
      { userId: "custom-1", id: "formula-a", updatedAt: new Date("2026-07-24T08:00:00Z") },
      { userId: "custom-2", id: "formula-b", updatedAt: new Date("2026-07-24T08:00:00Z") }
    ]
  );
  assert.deepEqual(groups.get("global")?.userIds, ["global-1", "global-2"]);
  assert.deepEqual(groups.get("formula-a:2026-07-24T08:00:00.000Z")?.userIds, ["custom-1"]);
  assert.deepEqual(groups.get("formula-b:2026-07-24T08:00:00.000Z")?.userIds, ["custom-2"]);
  assert.equal(groups.size, 3);
});

test("promoted-player archive prefers the feeder league over a one-match cup row", () => {
  const archive = preferredArchivedSeason([
    { season: "2025/2026", teamId: 1066681n, leagueId: 193n, appearances: 1 },
    { season: "2025/2026", teamId: 1066681n, leagueId: 338n, appearances: 34 }
  ], "1066681", 63n);
  assert.equal(archive?.leagueId, 338n);
  assert.equal(archive?.appearances, 34);
});

test("Eredivisie promoted-player archive prefers Eerste Divisie over a one-match KNVB Cup row", () => {
  const archive = preferredArchivedSeason([
    { season: "2025/2026", teamId: 9830n, leagueId: 235n, appearances: 1 },
    { season: "2025/2026", teamId: 9830n, leagueId: 111n, appearances: 25 }
  ], "9830", 57n);
  assert.equal(archive?.leagueId, 111n);
  assert.equal(archive?.appearances, 25);
});

test("Liga Portugal promoted-player archive prefers Liga Portugal 2 over a cup cameo", () => {
  const archive = preferredArchivedSeason([
    { season: "2025/2026", teamId: 10212n, leagueId: 186n, appearances: 1 },
    { season: "2025/2026", teamId: 10212n, leagueId: 185n, appearances: 31 }
  ], "10212", 61n);
  assert.equal(archive?.leagueId, 185n);
  assert.equal(archive?.appearances, 31);
});

test("editable pipeline applies history, fixture, allocation and final score formulas in order", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      expectedMinutes: "90",
      appearanceProbability: "1",
      sixtyProbability: "1",
      fullMatchProbability: "1",
      xgRate: "{xG per 90 L1}",
      xaRate: "0",
      recoveryRate: "0",
      saveRate: "0",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "2",
      expectedGoalsAgainst: "1",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    },
    allocation: {
      goals: "{Blended xG per 90} * {Expected goals}",
      assists: "0",
      recoveries: "0",
      saves: "0",
      cardExposure: "0"
    },
    scoreByPosition: {
      GK: "{Expected goals}",
      DEF: "{Expected goals}",
      MID: "{Expected goals}",
      FWD: "{Expected goals}"
    }
  };
  const row = (playerId: string, xg: number) => ({
    playerId,
    teamId: "team-1",
    position: "FWD",
    isStarter: true,
    startProbability: 1,
    expectedMinutes: 90,
    minutesPlayed: 90,
    rawMetrics: { xg_per_90_l1: xg }
  }) as never;
  const fixture = {
    id: "fixture-1",
    roundId: "round-1",
    teamId: "team-1",
    opponentTeamId: "team-2",
    opponentName: "OPP",
    opponentFullName: "Opponent",
    side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"),
    projectedXg: 1,
    projectedXga: 1,
    attackMultiplier: 1,
    defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    [row("p1", 1), row("p2", 3)],
    {
      rounds: [],
      fixturesByTeamRound: new Map([["round-1", new Map([["team-1", [fixture]]])]]),
      teamShortNameById: new Map()
    },
    new Map([["p1", "FWD"], ["p2", "FWD"]]),
    config
  );

  assert.deepEqual(index.errorsByFixtureTeam, new Map());
  assert.equal(index.byFixturePlayer.get("fixture-1:p1")?.expectedEvents.goals, 0.5);
  assert.equal(index.byFixturePlayer.get("fixture-1:p2")?.expectedEvents.goals, 1.5);
  assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-1:p1")?.expected_goals, 2);
});

test("formula pipeline scales a raw per-90 allocation by expected minutes", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: "{Minutes per match 365}",
      appearanceProbability: "1",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "gte({Expected minutes}, 80)",
      xgRate: "1",
      xaRate: "1",
      recoveryRate: "1",
      saveRate: "1",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "1",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    },
    allocation: {
      goals: "{Blended xG per 90}",
      assists: "0",
      recoveries: "{Blended recoveries per 90}",
      saves: "{Blended saves per 90}",
      cardExposure: "1"
    }
  };
  const row = (playerId: string, minutes: number) => ({
    playerId,
    teamId: "team-1",
    position: "FWD",
    isStarter: true,
    startProbability: 1,
    expectedMinutes: minutes,
    minutesPlayed: minutes,
    rawMetrics: { minutes_per_match_365: minutes }
  }) as never;
  const fixture = {
    id: "fixture-1", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 1, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    [row("p60", 60), row("p90", 90)],
    { rounds: [], fixturesByTeamRound: new Map([["round-1", new Map([["team-1", [fixture]]])]]), teamShortNameById: new Map() },
    new Map([["p60", "FWD"], ["p90", "FWD"]]),
    config
  );

  assert.deepEqual(index.errorsByFixtureTeam, new Map());
  assert.ok(Math.abs((index.byFixturePlayer.get("fixture-1:p60")?.allocationWeights.goals ?? 0) - 2 / 3) < 1e-12);
  assert.equal(index.byFixturePlayer.get("fixture-1:p90")?.allocationWeights.goals, 1);
  assert.ok(Math.abs((index.byFixturePlayer.get("fixture-1:p60")?.expectedEvents.goals ?? 0) - 0.4) < 1e-12);
  assert.ok(Math.abs((index.byFixturePlayer.get("fixture-1:p90")?.expectedEvents.goals ?? 0) - 0.6) < 1e-12);
});

test("FPL projection scope does not evaluate or allocate generic recoveries", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: "90",
      appearanceProbability: "1",
      sixtyProbability: "1",
      fullMatchProbability: "1",
      xgRate: "0",
      xaRate: "0",
      recoveryRate: "1 / 0",
      saveRate: "0",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "0",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    },
    allocation: {
      goals: "0",
      assists: "0",
      recoveries: "1 / 0",
      saves: "0",
      cardExposure: "1"
    }
  };
  const fixture = {
    id: "fixture-1", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-08-22T12:00:00Z"), projectedXg: 0, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    [{
      playerId: "p1",
      teamId: "team-1",
      position: "DEF",
      isStarter: false,
      startProbability: 1,
      expectedMinutes: 90,
      minutesPlayed: 90,
      rawMetrics: {}
    } as never],
    { rounds: [], fixturesByTeamRound: new Map([["round-1", new Map([["team-1", [fixture]]])]]), teamShortNameById: new Map() },
    new Map([["p1", "DEF"]]),
    config,
    false,
    "FPL"
  );

  assert.deepEqual(index.errorsByFixtureTeam, new Map());
  assert.equal(index.byFixturePlayer.get("fixture-1:p1")?.allocationWeights.recoveries, 0);
  assert.equal(index.byFixturePlayer.get("fixture-1:p1")?.expectedEvents.recoveries, 0);
});

test("primary and Alt apply position-specific starter minutes only to the chronologically nearest fixture", () => {
  const configFor = (base: typeof expectedProjectionFormulaConfig, ordinaryMinutes = 40) => ({
    ...base,
    history: {
      ...base.history,
      // The product invariant must ignore persisted/custom starter arithmetic.
      expectedMinutes: `clamp(${ordinaryMinutes} + 10 * {Roster starter}, 0, 90)`,
      appearanceProbability: "1",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "0",
      xgRate: "0",
      xaRate: "0",
      recoveryRate: "0",
      saveRate: "0",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "0",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    },
    allocation: {
      goals: "0 * {Expected minutes}",
      assists: "0 * {Expected minutes}",
      recoveries: "0 * {Expected minutes}",
      saves: "0 * {Expected minutes}",
      cardExposure: "0 * {Expected minutes}"
    }
  });
  const row = (playerId: string, isStarter: boolean, position = "FWD") => ({
    playerId,
    teamId: "team-1",
    position,
    isStarter,
    startProbability: 0,
    expectedMinutes: 40,
    minutesPlayed: 360,
    rawMetrics: {}
  }) as never;
  const nearestFixture = {
    id: "fixture-nearest", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 0, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const laterFixture = {
    ...nearestFixture,
    id: "fixture-later",
    roundId: "round-2",
    kickoffAt: new Date("2026-08-01T12:00:00Z")
  };
  const fixtures = {
    rounds: [],
    // Deliberately insert the later fixture first: chronology, not map order,
    // decides where the one-match floor applies.
    fixturesByTeamRound: new Map([
      ["round-2", new Map([["team-1", [laterFixture]]])],
      ["round-1", new Map([["team-1", [nearestFixture]]])]
    ]),
    teamShortNameById: new Map()
  };

  for (const config of [configFor(expectedProjectionFormulaConfig), configFor(friendAltProjectionFormulaConfig)]) {
    const index = buildFormulaProjectionIndex(
      [row("starter", true), row("bench", false)],
      fixtures,
      new Map([["starter", "FWD"], ["bench", "FWD"]]),
      config
    );

    assert.deepEqual(index.errorsByFixtureTeam, new Map());
    assert.equal(index.byFixturePlayer.get("fixture-nearest:starter")?.expectedMinutes, 60);
    assert.equal(index.byFixturePlayer.get("fixture-later:starter")?.expectedMinutes, 40);
    assert.equal(index.byFixturePlayer.get("fixture-nearest:bench")?.expectedMinutes, 40);
    assert.equal(index.byFixturePlayer.get("fixture-later:bench")?.expectedMinutes, 40);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-nearest:starter")?.base_expected_minutes, 40);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-nearest:starter")?.roster_starter_minute_floor, 60);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-nearest:starter")?.roster_starter_minutes_uplift, 20);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-nearest:starter")?.roster_starter, 1);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-later:starter")?.roster_starter, 0);
    assert.equal(index.formulaMetricsByFixturePlayer.get("fixture-later:starter")?.roster_starter_minutes_uplift, 0);
  }

  for (const config of [configFor(expectedProjectionFormulaConfig), configFor(friendAltProjectionFormulaConfig)]) {
    const goalkeeperIndex = buildFormulaProjectionIndex(
      [row("goalkeeper", true, "GK")],
      fixtures,
      new Map([["goalkeeper", "GK"]]),
      config
    );
    assert.equal(goalkeeperIndex.byFixturePlayer.get("fixture-nearest:goalkeeper")?.expectedMinutes, 90);
    assert.equal(goalkeeperIndex.byFixturePlayer.get("fixture-later:goalkeeper")?.expectedMinutes, 40);
    assert.equal(goalkeeperIndex.formulaMetricsByFixturePlayer.get("fixture-nearest:goalkeeper")?.roster_starter_minute_floor, 90);
    assert.equal(goalkeeperIndex.formulaMetricsByFixturePlayer.get("fixture-nearest:goalkeeper")?.roster_starter_minutes_uplift, 50);
  }

  const highMinuteIndex = buildFormulaProjectionIndex(
    [row("starter", true)],
    fixtures,
    new Map([["starter", "FWD"]]),
    configFor(expectedProjectionFormulaConfig, 82)
  );
  assert.equal(highMinuteIndex.byFixturePlayer.get("fixture-nearest:starter")?.expectedMinutes, 82);
  assert.equal(highMinuteIndex.byFixturePlayer.get("fixture-later:starter")?.expectedMinutes, 82);
  assert.equal(highMinuteIndex.formulaMetricsByFixturePlayer.get("fixture-nearest:starter")?.roster_starter_minutes_uplift, 0);
});

test("Alt limits only the nearest fixture to the marked XI and uses every player's ordinary minutes later", () => {
  const config = {
    ...friendAltProjectionFormulaConfig,
    history: {
      ...friendAltProjectionFormulaConfig.history,
      expectedMinutes: "{minutes}",
      appearanceProbability: "1",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "0",
      xgRate: "0",
      xaRate: "0",
      recoveryRate: "0",
      saveRate: "0",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "0",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    },
    allocation: {
      goals: "0",
      assists: "0",
      recoveries: "0",
      saves: "0",
      cardExposure: "0"
    }
  };
  const rows = [
    ...Array.from({ length: 9 }, (_, index) => ({
      playerId: `starter-${index}`,
      teamId: "team-1",
      position: "FWD",
      isStarter: true,
      startProbability: 1,
      expectedMinutes: 80,
      minutesPlayed: 900,
      rawMetrics: { minutes: 80 }
    })),
    {
      playerId: "marked-horizon-player",
      teamId: "team-1",
      position: "FWD",
      isStarter: true,
      startProbability: 0.4,
      expectedMinutes: 64,
      minutesPlayed: 576,
      rawMetrics: { minutes: 64 }
    },
    {
      playerId: "unmarked-high-minutes",
      teamId: "team-1",
      position: "FWD",
      isStarter: false,
      startProbability: 1,
      expectedMinutes: 85,
      minutesPlayed: 900,
      rawMetrics: { minutes: 85 }
    },
    {
      playerId: "marked-45-minutes",
      teamId: "team-1",
      position: "FWD",
      isStarter: true,
      startProbability: 0.4,
      expectedMinutes: 45,
      minutesPlayed: 405,
      rawMetrics: { minutes: 45 }
    },
    {
      playerId: "marked-below-top-eleven",
      teamId: "team-1",
      position: "FWD",
      isStarter: true,
      startProbability: 0.2,
      expectedMinutes: 20,
      minutesPlayed: 180,
      rawMetrics: { minutes: 20 }
    }
  ];
  const nearestFixture = {
    id: "fixture-nearest", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 0, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const laterFixtures = Array.from({ length: 4 }, (_, index) => ({
    ...nearestFixture,
    id: `fixture-later-${index + 2}`,
    roundId: `round-${index + 2}`,
    kickoffAt: new Date(Date.UTC(2026, 7, 1 + index * 7, 12))
  }));
  const positions = new Map(rows.map((row: { playerId: string }) => [row.playerId, "FWD"]));
  const index = buildFormulaProjectionIndex(
    rows as never,
    {
      rounds: [],
      fixturesByTeamRound: new Map([
        ["round-1", new Map([["team-1", [nearestFixture]]])],
        ...laterFixtures.map((fixture) => [
          fixture.roundId,
          new Map([["team-1", [fixture]]])
        ] as const)
      ]),
      teamShortNameById: new Map()
    },
    positions,
    config,
    true
  );

  assert.equal(index.byFixturePlayer.get("fixture-nearest:marked-horizon-player")?.expectedMinutes, 64);
  assert.equal(index.byFixturePlayer.has("fixture-nearest:unmarked-high-minutes"), false);
  assert.equal(index.byFixturePlayer.get("fixture-nearest:marked-45-minutes")?.expectedMinutes, 60);
  assert.equal(index.byFixturePlayer.has("fixture-nearest:marked-below-top-eleven"), false);
  for (const fixture of laterFixtures) {
    assert.equal(index.byFixturePlayer.get(`${fixture.id}:marked-horizon-player`)?.expectedMinutes, 64);
    assert.equal(index.byFixturePlayer.get(`${fixture.id}:unmarked-high-minutes`)?.expectedMinutes, 85);
    assert.equal(index.byFixturePlayer.get(`${fixture.id}:marked-45-minutes`)?.expectedMinutes, 45);
    assert.equal(index.byFixturePlayer.get(`${fixture.id}:marked-below-top-eleven`)?.expectedMinutes, 20);
  }
});

test("Alt keeps a promoted club marked XI calculable without assigning all missing attack to zero-history starters", () => {
  const positions = ["GK", ...Array(4).fill("DEF"), ...Array(4).fill("MID"), ...Array(2).fill("FWD")];
  const rows = positions.map((position, index) => ({
    playerId: `promoted-starter-${index}`,
    teamId: "promoted-team",
    position,
    isStarter: true,
    startProbability: 0,
    expectedMinutes: null,
    minutesPlayed: 0,
    rawMetrics: {}
  }));
  const nearestFixture = {
    id: "promoted-nearest", roundId: "round-1", teamId: "promoted-team", opponentTeamId: "opponent",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 1.08, projectedXga: 0.89,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    rows as never,
    {
      rounds: [],
      fixturesByTeamRound: new Map([
        ["round-1", new Map([["promoted-team", [nearestFixture]]])]
      ]),
      teamShortNameById: new Map()
    },
    new Map(rows.map((row) => [row.playerId, row.position])),
    friendAltProjectionFormulaConfig,
    true
  );

  assert.deepEqual(index.errorsByFixtureTeam, new Map());
  assert.equal(index.byFixturePlayer.size, 11);
  assert.equal(index.byFixturePlayer.get("promoted-nearest:promoted-starter-0")?.expectedMinutes, 90);
  assert.equal(index.byFixturePlayer.get("promoted-nearest:promoted-starter-1")?.expectedMinutes, 60);
  const promotedDefenderMetrics = index.formulaMetricsByFixturePlayer.get("promoted-nearest:promoted-starter-1");
  assert.equal(promotedDefenderMetrics?.pre_role_xg_per_90, 0);
  assert.ok(Number(promotedDefenderMetrics?.blended_xg_per_90) > 0);
  assert.equal(promotedDefenderMetrics?.starter_role_reliability, 0.25);
  assert.equal(promotedDefenderMetrics?.sparse_team_attack_allocation_guard, 1);
  assert.ok(Number(promotedDefenderMetrics?.team_attack_goal_reserve_weight) > 0);
  const allocatedGoals = [...index.byFixturePlayer.values()]
    .reduce((total, player) => total + player.expectedEvents.goals, 0);
  const allocatedAssists = [...index.byFixturePlayer.values()]
    .reduce((total, player) => total + player.expectedEvents.assists, 0);
  assert.ok(allocatedGoals > 0 && allocatedGoals < 1.08);
  assert.ok(allocatedAssists > 0 && allocatedAssists < 1.08 * 0.8);
});

test("missing lower-league xG/xA cannot allocate the whole team attack to one sparse top-flight profile", () => {
  const history = (matches: number, input: { minutes: number; xg: number | null; xa: number | null; goals: number; assists: number }) =>
    calculateFriendWindowMetrics(Array.from({ length: matches }, (_, index) => ({
      matchId: BigInt(matches - index),
      minutes: input.minutes,
      goals: input.goals,
      assists: input.assists,
      xg: input.xg,
      xa: input.xa,
      recoveries: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0
    })));
  const rows = [
    {
      playerId: "sparse-top-flight",
      teamId: "promoted-team",
      position: "MID",
      isStarter: false,
      minutesPlayed: 150,
      rawMetrics: history(5, { minutes: 30, xg: 0.04, xa: 0.02, goals: 0, assists: 0 })
    },
    {
      playerId: "basic-only-scorer",
      teamId: "promoted-team",
      position: "FWD",
      isStarter: false,
      minutesPlayed: 900,
      rawMetrics: history(10, { minutes: 90, xg: null, xa: null, goals: 0.5, assists: 0.2 })
    }
  ] as never;
  const fixture = {
    id: "promoted-fixture", roundId: "round-1", teamId: "promoted-team", opponentTeamId: "opponent",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-08-01T12:00:00Z"), projectedXg: 1.2, projectedXga: 1,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    rows,
    { rounds: [], fixturesByTeamRound: new Map([["round-1", new Map([["promoted-team", [fixture]]])]]), teamShortNameById: new Map() },
    new Map([["sparse-top-flight", "MID"], ["basic-only-scorer", "FWD"]]),
    friendAltProjectionFormulaConfig
  );
  const sparseGoals = index.byFixturePlayer.get("promoted-fixture:sparse-top-flight")?.expectedEvents.goals ?? 0;
  const scorerGoals = index.byFixturePlayer.get("promoted-fixture:basic-only-scorer")?.expectedEvents.goals ?? 0;

  assert.ok(scorerGoals > sparseGoals);
  assert.ok(sparseGoals < 0.2);
  assert.ok(Math.abs(sparseGoals + scorerGoals - 1.2) < 1e-12);
});

test("an incomplete team history cannot give all team xG and xA to its only evidenced player", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: "{minutes}",
      appearanceProbability: "gte({Expected minutes}, 0.000001)",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "gte({Expected minutes}, 80)",
      xgRate: "{xg rate}",
      xaRate: "{xa rate}",
      recoveryRate: "0",
      saveRate: "0",
      yellowRate: "0",
      redRate: "0"
    },
    team: {
      expectedGoals: "1.6",
      expectedGoalsAgainst: "1",
      assistsPerGoal: "0.8",
      cleanSheetProbability: "0"
    }
  };
  const positions = ["GK", ...Array(4).fill("DEF"), ...Array(4).fill("MID"), ...Array(2).fill("FWD")];
  const rows = positions.map((position, index) => {
    const evidenced = index === 1;
    const minutes = evidenced ? 39 : 0;
    return {
      playerId: `player-${index}`,
      teamId: "sparse-team",
      position,
      isStarter: false,
      startProbability: evidenced ? 0.5 : 0,
      expectedMinutes: minutes,
      minutesPlayed: minutes,
      rawMetrics: {
        minutes,
        minutes_365: minutes,
        xg_rate: evidenced ? 0.02 : 0,
        xa_rate: evidenced ? 0.01 : 0
      }
    };
  });
  const fixture = {
    id: "sparse-team-fixture", roundId: "round-1", teamId: "sparse-team", opponentTeamId: "opponent",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-08-07T12:00:00Z"), projectedXg: 1.6, projectedXga: 1,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const fixtures = {
    rounds: [],
    fixturesByTeamRound: new Map([["round-1", new Map([["sparse-team", [fixture]]])]]),
    teamShortNameById: new Map()
  };
  const positionsByPlayer = new Map(rows.map((row) => [row.playerId, row.position]));
  const sparse = buildFormulaProjectionIndex(rows as never, fixtures, positionsByPlayer, config);
  const evidenced = sparse.byFixturePlayer.get("sparse-team-fixture:player-1");
  const sparseMetrics = sparse.formulaMetricsByFixturePlayer.get("sparse-team-fixture:player-1");

  assert.deepEqual(sparse.errorsByFixtureTeam, new Map());
  assert.equal(sparse.byFixturePlayer.size, 11);
  assert.equal(sparseMetrics?.sparse_team_attack_allocation_guard, 1);
  assert.equal(sparseMetrics?.team_attack_meaningful_players, 1);
  assert.ok(Number(sparseMetrics?.team_attack_goal_reserve_weight) > 1);
  assert.ok((evidenced?.expectedEvents.goals ?? Infinity) < 0.05);
  assert.ok((evidenced?.expectedEvents.assists ?? Infinity) < 0.03);
  assert.ok([...sparse.byFixturePlayer.values()].reduce((total, player) => total + player.expectedEvents.goals, 0) < 0.1);

  const completeRows = rows.map((row) => ({
    ...row,
    expectedMinutes: 90,
    minutesPlayed: 900,
    rawMetrics: { ...row.rawMetrics, minutes: 90, minutes_365: 900, xg_rate: 0.1, xa_rate: 0.08 }
  }));
  const complete = buildFormulaProjectionIndex(completeRows as never, fixtures, positionsByPlayer, config);
  const completeMetrics = complete.formulaMetricsByFixturePlayer.get("sparse-team-fixture:player-1");
  const completeGoals = [...complete.byFixturePlayer.values()]
    .reduce((total, player) => total + player.expectedEvents.goals, 0);

  assert.equal(completeMetrics?.sparse_team_attack_allocation_guard, 0);
  assert.equal(completeMetrics?.team_attack_goal_reserve_weight, 0);
  assert.ok(Math.abs(completeGoals - 1.6) < 1e-12);
});

test("a short history sample applies the starter uplift cautiously to per-90 events", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: "28",
      appearanceProbability: "1",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "0",
      xgRate: "1",
      xaRate: "1",
      recoveryRate: "1",
      saveRate: "1",
      yellowRate: "1",
      redRate: "0"
    },
    team: {
      expectedGoals: "1",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    }
  };
  const row = (playerId: string, historyMinutes: number, startProbability = 0) => ({
    playerId,
    teamId: "team-1",
    position: "FWD",
    isStarter: true,
    startProbability,
    expectedMinutes: 28,
    minutesPlayed: historyMinutes,
    rawMetrics: { minutes_365: historyMinutes }
  }) as never;
  const nearestFixture = {
    id: "fixture-nearest", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 1, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const laterFixture = { ...nearestFixture, id: "fixture-later", roundId: "round-2", kickoffAt: new Date("2026-08-01T12:00:00Z") };
  const fixtures = {
    rounds: [],
    fixturesByTeamRound: new Map([
      ["round-1", new Map([["team-1", [nearestFixture]]])],
      ["round-2", new Map([["team-1", [laterFixture]]])]
    ]),
    teamShortNameById: new Map()
  };

  for (const formulaConfig of [config, { ...config, ...friendAltProjectionFormulaConfig, history: config.history, team: config.team }]) {
    const shortSample = buildFormulaProjectionIndex(
      [row("short", 140)],
      fixtures,
      new Map([["short", "FWD"]]),
      formulaConfig
    );
    const expectedReliability = 140 / 450;
    const expectedEventMinutes = 28 + (60 - 28) * expectedReliability;
    const expectedRoleReliability = 28 / 60;
    const positionGoalPrior = positionEventPriorPer90("FWD", "goals");
    const expectedRoleAdjustedXg = positionGoalPrior + (1 - positionGoalPrior) * expectedRoleReliability;
    const nearestMetrics = shortSample.formulaMetricsByFixturePlayer.get("fixture-nearest:short");

    assert.equal(shortSample.byFixturePlayer.get("fixture-nearest:short")?.expectedMinutes, 60);
    assert.ok(Math.abs(Number(nearestMetrics?.per90_uplift_reliability) - expectedReliability) < 1e-12);
    assert.ok(Math.abs(Number(nearestMetrics?.event_exposure_minutes) - expectedEventMinutes) < 1e-12);
    assert.ok(Math.abs(Number(nearestMetrics?.starter_role_reliability) - expectedRoleReliability) < 1e-12);
    assert.ok(Math.abs(Number(nearestMetrics?.blended_xg_per_90) - expectedRoleAdjustedXg) < 1e-12);
    assert.ok(Math.abs((shortSample.byFixturePlayer.get("fixture-nearest:short")?.allocationWeights.goals ?? 0) - expectedRoleAdjustedXg * expectedEventMinutes / 90) < 1e-12);
    assert.ok(Math.abs((shortSample.byFixturePlayer.get("fixture-nearest:short")?.expectedEvents.yellowCards ?? 0) - expectedEventMinutes / 90) < 1e-12);
    assert.equal(shortSample.formulaMetricsByFixturePlayer.get("fixture-later:short")?.event_exposure_minutes, 28);
    assert.ok(Math.abs((shortSample.byFixturePlayer.get("fixture-later:short")?.allocationWeights.goals ?? 0) - 28 / 90) < 1e-12);
  }

  const stableSample = buildFormulaProjectionIndex(
    [row("stable", 450, 1)],
    fixtures,
    new Map([["stable", "FWD"]]),
    config
  );
  assert.equal(stableSample.formulaMetricsByFixturePlayer.get("fixture-nearest:stable")?.event_exposure_minutes, 60);
  assert.ok(Math.abs((stableSample.byFixturePlayer.get("fixture-nearest:stable")?.allocationWeights.goals ?? 0) - 2 / 3) < 1e-12);
});

test("a substitute-heavy history caps the manual starter uplift in every formula", () => {
  const baseExpectedMinutes = 17.48;
  const historicalStartProbability = 2 / 38;
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: String(baseExpectedMinutes),
      appearanceProbability: "1",
      sixtyProbability: "gte({Expected minutes}, 60)",
      fullMatchProbability: "0",
      xgRate: "1",
      xaRate: "1",
      recoveryRate: "1",
      saveRate: "1",
      yellowRate: "1",
      redRate: "0"
    },
    team: {
      expectedGoals: "1",
      expectedGoalsAgainst: "0",
      assistsPerGoal: "0",
      cleanSheetProbability: "0"
    }
  };
  const row = {
    playerId: "substitute-heavy",
    teamId: "team-1",
    position: "FWD",
    isStarter: true,
    startProbability: historicalStartProbability,
    expectedMinutes: baseExpectedMinutes,
    minutesPlayed: 573,
    rawMetrics: { minutes_365: 573 }
  } as never;
  const fixture = {
    id: "fixture-1", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 1, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const fixtures = {
    rounds: [],
    fixturesByTeamRound: new Map([["round-1", new Map([["team-1", [fixture]]])]]),
    teamShortNameById: new Map()
  };
  const expectedRoleReliability = baseExpectedMinutes / 60;
  const expectedEventMinutes = baseExpectedMinutes + (60 - baseExpectedMinutes) * expectedRoleReliability;
  const positionGoalPrior = positionEventPriorPer90("FWD", "goals");
  const expectedRoleAdjustedXg = positionGoalPrior + (1 - positionGoalPrior) * expectedRoleReliability;

  for (const formulaConfig of [config, { ...config, ...friendAltProjectionFormulaConfig, history: config.history, team: config.team }]) {
    const index = buildFormulaProjectionIndex(
      [row],
      fixtures,
      new Map([["substitute-heavy", "FWD"]]),
      formulaConfig
    );
    const metrics = index.formulaMetricsByFixturePlayer.get("fixture-1:substitute-heavy");

    assert.equal(index.byFixturePlayer.get("fixture-1:substitute-heavy")?.expectedMinutes, 60);
    assert.equal(metrics?.per90_sample_reliability, 1);
    assert.equal(metrics?.historical_start_probability, historicalStartProbability);
    assert.ok(Math.abs(Number(metrics?.starter_base_minute_reliability) - expectedRoleReliability) < 1e-12);
    assert.ok(Math.abs(Number(metrics?.starter_role_reliability) - expectedRoleReliability) < 1e-12);
    assert.ok(Math.abs(Number(metrics?.per90_uplift_reliability) - expectedRoleReliability) < 1e-12);
    assert.ok(Math.abs(Number(metrics?.event_exposure_minutes) - expectedEventMinutes) < 1e-12);
    assert.equal(metrics?.pre_role_xg_per_90, 1);
    assert.equal(metrics?.starter_role_position_xg_prior_per_90, positionGoalPrior);
    assert.ok(Math.abs(Number(metrics?.blended_xg_per_90) - expectedRoleAdjustedXg) < 1e-12);
    assert.ok(Math.abs((index.byFixturePlayer.get("fixture-1:substitute-heavy")?.expectedEvents.yellowCards ?? 0) - expectedEventMinutes / 90) < 1e-12);
  }
});

test("previous-club fallback applies a real penalty to per-90 forecast rates", () => {
  const config = {
    ...expectedProjectionFormulaConfig,
    history: {
      ...expectedProjectionFormulaConfig.history,
      expectedMinutes: "60",
      appearanceProbability: "1",
      sixtyProbability: "1",
      fullMatchProbability: "0",
      xgRate: "1",
      xaRate: "1",
      recoveryRate: "1",
      saveRate: "1",
      yellowRate: "1",
      redRate: "1"
    },
    team: { expectedGoals: "1", expectedGoalsAgainst: "0", assistsPerGoal: "0", cleanSheetProbability: "0" }
  };
  const fixture = {
    id: "fixture-1", roundId: "round-1", teamId: "team-1", opponentTeamId: "team-2",
    opponentName: "OPP", opponentFullName: "Opponent", side: "H" as const,
    kickoffAt: new Date("2026-07-25T12:00:00Z"), projectedXg: 1, projectedXga: 0,
    attackMultiplier: 1, defenseMultiplier: 1
  };
  const index = buildFormulaProjectionIndex(
    [{
      playerId: "transfer",
      teamId: "team-1",
      position: "FWD",
      isStarter: false,
      startProbability: 1,
      expectedMinutes: 60,
      minutesPlayed: 405,
      rawMetrics: { minutes_365: 405 },
      minuteHistoryProvenance: {
        source: "PREVIOUS_CLUB_FALLBACK",
        currentClubMatches: 0,
        previousClubMatches: 5,
        previousClubName: "Previous",
        previousClubPenaltyFactor: 0.9
      }
    } as never],
    { rounds: [], fixturesByTeamRound: new Map([["round-1", new Map([["team-1", [fixture]]])]]), teamShortNameById: new Map() },
    new Map([["transfer", "FWD"]]),
    config
  );
  const metrics = index.formulaMetricsByFixturePlayer.get("fixture-1:transfer");

  assert.equal(metrics?.transfer_rate_penalty, 0.9);
  assert.equal(metrics?.blended_xg_per_90, 0.9);
  assert.equal(metrics?.blended_xa_per_90, 0.9);
  assert.ok(Math.abs((index.byFixturePlayer.get("fixture-1:transfer")?.allocationWeights.goals ?? 0) - 0.6) < 1e-12);
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

test("friend Alt uses fixture components without bookmaker adjustment and includes goals-conceded penalties", () => {
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

  assert.equal(friendAlternativeProjectionFantasyPoints(projection, null, model), 3.37);
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
  assert.equal(fantasySquadRoundShift(["sports-ru:tour:2:2462"], ["sports-ru:tour:5:2466"]), 3);
  assert.equal(fantasySquadRoundShift(["fpl:event:8"], ["fpl:event:10"]), 2);
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

test("Sports.ru provider tour keeps 14 fixtures and eight double-fixture teams in one round", () => {
  const providerRoundId = fantasyProviderRoundKey("SPORTS_RU", 2, "2462");
  const pairs = [
    ...Array.from({ length: 10 }, (_, index) => [String(index * 2 + 1), String(index * 2 + 2)] as const),
    ["1", "3"], ["2", "4"], ["5", "7"], ["6", "8"]
  ];
  const matches = pairs.map(([homeTeamId, awayTeamId], index) => Object.assign(
    match({
      id: `sports-${index + 1}`,
      round: index < 10 ? "2" : "1",
      date: `2026-08-${String(25 + Math.floor(index / 7)).padStart(2, "0")}T17:00:00.000Z`,
      homeTeamId,
      awayTeamId
    }),
    {
      providerRoundId,
      providerRoundLabel: "2 тур",
      providerRoundOrdinal: 2
    }
  ));

  const result = buildPlannerRoundFixtures(matches, new Date("2026-08-20T00:00:00.000Z"));
  const doubleTeams = [...(result.fixturesByTeamRound.get(providerRoundId) ?? new Map())]
    .filter(([, fixtures]) => fixtures.length === 2)
    .map(([teamId]) => teamId)
    .sort((left, right) => Number(left) - Number(right));

  assert.deepEqual(result.rounds, [{
    id: providerRoundId,
    label: "2 тур",
    startsAt: "2026-08-25T17:00:00.000Z",
    fixtureCount: 14
  }]);
  assert.deepEqual(doubleTeams, ["1", "2", "3", "4", "5", "6", "7", "8"]);
});

test("squad planner retains completed fixtures in an active split round", () => {
  const completed = match({ id: "1", round: "12", date: "2026-05-21T17:00:00.000Z", homeTeamId: "10", awayTeamId: "20" });
  completed.finished = true;
  const result = buildPlannerRoundFixtures(
    [
      completed,
      match({ id: "2", round: "12", date: "2026-05-23T19:00:00.000Z", homeTeamId: "30", awayTeamId: "40" }),
      match({ id: "3", round: "13", date: "2026-05-30T17:00:00.000Z", homeTeamId: "10", awayTeamId: "30" })
    ],
    new Date("2026-05-22T00:00:00.000Z")
  );

  assert.equal(result.rounds[0]?.id, "round:12");
  assert.equal(result.rounds[0]?.fixtureCount, 2);
  assert.equal(result.fixturesByTeamRound.get("round:12")?.get("10")?.[0].id, "1");
});

test("bookmaker favorites select one available team per unfinished fixture by team over 1.5 probability", () => {
  const awayFavorite = Object.assign(
    match({ id: "1", round: "12", date: "2026-05-25T17:00:00.000Z", homeTeamId: "10", awayTeamId: "20" }),
    {
      homeOver15Probability: 0.48,
      awayOver15Probability: 0.62,
      homeCleanSheetProbability: 0.55,
      awayCleanSheetProbability: 0.32,
      oddsFetchedAt: new Date("2026-05-22T09:00:00.000Z")
    }
  );
  const homeFavorite = Object.assign(
    match({ id: "2", round: "12", date: "2026-05-25T19:00:00.000Z", homeTeamId: "30", awayTeamId: "40" }),
    {
      homeOver15Probability: 0.7,
      awayOver15Probability: 0.3,
      homeCleanSheetProbability: 0.2,
      awayCleanSheetProbability: 0.5,
      oddsFetchedAt: new Date("2026-05-22T10:00:00.000Z")
    }
  );
  const incomplete = Object.assign(
    match({ id: "3", round: "12", date: "2026-05-26T17:00:00.000Z", homeTeamId: "50", awayTeamId: "60" }),
    {
      homeOver15Probability: 0.8,
      awayOver15Probability: null,
      homeCleanSheetProbability: 0.6,
      awayCleanSheetProbability: null,
      oddsFetchedAt: new Date("2026-05-22T10:00:00.000Z")
    }
  );
  const completed = Object.assign(
    match({ id: "4", round: "12", date: "2026-05-21T17:00:00.000Z", homeTeamId: "70", awayTeamId: "80" }),
    {
      finished: true,
      homeOver15Probability: 0.9,
      awayOver15Probability: 0.1,
      homeCleanSheetProbability: 0.7,
      awayCleanSheetProbability: 0.1,
      oddsFetchedAt: new Date("2026-05-21T10:00:00.000Z")
    }
  );
  const fixtures = buildPlannerRoundFixtures(
    [awayFavorite, homeFavorite, incomplete, completed],
    new Date("2026-05-22T00:00:00.000Z")
  );

  const favorites = buildBookmakerFavorites(fixtures);

  assert.deepEqual(favorites.map((row) => [row.fixtureId, row.teamId, row.side]), [
    ["3", "50", "H"],
    ["2", "30", "H"],
    ["1", "20", "A"]
  ]);
  assert.deepEqual(
    favorites.map((row) => [row.teamOver15Probability, row.cleanSheetProbability]),
    [[0.8, 0.6], [0.7, 0.2], [0.62, 0.32]]
  );
  assert.equal(favorites[0].source, "FONBET");
  assert.equal(favorites[0].oddsFetchedAt, "2026-05-22T10:00:00.000Z");
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

test("squad planner uses Sports.ru teams for stale and missing FotMob roster transfers", () => {
  const league = {
    leagueId: 57n,
    season: "2026/2027",
    name: "Eredivisie",
    country: "Netherlands"
  };
  const groningen = { id: 8674n, name: "FC Groningen" };
  const overrides = sportsRuAuthoritativeRosterOverrides(
    [
      {
        id: "pelle-price",
        leagueId: 57n,
        season: "2026/2027",
        teamId: 8674n,
        playerId: 637741n,
        position: "MID",
        lastSeenAt: new Date("2026-08-02T00:00:00Z"),
        player: { id: 637741n, name: "Pelle Clement", country: "Netherlands" },
        team: groningen
      },
      {
        id: "hernes-price",
        leagueId: 57n,
        season: "2026/2027",
        teamId: 8674n,
        playerId: 1400979n,
        position: "MID",
        lastSeenAt: new Date("2026-08-02T00:00:00Z"),
        player: { id: 1400979n, name: "Travis Hernes", country: "Norway" },
        team: groningen
      }
    ],
    [
      { providerEntityId: "pelle-price", internalEntityId: "637741" },
      { providerEntityId: "hernes-price", internalEntityId: "1400979" }
    ],
    league
  );
  const effective = applySportsRuRosterOverrides(
    [{
      leagueId: 57n,
      season: "2026/2027",
      teamId: 8614n,
      playerId: 637741n,
      position: "CDM,CM",
      age: 30,
      nationality: "Netherlands",
      photoUrl: "/pelle.png",
      isStarter: true,
      player: { name: "Pelle Clement" },
      team: { name: "Sparta Rotterdam" }
    }],
    overrides
  );

  assert.deepEqual(effective.map((row) => [row.player.name, row.team.name, String(row.teamId)]).sort(), [
    ["Pelle Clement", "FC Groningen", "8674"],
    ["Travis Hernes", "FC Groningen", "8674"]
  ]);
  assert.equal(effective.find((row) => row.playerId === 637741n)?.isStarter, true);
  assert.equal(effective.find((row) => row.playerId === 1400979n)?.isStarter, false);
});

test("squad planner does not create an authoritative roster row from an unverified price foreign key", () => {
  const overrides = sportsRuAuthoritativeRosterOverrides(
    [{
      id: "unverified-price",
      leagueId: 57n,
      season: "2026/2027",
      teamId: 10229n,
      playerId: 1352213n,
      position: "MID",
      lastSeenAt: new Date("2026-08-02T00:00:00Z"),
      player: { id: 1352213n, name: "Ro-Zangelo Daal", country: "Netherlands" },
      team: { id: 10229n, name: "AZ Alkmaar" }
    }],
    [],
    {
      leagueId: 57n,
      season: "2026/2027",
      name: "Eredivisie",
      country: "Netherlands"
    }
  );

  assert.deepEqual(overrides, []);
});

test("squad save validation lets Sports.ru override or supply the locked roster team", () => {
  const roster = authoritativeFantasyRosterByPlayerId(
    [{ playerId: 637741n, teamId: 8614n, position: "CDM,CM" }],
    [
      { playerId: 637741n, teamId: 8674n, position: "MID" },
      { playerId: 1400979n, teamId: 8674n, position: "MID" }
    ]
  );

  assert.equal(roster.get("637741")?.teamId, 8674n);
  assert.equal(roster.get("1400979")?.teamId, 8674n);
  assert.equal(roster.size, 2);
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
    foontasyForecast: { findMany: async () => [] },
    fantasyModelForecast: { findMany: async () => [] },
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
      },
      createMany: async () => ({ count: 0 })
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
      },
      createMany: async () => ({ count: 0 })
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

test("full-match minute threshold starts at 80 minutes", () => {
  assert.equal(countsAsFullFantasyMatch(79.999), false);
  assert.equal(countsAsFullFantasyMatch(80), true);
  assert.equal(countsAsFullFantasyMatch(90), true);
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

test("fixture strength blends bookmaker attack and clean-sheet expectations into its multipliers", () => {
  const model = {
    projectedXg: 1,
    projectedXga: 1.5,
    attackBase: 1.4,
    defenseBase: 1.4
  };
  const withoutOdds = fixtureStrengthWithBookmaker(model, { teamOver15Probability: null, cleanSheetProbability: null });
  const marketFavorsTeam = fixtureStrengthWithBookmaker(model, {
    teamOver15Probability: 0.594,
    cleanSheetProbability: Math.exp(-0.6)
  });

  assert.equal(withoutOdds.marketProjectedXg, model.projectedXg);
  assert.equal(withoutOdds.marketProjectedXga, model.projectedXga);
  assert.ok((marketFavorsTeam.attackMultiplier ?? 0) > (withoutOdds.attackMultiplier ?? 0));
  assert.ok((marketFavorsTeam.defenseMultiplier ?? 0) > (withoutOdds.defenseMultiplier ?? 0));
});

test("fixture difficulty keeps easy fixtures green-side and hard fixtures red-side", () => {
  assert.equal(fixtureDifficultyFromMultipliers({ attackMultiplier: 1.25, defenseMultiplier: 1.25, side: "A" }, "MID"), 1);
  assert.equal(fixtureDifficultyFromMultipliers({ attackMultiplier: 0.75, defenseMultiplier: 0.75, side: "H" }, "MID"), 5);
});

test("fixture multipliers use overall league xG and xGA averages without a second venue adjustment", () => {
  const profiles = buildTeamStrengthProfilesFromMatches([
    strengthMatch("10", "20", 1.7, 1.1),
    strengthMatch("30", "40", 1.5, 0.9)
  ]);
  const home = fixtureStrengthProjection(
    { teamId: "average-home", opponentTeamId: "average-away", side: "H" },
    profiles
  );
  const away = fixtureStrengthProjection(
    { teamId: "average-away", opponentTeamId: "average-home", side: "A" },
    profiles
  );
  const leagueXg = profiles.league.overall.xgForPerMatch ?? 0;
  const leagueXga = profiles.league.overall.xgAgainstPerMatch ?? 0;

  assert.ok(Math.abs((home.attackMultiplier ?? 0) - Math.min(1.28, home.projectedXg / leagueXg)) < 1e-12);
  assert.ok(Math.abs((home.defenseMultiplier ?? 0) - Math.min(1.28, leagueXga / home.projectedXga)) < 1e-12);
  assert.ok((home.attackMultiplier ?? 0) > (away.attackMultiplier ?? 0));
  assert.ok((home.defenseMultiplier ?? 0) > (away.defenseMultiplier ?? 0));
  assert.ok(
    (fixtureDifficultyFromMultipliers({ ...home, side: "H" }, "MID") ?? 0)
      < (fixtureDifficultyFromMultipliers({ ...away, side: "A" }, "MID") ?? 0)
  );
});

test("forward fixture difficulty ignores clean-sheet strength just like the forward forecast multiplier", () => {
  const poorDefense = fixtureDifficultyFromMultipliers(
    { attackMultiplier: 1, defenseMultiplier: 0.72, side: "H" },
    "FWD"
  );
  const strongDefense = fixtureDifficultyFromMultipliers(
    { attackMultiplier: 1, defenseMultiplier: 1.28, side: "A" },
    "FWD"
  );

  assert.equal(poorDefense, strongDefense);
});

test("double-round difficulty averages both fixtures instead of keeping only the hardest one", () => {
  const fixture = (id: string, multiplier: number) => ({
    id,
    roundId: "round-1",
    teamId: "10",
    opponentTeamId: "20",
    opponentName: "Opponent",
    opponentFullName: "Opponent",
    side: "H" as const,
    kickoffAt: null,
    projectedXg: 1,
    projectedXga: 1,
    attackMultiplier: multiplier,
    defenseMultiplier: multiplier
  });

  assert.equal(aggregateRoundDifficulty([fixture("easy", 1.25), fixture("hard", 0.75)], "MID"), 3);
});

test("bookmaker snapshots remain usable across the month-long fixture horizon and then expire", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");

  assert.equal(fixtureOddsAreFresh(new Date("2026-08-04T12:00:00.000Z"), now), true);
  assert.equal(fixtureOddsAreFresh(new Date("2026-08-03T12:00:00.000Z"), now), true);
  assert.equal(fixtureOddsAreFresh(new Date("2026-08-03T11:59:59.999Z"), now), false);
  assert.equal(fixtureOddsAreFresh(new Date("2026-09-07T12:00:00.001Z"), now), false);
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

test("an average FNL newcomer is discounted to 81 percent of RPL strength", () => {
  const topLeague = buildTeamStrengthProfilesFromMatches([
    strengthMatch("10", "20", 1.5, 1.5),
    strengthMatch("20", "10", 1.5, 1.5)
  ]);
  const feederLeague = buildTeamStrengthProfilesFromMatches([
    strengthMatch("30", "40", 1.2, 1.2),
    strengthMatch("40", "30", 1.2, 1.2)
  ]);
  const promoted = addPromotedTeamStrengthProfiles(topLeague, feederLeague).byTeamId.get("30")?.overall;

  assert.ok(promoted);
  assert.ok(Math.abs((promoted.xgForPerMatch ?? 0) - 1.5 * 0.81) < 1e-12);
  assert.ok(Math.abs((promoted.xgAgainstPerMatch ?? 0) - 1.5 / 0.81) < 1e-12);
});

test("promoted teams fall back to lower-league goals when xG is unavailable", () => {
  const matches = [
    {
      homeTeamId: "30",
      awayTeamId: "40",
      teamStats: [
        { teamId: "30", isHome: true, xg: null, goals: 2 },
        { teamId: "40", isHome: false, xg: null, goals: 0 }
      ]
    }
  ];

  const withoutFallback = buildTeamStrengthProfilesFromMatches(matches);
  const withFallback = buildTeamStrengthProfilesFromMatches(matches, { fallbackToGoals: true });

  assert.equal(withoutFallback.byTeamId.get("30")?.overall.xgForPerMatch, null);
  assert.ok((withFallback.byTeamId.get("30")?.overall.xgForPerMatch ?? 0) > 0);
  assert.ok((withFallback.byTeamId.get("40")?.overall.xgAgainstPerMatch ?? 0) > 0);
});

test("team strength fills missing team-stat goals from the official score", () => {
  const match = fillTeamStrengthStatsFromScore({
    homeTeamId: "30",
    awayTeamId: "40",
    homeScore: 2,
    awayScore: 1,
    teamStats: [{ teamId: "30", opponentTeamId: "40", isHome: true, xg: null, goals: null }]
  });

  assert.deepEqual(match.teamStats.map((row) => [row.teamId, row.goals]), [["30", 2], ["40", 1]]);
  const profiles = buildTeamStrengthProfilesFromMatches([match], { fallbackToGoals: true });
  assert.ok((profiles.byTeamId.get("30")?.overall.xgForPerMatch ?? 0) > 0);
  assert.ok((profiles.byTeamId.get("40")?.overall.xgAgainstPerMatch ?? 0) > 0);
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
