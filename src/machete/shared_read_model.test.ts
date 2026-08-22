import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { ActiveScoringModel } from "@/lib/scoring";
import { applySharedRosterOverrides, calculateFriendWindowMetrics, createSharedMacheteReadContext, loadSharedLeagueOptions, loadSharedLeagueSeason, loadSharedLeagueTeams, loadSharedMachetePlayerRows, loadSharedMatchWindowSummary, loadSharedTeamMatchIds } from "./shared_read_model";

const scoringModel: ActiveScoringModel = {
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

test("shared projections move history inputs to the Sports.ru authoritative team", () => {
  const effective = applySharedRosterOverrides(
    [{
      leagueId: 57n,
      season: "2026/2027",
      teamId: 8614n,
      playerId: 637741n,
      position: "CDM,CM",
      age: 30,
      nationality: "Netherlands",
      photoUrl: null,
      isStarter: true,
      player: { name: "Pelle Clement", country: "Netherlands" },
      team: { name: "Sparta Rotterdam" },
      seasonTeam: {
        metadata: { short_name: "Sparta" },
        leagueSeason: {
          name: "Eredivisie",
          country: "Netherlands",
          league: { name: "Eredivisie", country: "Netherlands" }
        }
      }
    }],
    [{
      leagueId: 57n,
      season: "2026/2027",
      teamId: 8674n,
      playerId: 637741n,
      position: "MID",
      playerName: "Pelle Clement",
      playerCountry: "Netherlands",
      teamName: "FC Groningen",
      leagueName: "Eredivisie",
      leagueCountry: "Netherlands"
    }]
  );

  assert.equal(effective.length, 1);
  assert.equal(effective[0].teamId, 8674n);
  assert.equal(effective[0].team.name, "FC Groningen");
  assert.equal(effective[0].position, "MID");
  assert.equal(effective[0].isStarter, true);
});

test("shared league options collapse seasons and prefer the default season per league", async () => {
  const prisma = {
    leagueSeason: {
      async findMany() {
        return [
          leagueSeasonRow(47n, "2024/2025", true, "2025-05-01T00:00:00.000Z", "Premier League", "England"),
          leagueSeasonRow(47n, "2025/2026", true, "2025-01-01T00:00:00.000Z", "Premier League", "England"),
          leagueSeasonRow(87n, "2023/2024", false, "2024-06-01T00:00:00.000Z", "LaLiga", "Spain"),
          leagueSeasonRow(87n, "2022/2023", false, "2024-07-01T00:00:00.000Z", "LaLiga", "Spain")
        ];
      }
    }
  } as unknown as PrismaClient;

  const leagues = await loadSharedLeagueOptions(prisma);

  assert.equal(leagues.filter((league) => league.leagueId === 47n).length, 1);
  assert.equal(leagues.find((league) => league.leagueId === 47n)?.season, "2025/2026");
  assert.equal(leagues.find((league) => league.leagueId === 87n)?.season, "2023/2024");
});

test("shared league season falls back to the league default when requested season is absent", async () => {
  const prisma = {
    leagueSeason: {
      async findMany() {
        return [
          leagueSeasonRow(47n, "2023/2024", false, "2024-05-01T00:00:00.000Z", "Premier League", "England"),
          leagueSeasonRow(47n, "2024/2025", true, "2025-05-01T00:00:00.000Z", "Premier League", "England")
        ];
      }
    }
  } as unknown as PrismaClient;

  const league = await loadSharedLeagueSeason(prisma, "47", "1999/2000");

  assert.equal(league?.leagueId, 47n);
  assert.equal(league?.season, "2024/2025");
});

test("shared team options expose the FotMob short name from season metadata", async () => {
  const prisma = {
    leagueSeasonTeam: {
      async findMany() {
        return [
          {
            metadata: { short_name: "Man United", logo_url: null },
            team: {
              id: 10n,
              name: "Manchester United",
              country: "England",
              rawRef: "10260"
            }
          }
        ];
      }
    }
  } as unknown as PrismaClient;

  const teams = await loadSharedLeagueTeams(prisma, 47n, "2026/2027");

  assert.equal(teams[0].name, "Manchester United");
  assert.equal(teams[0].shortName, "Man United");
});

test("shared team match ids load all finished matches across seasons", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreMatch: {
      async findMany(input: unknown) {
        calls.push(input);
        return [{ id: 201n, matchDate: new Date("2025-05-25T16:00:00.000Z") }];
      }
    }
  } as unknown as PrismaClient;

  const ids = await loadSharedTeamMatchIds(prisma, 47n, "2024/2025", 10n, { kind: "all" });

  assert.deepEqual(ids, [201n]);
  const call = calls[0] as { where?: { leagueId?: bigint; season?: string } };
  assert.equal(call.where?.leagueId, 47n);
  assert.equal(call.where?.season, undefined);
  assert.equal((call.where as { playerStats?: unknown }).playerStats, undefined);
  assert.equal((call as { take?: number }).take, undefined);
});

