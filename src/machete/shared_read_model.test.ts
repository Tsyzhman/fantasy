import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { ActiveScoringModel } from "@/lib/scoring";
import { loadSharedLeagueOptions, loadSharedLeagueSeason, loadSharedLeagueTeams, loadSharedMachetePlayerRows, loadSharedMatchWindowSummary, loadSharedTeamMatchIds } from "./shared_read_model";

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
  assert.equal(coreMatchCalls.length, 2);
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { season?: string } }).where?.season === undefined), true);
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
  assert.equal(coreMatchCalls.every((call) => (call as { take?: number }).take === undefined), true);
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { season?: string } }).where?.season === undefined), true);
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { playerStats?: unknown } }).where?.playerStats === undefined), true);
  const statCall = statCalls[0] as { where?: { matchId?: { in?: bigint[] } } };
  assert.deepEqual(statCall.where?.matchId?.in, [203n, 202n, 201n]);
});

test("shared player rows push position filters into roster loading and normalize returned rows", async () => {
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
            position: "Goalkeeper",
            playerName: "Emiliano Martinez"
          }),
          rosterRow({
            leagueId: 47n,
            season: "2024/2025",
            teamId: 10n,
            playerId: 100n,
            position: "Defender",
            playerName: "Pau Torres"
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

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2024/2025", teamId: 10n }],
    position: "GK",
    playerIds: [99n],
    matchWindow: { kind: "all" },
    scoringModel
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "47:2024/2025:10:99");
  assert.equal(rows[0].position, "Goalkeeper");
  assert.equal(rows[0].teamShortName, "Villa");

  const rosterCall = rosterCalls[0] as {
    where?: {
      AND?: Array<{
        OR?: Array<{
          position?: {
            contains?: string;
          };
        }>;
        playerId?: { in?: bigint[] };
      }>;
    };
  };
  const positionTerms = rosterCall.where?.AND?.[1]?.OR?.map((item) => item.position?.contains).filter(Boolean);
  assert.deepEqual(positionTerms, ["GK", "keeper", "goalkeeper"]);
  assert.deepEqual(rosterCall.where?.AND?.[2]?.playerId?.in, [99n]);
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

test("shared player rows can carry recent league history and position into an empty new season", async () => {
  const prisma = {
    teamPlayerSeason: {
      async findMany() {
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
      async findMany() {
        return [];
      }
    },
    matchPlayerStat: {
      async findMany(input: { include?: { match?: unknown } }) {
        if (!input.include?.match) return [];
        return Array.from({ length: 5 }, (_, index) => ({
          ...playerStat(BigInt(100 + index), 90),
          teamId: 5n,
          position: "Defender",
          match: {
            matchDate: new Date(`2025-05-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`),
            status: "FINISHED"
          }
        }));
      }
    }
  } as unknown as PrismaClient;

  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: [{ leagueId: 47n, season: "2025/2026", teamId: 10n }],
    matchWindow: { kind: "last", matches: 5 },
    fallbackToRecentLeagueHistory: true,
    scoringModel
  });

  assert.equal(rows[0].position, "Defender");
  assert.equal(rows[0].matchesPlayed, 5);
  assert.equal(rows[0].expectedMinutes, 90);
  assert.equal(rows[0].recentFp.length, 5);
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

function playerStat(matchId: bigint, minutes: number) {
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
    goals: 0,
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
    rating: 7
  };
}
