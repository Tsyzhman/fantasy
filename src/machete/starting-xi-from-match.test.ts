import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  applyStartingXiFromCompletedMatch,
  startingXiLineupBlockReason,
  startingXiMatchOrderDecision
} from "./starting-xi-from-match";

test("one to eleven unique starters are accepted and a larger lineup is blocked", () => {
  assert.equal(startingXiLineupBlockReason([]), "NO_STARTERS");
  assert.equal(startingXiLineupBlockReason(Array.from({ length: 10 }, (_, index) => ({ playerId: BigInt(index + 1) }))), null);
  assert.equal(startingXiLineupBlockReason(Array.from({ length: 11 }, (_, index) => ({ playerId: BigInt(index + 1) }))), null);
  assert.equal(startingXiLineupBlockReason(Array.from({ length: 12 }, (_, index) => ({ playerId: BigInt(index + 1) }))), "TOO_MANY_STARTERS");
});

test("a repeated or older result cannot overwrite the latest lineup", () => {
  const latestDate = new Date("2026-08-09T15:00:00.000Z");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 20n, nextMatchDate: latestDate }), "ALREADY_APPLIED");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 19n, nextMatchDate: new Date("2026-08-01T15:00:00.000Z") }), "OLDER_MATCH");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 21n, nextMatchDate: new Date("2026-08-16T15:00:00.000Z") }), "APPLY");
});

test("a partial FotMob lineup replaces the flags with every available starter", async () => {
  let transactionCalls = 0;
  const upsertedPlayerIds: bigint[] = [];
  const playerStats = Array.from({ length: 10 }, (_, index) => ({
    playerId: BigInt(index + 1),
    teamId: 10n,
    position: "MID",
    shirtNumber: index + 1
  }));
  const prisma = {
    coreMatch: {
      findUnique: async () => ({
        id: 100n,
        leagueId: 63n,
        season: "2026/2027",
        homeTeamId: 10n,
        awayTeamId: 20n,
        matchDate: new Date("2026-08-09T15:00:00.000Z"),
        finished: true,
        cancelled: false,
        playerStats
      })
    },
    $transaction: async (callback: (tx: unknown) => unknown) => {
      transactionCalls += 1;
      return callback({
        $executeRaw: async () => 1,
        leagueSeasonTeam: {
          findUnique: async () => ({ active: true, startingXiSourceMatchId: null, startingXiSourceMatchDate: null }),
          update: async () => ({}),
          updateMany: async () => ({ count: 0 })
        },
        teamPlayerSeason: {
          findMany: async () => [],
          updateMany: async () => ({ count: 11 }),
          upsert: async ({ create }: { create: { playerId: bigint } }) => {
            upsertedPlayerIds.push(create.playerId);
            return {};
          }
        }
      });
    }
  } as unknown as PrismaClient;

  const result = await applyStartingXiFromCompletedMatch(prisma, { matchId: 100n });
  assert.equal(transactionCalls, 1);
  assert.deepEqual(upsertedPlayerIds, Array.from({ length: 10 }, (_, index) => BigInt(index + 1)));
  assert.deepEqual(result.teams.map((team) => [team.teamId, team.reason, team.startersFound, team.startersApplied]), [
    [10n, "APPLIED", 10, 10],
    [20n, "NO_STARTERS", 0, 0]
  ]);
});

test("incremental ingestion applies match starters instead of clearing the whole league", () => {
  const source = readFileSync(new URL("../core_data/ingestion-jobs.ts", import.meta.url), "utf8");
  assert.match(source, /applyStartingXiFromCompletedMatch\(prisma, \{ matchId: result\.matchId \}\)/);
  assert.doesNotMatch(source, /resetStartingXiForLatestCompletedRound|resetting_starting_xi/);
});

test("actual-match and manual starter updates share the per-team lock namespace", () => {
  const actualMatchSource = readFileSync(new URL("./starting-xi-from-match.ts", import.meta.url), "utf8");
  const probableLineupSource = readFileSync(new URL("./probable-lineup-sync.ts", import.meta.url), "utf8");
  const manualSource = readFileSync(new URL("../app/api/machete/team-player-seasons/starter/route.ts", import.meta.url), "utf8");
  assert.match(actualMatchSource, /`starting-xi:\$\{input\.leagueId\}:\$\{input\.season\}:\$\{input\.teamId\}`/);
  assert.match(probableLineupSource, /`starting-xi:\$\{plan\.leagueId\}:\$\{plan\.season\}:\$\{teamId\}`/);
  assert.match(manualSource, /`starting-xi:\$\{leagueId\}:\$\{season\}:\$\{teamId\}`/);
});