test("shared team match ids take the last N finished matches across seasons", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreMatch: {
      async findMany(input: unknown) {
        calls.push(input);
        return [
          { id: 301n, matchDate: new Date("2025-08-16T16:00:00.000Z") },
          { id: 201n, matchDate: new Date("2025-05-25T16:00:00.000Z") }
        ];
      }
    }
  } as unknown as PrismaClient;

  const ids = await loadSharedTeamMatchIds(prisma, 47n, "2025/2026", 10n, { kind: "last", matches: 10 });

  assert.deepEqual(ids, [301n, 201n]);
  const call = calls[0] as { where?: { leagueId?: bigint; season?: string }; take?: number };
  assert.equal(call.where?.leagueId, 47n);
  assert.equal(call.where?.season, undefined);
  assert.equal(call.take, 10);
});

test("shared team season windows remain scoped to current or previous season", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreMatch: {
      async findMany(input: unknown) {
        calls.push(input);
        return [];
      }
    }
  } as unknown as PrismaClient;

  await loadSharedTeamMatchIds(prisma, 47n, "2025/2026", 10n, { kind: "season", offset: 0 });
  await loadSharedTeamMatchIds(prisma, 47n, "2025/2026", 10n, { kind: "season", offset: -1 });

  assert.equal((calls[0] as { where?: { season?: string } }).where?.season, "2025/2026");
  assert.equal((calls[1] as { where?: { season?: string } }).where?.season, "2024/2025");
});

test("shared team day windows apply a rolling date cutoff", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreMatch: {
      async findMany(input: unknown) {
        calls.push(input);
        return [];
      }
    }
  } as unknown as PrismaClient;

  const before = Date.now();
  await loadSharedTeamMatchIds(prisma, 47n, "2025/2026", 10n, { kind: "days", days: 365 });
  const after = Date.now();

  const call = calls[0] as { where?: { season?: string; matchDate?: { gte?: Date } }; take?: number };
  const cutoff = call.where?.matchDate?.gte?.getTime() ?? 0;
  assert.equal(call.where?.season, undefined);
  assert.equal(call.take, undefined);
  assert.ok(cutoff >= before - 365 * 24 * 60 * 60 * 1000);
  assert.ok(cutoff <= after - 365 * 24 * 60 * 60 * 1000);
});

test("friend window metrics renormalize reduced sample weights without rounding", () => {
  const stats = Array.from({ length: 7 }, (_, index) => ({
    matchId: BigInt(7 - index),
    minutes: 90,
    xg: index < 5 ? 1 : 0,
    xa: 0,
    recoveries: 0,
    saves: 0,
    yellowCards: index === 6 ? 1 : 0,
    redCards: 0
  }));

  const metrics = calculateFriendWindowMetrics(stats);
  const annualRate = 5 / 7;
  const expectedXg = (0.4 * annualRate + 0.35 * 0.7 * annualRate + 0.25) / (0.4 + 0.35 * 0.7 + 0.25);

  assert.ok(Math.abs(metrics.friend_xg_per_90 - expectedXg) < 1e-12);
  assert.equal(metrics.friend_yellow_cards_per_90, 1 / 7);
});

test("friend window metrics use actual goals and assists only where FotMob xG/xA is missing", () => {
  const metrics = calculateFriendWindowMetrics([
    {
      matchId: 2n,
      minutes: 90,
      goals: 2,
      assists: 1,
      xg: null,
      xa: null,
      recoveries: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0
    },
    {
      matchId: 1n,
      minutes: 90,
      goals: 1,
      assists: 1,
      xg: 0,
      xa: 0,
      recoveries: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0
    }
  ]);

  assert.equal(metrics.xg_per_90_365, 1);
  assert.equal(metrics.xa_per_90_365, 0.5);
  assert.equal(metrics.xg_expected_matches_365, 1);
  assert.equal(metrics.xa_expected_matches_365, 1);
  assert.equal(metrics.xg_actual_fallback_events_365, 2);
  assert.equal(metrics.xa_actual_fallback_events_365, 1);
});

test("friend actual-event fallback preserves the previous-club rate penalty denominator", () => {
  const metrics = calculateFriendWindowMetrics([{
    matchId: 1n,
    minutes: 81,
    goals: 1,
    assists: 1,
    xg: null,
    xa: null,
    recoveries: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    transferHistoryPenaltyFactor: 0.9
  }]);

  assert.equal(metrics.xg_per_90_365, 1);
  assert.equal(metrics.xa_per_90_365, 1);
});

