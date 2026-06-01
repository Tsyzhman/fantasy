import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { ActiveScoringModel } from "@/lib/scoring";
import { loadSharedLeagueOptions, loadSharedLeagueSeason, loadSharedMachetePlayerRows, loadSharedMatchWindowSummary, loadSharedTeamMatchIds } from "./shared_read_model";

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

test("shared team match ids keep all-loaded scoped to the selected competition season", async () => {
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
  assert.equal(call.where?.season, "2024/2025");
  assert.equal((call.where as { playerStats?: unknown }).playerStats, undefined);
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
        const season = (input as { where?: { season?: string } }).where?.season;
        if (season === "2023/2024") {
          return [
            { id: 101n, matchDate: new Date("2024-04-01T16:00:00.000Z") },
            { id: 102n, matchDate: new Date("2024-04-08T16:00:00.000Z") }
          ];
        }
        if (season === "2024/2025") return [{ id: 201n, matchDate: new Date("2025-04-01T16:00:00.000Z") }];
        return [];
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
  assert.deepEqual(
    coreMatchCalls.map((call) => (call as { where?: { season?: string } }).where?.season).sort(),
    ["2023/2024", "2024/2025"]
  );
  const statCall = statCalls[0] as {
    where?: {
      matchId?: { in?: bigint[] };
      teamId?: { in?: bigint[] };
      playerId?: { in?: bigint[] };
    };
  };
  assert.deepEqual(statCall.where?.matchId?.in, [101n, 102n, 201n]);
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
        const season = (input as { where?: { season?: string } }).where?.season;
        if (season === "2023/2024") {
          return [
            { id: 101n, matchDate: new Date("2024-05-01T16:00:00.000Z") },
            { id: 102n, matchDate: new Date("2024-05-08T16:00:00.000Z") }
          ];
        }
        if (season === "2024/2025") {
          return [
            { id: 203n, matchDate: new Date("2025-05-15T16:00:00.000Z") },
            { id: 201n, matchDate: new Date("2025-05-01T16:00:00.000Z") },
            { id: 202n, matchDate: new Date("2025-05-08T16:00:00.000Z") }
          ];
        }
        return [];
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
  assert.equal(coreMatchCalls.every((call) => (call as { where?: { playerStats?: unknown } }).where?.playerStats === undefined), true);
  const statCall = statCalls[0] as { where?: { matchId?: { in?: bigint[] } } };
  assert.deepEqual(statCall.where?.matchId?.in, [203n, 202n, 201n]);
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
