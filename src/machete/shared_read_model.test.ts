import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { ActiveScoringModel } from "@/lib/scoring";
import { loadSharedMachetePlayerRows, loadSharedTeamMatchIds } from "./shared_read_model";

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

test("shared team match ids keep all-loaded scoped to the selected competition season", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreMatch: {
      async findMany(input: unknown) {
        calls.push(input);
        return [{ id: 201n }];
      }
    }
  } as unknown as PrismaClient;

  const ids = await loadSharedTeamMatchIds(prisma, 47n, "2024/2025", 10n, { kind: "all" });

  assert.deepEqual(ids, [201n]);
  const call = calls[0] as { where?: { leagueId?: bigint; season?: string } };
  assert.equal(call.where?.leagueId, 47n);
  assert.equal(call.where?.season, "2024/2025");
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
        if (season === "2023/2024") return [{ id: 101n }, { id: 102n }];
        if (season === "2024/2025") return [{ id: 201n }];
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
    rating: 7,
    statsPayload: null
  };
}