test("friend window metrics expose stable raw primitives for every rolling window", () => {
  const stats = Array.from({ length: 12 }, (_, index) => ({
    matchId: BigInt(12 - index),
    minutes: index === 0 ? 90 : index === 1 ? 60 : index === 2 ? 0 : 30,
    xg: index + 1,
    xa: (index + 1) / 2,
    recoveries: index + 2,
    saves: index,
    yellowCards: index % 2,
    redCards: index === 0 ? 1 : 0
  }));

  const metrics = calculateFriendWindowMetrics(stats);

  assert.equal(metrics.matches_l1, 1);
  assert.equal(metrics.minutes_l1, 90);
  assert.equal(metrics.minutes_per_match_l1, 90);
  assert.equal(metrics.appearance_rate_l1, 1);
  assert.equal(metrics.sixty_rate_l1, 1);
  assert.equal(metrics.full_match_rate_l1, 1);
  assert.equal(metrics.xg_per_90_l1, 1);
  assert.equal(metrics.xa_per_90_l1, 0.5);
  assert.equal(metrics.recoveries_per_90_l1, 2);
  assert.equal(metrics.saves_per_90_l1, 0);
  assert.equal(metrics.yellow_cards_per_90_l1, 0);
  assert.equal(metrics.red_cards_per_90_l1, 1);
  assert.equal(metrics.has_data_l1, 1);

  assert.equal(metrics.matches_l5, 5);
  assert.equal(metrics.minutes_l5, 210);
  assert.equal(metrics.minutes_per_match_l5, 42);
  assert.equal(metrics.appearance_rate_l5, 0.8);
  assert.equal(metrics.sixty_rate_l5, 0.4);
  assert.equal(metrics.full_match_rate_l5, 0.2);
  assert.equal(metrics.xg_per_90_l5, 15 * 90 / 210);

  assert.equal(metrics.matches_l10, 10);
  assert.equal(metrics.matches_365, 12);
  assert.equal(metrics.minutes_365, 420);
  assert.equal(metrics.has_data_l10, 1);
  assert.equal(metrics.has_data_365, 1);
});

test("friend window primitive metrics use zeroes and an explicit no-data flag", () => {
  const metrics = calculateFriendWindowMetrics([]);

  for (const suffix of ["l1", "l5", "l10", "365"] as const) {
    assert.equal(metrics[`matches_${suffix}`], 0);
    assert.equal(metrics[`minutes_${suffix}`], 0);
    assert.equal(metrics[`minutes_per_match_${suffix}`], 0);
    assert.equal(metrics[`appearance_rate_${suffix}`], 0);
    assert.equal(metrics[`sixty_rate_${suffix}`], 0);
    assert.equal(metrics[`full_match_rate_${suffix}`], 0);
    assert.equal(metrics[`xg_per_90_${suffix}`], 0);
    assert.equal(metrics[`xa_per_90_${suffix}`], 0);
    assert.equal(metrics[`recoveries_per_90_${suffix}`], 0);
    assert.equal(metrics[`saves_per_90_${suffix}`], 0);
    assert.equal(metrics[`yellow_cards_per_90_${suffix}`], 0);
    assert.equal(metrics[`red_cards_per_90_${suffix}`], 0);
    assert.equal(metrics[`has_data_${suffix}`], 0);
  }
});

test("friend expected minutes uses the maximum minutes per match across rolling windows", () => {
  const stats = Array.from({ length: 10 }, (_, index) => ({
    matchId: BigInt(10 - index),
    minutes: index === 0 ? 90 : 10,
    xg: 0,
    xa: 0,
    recoveries: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0
  }));

  const metrics = calculateFriendWindowMetrics(stats);

  assert.equal(metrics.friend_expected_minutes, 90);
});

test("combined player rows aggregate all selected team scope matches even when roster exists only in one season", async () => {
  const coreMatchCalls: unknown[] = [];
  const statCalls: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          {
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 99n,
            position: "GK",
            age: 33,
            nationality: "Argentina",
            player: { name: "Emiliano Martinez", country: "Argentina" },
            team: { name: "Aston Villa" },
            seasonTeam: {
              leagueSeason: {
                name: "Premier League",
                country: "England",
                league: {
                  name: "Premier League",
                  country: "England"
                }
              }
            }
          }
        ];
      }
    },
    coreMatch: {
      async findMany(input: unknown) {
        coreMatchCalls.push(input);
        return [
          { id: 201n, matchDate: new Date("2025-04-01T16:00:00.000Z") },
          { id: 102n, matchDate: new Date("2024-04-08T16:00:00.000Z") },
          { id: 101n, matchDate: new Date("2024-04-01T16:00:00.000Z") }
        ];
      }
    },
    matchPlayerStat: {
      async findMany(input: unknown) {
        statCalls.push(input);
        return [playerStat(101n, 90), playerStat(102n, 90), playerStat(201n, 45)];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [
      { leagueId: 47n, season: "2023/2024", teamId: 10n },
      { leagueId: 47n, season: "2024/2025", teamId: 10n }
    ],
    matchWindow: { kind: "all" },
    combineTeamCompetitions: true,
    scoringModel
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchesPlayed, 3);
  assert.equal(rows[0].minutesPlayed, 225);
  assert.equal(coreMatchCalls.length, 1);
  assert.equal((coreMatchCalls[0] as { where?: { season?: string } }).where?.season, undefined);
  const statCall = statCalls[0] as {
    where?: {
      matchId?: { in?: bigint[] };
      teamId?: { in?: bigint[] };
      playerId?: { in?: bigint[] };
    };
  };
  assert.deepEqual(statCall.where?.matchId?.in, [201n, 102n, 101n]);
  assert.deepEqual(statCall.where?.teamId?.in, [10n]);
  assert.deepEqual(statCall.where?.playerId?.in, [99n]);
});

test("combined last match window is applied across selected competitions without hiding statless fixtures", async () => {
  const coreMatchCalls: unknown[] = [];
  const statCalls: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          {
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 99n,
            position: "GK",
            age: 33,
            nationality: "Argentina",
            player: { name: "Emiliano Martinez", country: "Argentina" },
            team: { name: "Aston Villa" },
            seasonTeam: {
              leagueSeason: {
                name: "Premier League",
                country: "England",
                league: {
                  name: "Premier League",
                  country: "England"
                }
              }
            }
          }
        ];
      }
    },
    coreMatch: {
      async findMany(input: unknown) {
        coreMatchCalls.push(input);
        return [
          { id: 203n, matchDate: new Date("2025-05-15T16:00:00.000Z") },
          { id: 202n, matchDate: new Date("2025-05-08T16:00:00.000Z") },
          { id: 201n, matchDate: new Date("2025-05-01T16:00:00.000Z") },
          { id: 102n, matchDate: new Date("2024-05-08T16:00:00.000Z") },
          { id: 101n, matchDate: new Date("2024-05-01T16:00:00.000Z") }
        ];
      }
    },
    matchPlayerStat: {
      async findMany(input: unknown) {
        statCalls.push(input);
        return [playerStat(102n, 90), playerStat(201n, 90), playerStat(202n, 90)];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [
      { leagueId: 47n, season: "2023/2024", teamId: 10n },
      { leagueId: 47n, season: "2024/2025", teamId: 10n }
    ],
    matchWindow: { kind: "last", matches: 3 },
    combineTeamCompetitions: true,
    scoringModel
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchesPlayed, 2);
  assert.equal(rows[0].minutesPlayed, 180);
  assert.equal(coreMatchCalls.length, 1);
  assert.equal((coreMatchCalls[0] as { take?: number }).take, 10);
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { season?: string } }).where?.season === undefined), true);
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { playerStats?: unknown } }).where?.playerStats === undefined), true);
  const statCall = statCalls[0] as { where?: { matchId?: { in?: bigint[] } } };
  assert.deepEqual(statCall.where?.matchId?.in, [203n, 202n, 201n, 102n, 101n]);
});

test("club-minute history counts every recent club match instead of only the player's appearances", async () => {
  const matches = Array.from({ length: 5 }, (_, index) => ({
    id: BigInt(201 + index),
    matchDate: new Date(`2026-05-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`),
    season: "2025/2026",
    homeTeamId: 10n,
    awayTeamId: 20n
  }));
  const appearance = playerStat(205n, 90);
  const prisma = {
    teamPlayerSeason: {
      async findMany(input: { select?: { seasonTeam?: unknown } }) {
        if (input.select?.seasonTeam) {
          return [{
            playerId: 99n,
            teamId: 10n,
            team: { name: "Current FC", country: "England" },
            seasonTeam: { leagueSeason: { league: { name: "Premier League", country: "England" } } }
          }];
        }
        return [rosterRow({
          leagueId: 47n,
          season: "2025/2026",
          teamId: 10n,
          playerId: 99n,
          position: "Midfielder",
          playerName: "Rare Starter"
        })];
      }
    },
    coreMatch: {
      async findMany(input: { select?: { homeTeamId?: unknown } }) {
        return input.select?.homeTeamId
          ? matches
          : matches.map(({ homeTeamId: _homeTeamId, awayTeamId: _awayTeamId, ...match }) => match);
      }
    },
    matchPlayerStat: {
      async findMany(input: { include?: { match?: unknown } }) {
        return input.include?.match
          ? [{ ...appearance, match: { matchDate: matches[4].matchDate, status: "FINISHED" } }]
          : [appearance];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    combineTeamCompetitions: true,
    fallbackToRecentClubHistory: true,
    scoringModel
  });

  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].minutesPlayed, 90);
  assert.equal(rows[0].expectedMinutes, 18);
  assert.equal(rows[0].startProbability, 0.2);
  assert.equal(rows[0].rawMetrics?.appearance_probability, 0.2);
  assert.deepEqual(rows[0].minuteHistoryProvenance, {
    source: "CURRENT_CLUB",
    currentClubMatches: 5,
    previousClubMatches: 0,
    previousClubName: null,
    previousClubPenaltyFactor: 0.9
  });
});

test("a new player uses the previous club's recent match calendar including matches he missed", async () => {
  const previousMatches = Array.from({ length: 5 }, (_, index) => ({
    id: BigInt(301 + index),
    matchDate: new Date(`2026-05-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`),
    season: "2025/2026",
    homeTeamId: 5n,
    awayTeamId: 20n
  }));
  const previousAppearance = {
    ...playerStat(305n, 90),
    teamId: 5n,
    position: "Midfielder"
  };
  const prisma = {
    teamPlayerSeason: {
      async findMany(input: { select?: { seasonTeam?: unknown } }) {
        if (input.select?.seasonTeam) {
          return [{
            playerId: 99n,
            teamId: 5n,
            team: { name: "Previous FC", country: "Netherlands" },
            seasonTeam: { leagueSeason: { league: { name: "Eerste Divisie", country: "Netherlands" } } }
          }];
        }
        return [rosterRow({
          leagueId: 57n,
          season: "2026/2027",
          teamId: 10n,
          playerId: 99n,
          position: "Midfielder",
          playerName: "Transferred Substitute"
        })];
      }
    },
    coreMatch: {
      async findMany(input: { select?: { homeTeamId?: unknown } }) {
        return input.select?.homeTeamId ? previousMatches : [];
      }
    },
    matchPlayerStat: {
      async findMany(input: { include?: { match?: unknown } }) {
        return input.include?.match
          ? [{ ...previousAppearance, match: { matchDate: previousMatches[4].matchDate, status: "FINISHED" } }]
          : [];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 57n, season: "2026/2027", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    fallbackToRecentClubHistory: true,
    scoringModel
  });

  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].minutesPlayed, 81);
  assert.equal(rows[0].expectedMinutes, 16.2);
  assert.equal(rows[0].startProbability, 0.2);
  assert.deepEqual(rows[0].minuteHistoryProvenance, {
    source: "PREVIOUS_CLUB_FALLBACK",
    currentClubMatches: 0,
    previousClubMatches: 5,
    previousClubName: "Previous FC",
    previousClubPenaltyFactor: 0.9
  });
});

test("shared player rows normalize FotMob positions before applying the position filter", async () => {
  const rosterCalls: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async findMany(input: unknown) {
        rosterCalls.push(input);
        return [
          rosterRow({
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 99n,
            position: "CB",
            playerName: "Nikita Chernov"
          }),
          rosterRow({
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 100n,
            position: "CM",
            playerName: "Central Midfielder"
          }),
          rosterRow({
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 101n,
            position: "ST",
            playerName: "Centre Forward"
          })
        ];
      }
    },
    coreMatch: {
      async findMany() {
        return [];
      }
    },
    matchPlayerStat: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;

  const cases = [
    ["DEF", "47:2024/2025:10:99", "CB"],
    ["MID", "47:2024/2025:10:100", "CM"],
    ["FWD", "47:2024/2025:10:101", "ST"]
  ] as const;
  for (const [position, expectedId, expectedPosition] of cases) {
    const rows = await loadSharedMachetePlayerRows(prisma, {
      scopes: [{ leagueId: 47n, season: "2024/2025", teamId: 10n }],
      position,
      playerIds: [99n, 100n, 101n],
      matchWindow: { kind: "all" },
      scoringModel
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, expectedId);
    assert.equal(rows[0].position, expectedPosition);
    assert.equal(rows[0].teamShortName, "Villa");
    assert.equal(rows[0].matchesPlayed, 0);
    assert.equal(rows[0].minutesPlayed, 0);
  }

  assert.equal(rosterCalls.length, 3);
  for (const rosterCallValue of rosterCalls) {
    const rosterCall = rosterCallValue as {
      where?: {
        AND?: Array<{
          OR?: Array<{ position?: unknown }>;
          playerId?: { in?: bigint[] };
        }>;
      };
    };
    const clauses = rosterCall.where?.AND ?? [];
    assert.equal(clauses.some((clause) => clause.OR?.some((item) => item.position)), false);
    assert.deepEqual(clauses[1]?.playerId?.in, [99n, 100n, 101n]);
  }
});

test("shared player rows calculate visible FotMob rating over 10 matches without widening other metrics", async () => {
  const matches = Array.from({ length: 10 }, (_, index) => ({
    id: BigInt(110 - index),
    matchDate: new Date(`2026-05-${String(20 - index).padStart(2, "0")}T16:00:00.000Z`)
  }));
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          rosterRow({
            leagueId: 47n,
            season: "2025/2026",
            teamId: 10n,
            playerId: 99n,
            position: "CB",
            playerName: "Ten Match Rating"
          })
        ];
      }
    },
    coreMatch: {
      async findMany(input: { take?: number }) {
        return matches.slice(0, input.take ?? matches.length);
      }
    },
    matchPlayerStat: {
      async findMany(input: { where?: { matchId?: { in?: bigint[] } } }) {
        const selected = new Set((input.where?.matchId?.in ?? []).map(String));
        return matches
          .filter((match) => selected.has(String(match.id)))
          .map((match, index) => playerStat(match.id, 90, 7 - index * 0.1, 1));
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    scoringModel
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].goals, 5);
  assert.equal(rows[0].averageRating, 6.8);
  assert.equal(rows[0].averageRating10, 6.55);
  assert.equal(rows[0].rawMetrics?.average_rating, 6.8);
  assert.equal(rows[0].rawMetrics?.average_rating_10_sample_size, 10);
});

test("explicit roster scopes keep all-season history inside the selected competition", async () => {
  const matchScopes: string[] = [];
  const statCalls: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          rosterRow({
            leagueId: 47n,
            season: "2026/2027",
            teamId: 10n,
            playerId: 99n,
            position: "Goalkeeper",
            playerName: "Exact History Player"
          })
        ];
      }
    },
    coreMatch: {
      async findMany(input: unknown) {
        const where = (input as { where?: { leagueId?: bigint; season?: string } }).where;
        matchScopes.push(`${where?.leagueId}:${where?.season}`);
        return where?.leagueId === 42n && where.season === undefined
          ? [{ id: 301n, matchDate: new Date("2026-05-01T16:00:00.000Z") }]
          : [{ id: 999n, matchDate: new Date("2027-05-01T16:00:00.000Z") }];
      }
    },
    matchPlayerStat: {
      async findMany(input: unknown) {
        statCalls.push(input);
        return [playerStat(301n, 90)];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 42n, season: "2025/2026", teamId: 10n }],
    rosterScopes: [{ leagueId: 47n, season: "2026/2027", teamId: 10n }],
    matchWindow: { kind: "all" },
    combineTeamCompetitions: true,
    scoringModel
  });

  assert.deepEqual(matchScopes, ["42:undefined"]);
  assert.equal(statCalls.length, 1);
  assert.equal(rows[0].matchesPlayed, 1);
  assert.equal(rows[0].minutesPlayed, 90);

  const rowsWithoutMatchingHistory = await loadSharedMachetePlayerRows(prisma, {
    scopes: [],
    rosterScopes: [{ leagueId: 47n, season: "2026/2027", teamId: 10n }],
    matchWindow: { kind: "all" },
    combineTeamCompetitions: true,
    scoringModel
  });
  assert.equal(rowsWithoutMatchingHistory.length, 1);
  assert.equal(rowsWithoutMatchingHistory[0].matchesPlayed, 0);
  assert.deepEqual(matchScopes, ["42:undefined"]);
  assert.equal(statCalls.length, 1);
});

test("selected season without matching history keeps the current roster with zero aggregates", async () => {
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          rosterRow({
            leagueId: 47n,
            season: "2026/2027",
            teamId: 10n,
            playerId: 99n,
            position: "Midfielder",
            playerName: "Current Roster Player"
          })
        ];
      }
    },
    coreMatch: {
      async findMany() {
        throw new Error("empty exact history must not query a different competition");
      }
    },
    matchPlayerStat: {
      async findMany() {
        throw new Error("empty exact history must not load broad player history");
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [],
    rosterScopes: [{ leagueId: 47n, season: "2026/2027", teamId: 10n }],
    matchWindow: { kind: "all" },
    combineTeamCompetitions: true,
    scoringModel
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Current Roster Player");
  assert.equal(rows[0].matchesPlayed, 0);
  assert.equal(rows[0].minutesPlayed, 0);
  assert.equal(rows[0].fantasyScore, 0);
  assert.equal(rows[0].scoringScore, 0);
});

test("new transfers use five recent previous-club matches with a ten-percent penalty and exclude national-team history", async () => {
  let rosterQueryCount = 0;
  const fallbackMatchQueries: unknown[] = [];
  const fallbackStatQueries: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async findMany(input: { select?: { seasonTeam?: unknown } }) {
        rosterQueryCount += 1;
        if (input.select?.seasonTeam) {
          return [
            {
              playerId: 99n,
              teamId: 5n,
              team: { name: "Previous FC", country: "England" },
              seasonTeam: { leagueSeason: { league: { name: "Premier League", country: "England" } } }
            },
            {
              playerId: 99n,
              teamId: 6n,
              team: { name: "England", country: "England" },
              seasonTeam: { leagueSeason: { league: { name: "UEFA Nations League", country: null } } }
            }
          ];
        }
        return [
          rosterRow({
            leagueId: 47n,
            season: "2025/2026",
            teamId: 10n,
            playerId: 99n,
            position: null,
            playerName: "Transferred Player"
          })
        ];
      }
    },
    coreMatch: {
      async findMany(input: unknown) {
        fallbackMatchQueries.push(input);
        return [];
      }
    },
    matchPlayerStat: {
      async findMany(input: { include?: { match?: unknown } }) {
        if (!input.include?.match) return [];
        fallbackStatQueries.push(input);
        return [
          ...Array.from({ length: 5 }, (_, index) => ({
          ...playerStat(BigInt(100 + index), 90),
          teamId: 5n,
          position: "Defender",
          match: {
            matchDate: new Date(`2025-05-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`),
            status: "FINISHED"
          }
          })),
          {
            ...playerStat(999n, 90),
            teamId: 6n,
            position: "Defender",
            match: { matchDate: new Date("2025-06-01T16:00:00.000Z"), status: "FINISHED" }
          }
        ];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    fallbackToRecentClubHistory: true,
    fallbackLeagueIds: [47n],
    scoringModel
  });

  assert.equal(rosterQueryCount, 2);
  assert.equal(rows[0].position, "Defender");
  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].minutesPlayed, 405);
  assert.equal(rows[0].expectedMinutes, 81);
  assert.equal(rows[0].recentFp.length, 5);
  assert.deepEqual(rows[0].minuteHistoryProvenance, {
    source: "PREVIOUS_CLUB_FALLBACK",
    currentClubMatches: 0,
    previousClubMatches: 5,
    previousClubName: "Previous FC",
    previousClubPenaltyFactor: 0.9
  });
  assert.equal(rows[0].rawMetrics?.previous_club_fallback_matches, 5);
  assert.equal(rows[0].rawMetrics?.previous_club_penalty_factor, 0.9);
  assert.deepEqual((fallbackMatchQueries.at(-1) as { where: { leagueId: { in: bigint[] } } }).where.leagueId.in, [47n]);
  assert.deepEqual((fallbackStatQueries[0] as { where: { match: { leagueId: { in: bigint[] } } } }).where.match.leagueId.in, [47n]);
});

test("production club fallback loads only the selected previous club and ten bounded rows", async () => {
  let rawQueryCount = 0;
  let broadHistoryQueries = 0;
  const previousMatches = Array.from({ length: 5 }, (_, index) => ({
    id: BigInt(501 + index),
    matchDate: new Date(`2025-05-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`),
    season: "2024/2025"
  }));
  const prisma = {
    teamPlayerSeason: {
      async findMany(input: { select?: { seasonTeam?: unknown } }) {
        if (input.select?.seasonTeam) {
          return [
            {
              playerId: 99n,
              teamId: 10n,
              team: { name: "Current FC", country: "England" },
              seasonTeam: { leagueSeason: { league: { name: "Premier League", country: "England" } } }
            },
            {
              playerId: 99n,
              teamId: 5n,
              team: { name: "Previous FC", country: "England" },
              seasonTeam: { leagueSeason: { league: { name: "Championship", country: "England" } } }
            }
          ];
        }
        return [rosterRow({
          leagueId: 47n,
          season: "2025/2026",
          teamId: 10n,
          playerId: 99n,
          position: null,
          playerName: "Transferred Player"
        })];
      }
    },
    coreMatch: {
      async findMany() {
        return [];
      }
    },
    matchPlayerStat: {
      async findMany(input: { include?: { match?: unknown } }) {
        if (input.include?.match) broadHistoryQueries += 1;
        return [];
      }
    },
    async $queryRaw() {
      rawQueryCount += 1;
      if (rawQueryCount === 1) {
        return [
          { playerId: 99n, teamId: 10n, latestMatchDate: new Date("2025-08-10T16:00:00.000Z"), season: "2025/2026" },
          { playerId: 99n, teamId: 5n, latestMatchDate: previousMatches[4].matchDate, season: "2024/2025" }
        ];
      }
      if (rawQueryCount === 2) {
        return previousMatches.map((match) => ({
          ...playerStat(match.id, 90),
          teamId: 5n,
          position: "Defender",
          createdAt: match.matchDate,
          updatedAt: match.matchDate,
          matchDate: match.matchDate,
          matchStatus: "FINISHED"
        }));
      }
      return previousMatches.map((match) => ({ teamId: 5n, ...match }));
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    fallbackToRecentClubHistory: true,
    scoringModel
  });

  assert.equal(rawQueryCount, 3);
  assert.equal(broadHistoryQueries, 0);
  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].minutesPlayed, 405);
  assert.equal(rows[0].minuteHistoryProvenance?.previousClubName, "Previous FC");
});

test("request read context coalesces concurrent roster reads", async () => {
  let rosterQueries = 0;
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        rosterQueries += 1;
        await Promise.resolve();
        return [rosterRow({
          leagueId: 47n,
          season: "2025/2026",
          teamId: 10n,
          playerId: 99n,
          position: "GK",
          playerName: "Shared Player"
        })];
      }
    },
    coreMatch: { async findMany() { return []; } },
    matchPlayerStat: { async findMany() { return []; } }
  } as unknown as PrismaClient;
  const readContext = createSharedMacheteReadContext();

  await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
      matchWindow: { kind: "last", matches: 5 },
      scoringModel,
      readContext
    }),
    loadSharedMachetePlayerRows(prisma, {
      scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
      matchWindow: { kind: "days", days: 365 },
      scoringModel,
      readContext
    })
  ]);

  assert.equal(rosterQueries, 1);
  assert.equal(readContext.rosterRowsByKey.size, 1);
});

test("batch match loader maps multiple exact league-team scopes in one query", async () => {
  const matchQueries: unknown[] = [];
  const statQueries: unknown[] = [];
  const secondRoster = rosterRow({
    leagueId: 48n,
    season: "2025/2026",
    teamId: 30n,
    playerId: 100n,
    position: "MID",
    playerName: "Second Player"
  });
  secondRoster.team = { name: "Second FC" };
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
        return [
          rosterRow({ leagueId: 47n, season: "2025/2026", teamId: 10n, playerId: 99n, position: "GK", playerName: "First Player" }),
          secondRoster
        ];
      }
    },
    coreMatch: {
      async findMany(input: unknown) {
        matchQueries.push(input);
        return [
          { id: 501n, matchDate: new Date("2026-05-02T16:00:00.000Z"), season: "2025/2026", leagueId: 47n, homeTeamId: 10n, awayTeamId: 20n },
          { id: 601n, matchDate: new Date("2026-05-03T16:00:00.000Z"), season: "2025/2026", leagueId: 48n, homeTeamId: 30n, awayTeamId: 40n }
        ];
      }
    },
    matchPlayerStat: {
      async findMany(input: unknown) {
        statQueries.push(input);
        return [];
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [
      { leagueId: 47n, season: "2025/2026", teamId: 10n },
      { leagueId: 48n, season: "2025/2026", teamId: 30n }
    ],
    matchWindow: { kind: "all" },
    scoringModel
  });

  assert.equal(rows.length, 2);
  assert.equal(matchQueries.length, 1);
  assert.equal(((matchQueries[0] as { where?: { OR?: unknown[] } }).where?.OR ?? []).length, 2);
  assert.deepEqual((statQueries[0] as { where?: { matchId?: { in?: bigint[] } } }).where?.matchId?.in, [501n, 601n]);
});

test("match window summary reports official matches separately from parsed player-stat coverage", async () => {
  const prisma = {
    coreMatch: {
      async findMany() {
        return [
          { id: 203n, matchDate: new Date("2025-05-15T16:00:00.000Z") },
          { id: 202n, matchDate: new Date("2025-05-08T16:00:00.000Z") },
          { id: 201n, matchDate: new Date("2025-05-01T16:00:00.000Z") }
        ];
      }
    },
    matchPlayerStat: {
      async findMany() {
        return [{ matchId: 202n }, { matchId: 201n }];
      }
    }
  } as unknown as PrismaClient;

  const summary = await loadSharedMatchWindowSummary(prisma, [{ leagueId: 47n, season: "2024/2025", teamId: 10n }], { kind: "last", matches: 3 }, false);

  assert.deepEqual(summary, {
    officialMatches: 3,
    matchesWithPlayerStats: 2
  });
});

function leagueSeasonRow(leagueId: bigint, season: string, isCurrent: boolean, updatedAt: string, name: string, country: string) {
  return {
    leagueId,
    season,
    name,
    country,
    isCurrent,
    updatedAt: new Date(updatedAt),
    league: {
      name,
      country
    }
  };
}

function rosterRow(input: {
  leagueId: bigint;
  season: string;
  teamId: bigint;
  playerId: bigint;
  position: string | null;
  playerName: string;
}) {
  return {
    leagueId: input.leagueId,
    season: input.season,
    teamId: input.teamId,
    playerId: input.playerId,
    position: input.position,
    age: 30,
    nationality: "England",
    isStarter: true,
    player: { name: input.playerName, country: "England" },
    team: { name: "Aston Villa" },
    seasonTeam: {
      metadata: { short_name: "Villa" },
      leagueSeason: {
        name: "Premier League",
        country: "England",
        league: {
          name: "Premier League",
          country: "England"
        }
      }
    }
  };
}

function playerStat(matchId: bigint, minutes: number, rating = 7, goals = 0) {
  return {
    matchId,
    playerId: 99n,
    teamId: 10n,
    opponentTeamId: 20n,
    isHome: true,
    started: true,
    substitutedIn: false,
    substitutedOut: false,
    minutes,
    position: "GK",
    shirtNumber: 1,
    goals,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 3,
    goalsConceded: 1,
    cleanSheet: false,
    xg: 0,
    xgot: 0,
    xa: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    chancesCreated: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    duelsWon: 0,
    aerialsWon: 0,
    recoveries: 0,
    touchesInOppBox: 0,
    foulsWon: 0,
    penaltiesWon: 0,
    rating
  };
}
