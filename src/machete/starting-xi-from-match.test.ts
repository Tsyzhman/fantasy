import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  applyStartingXiFromCompletedMatch,
  isCompleteStartingXi,
  startingXiMatchOrderDecision
} from "./starting-xi-from-match";

test("only an exact, duplicate-free eleven is accepted", () => {
  assert.equal(isCompleteStartingXi(Array.from({ length: 10 }, (_, index) => ({ playerId: BigInt(index + 1) }))), false);
  assert.equal(isCompleteStartingXi(Array.from({ length: 11 }, (_, index) => ({ playerId: BigInt(index + 1) }))), true);
  assert.equal(isCompleteStartingXi([
    ...Array.from({ length: 10 }, (_, index) => ({ playerId: BigInt(index + 1) })),
    { playerId: 10n }
  ]), false);
});

test("a repeated or older result cannot overwrite the latest lineup", () => {
  const latestDate = new Date("2026-08-09T15:00:00.000Z");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 20n, nextMatchDate: latestDate }), "ALREADY_APPLIED");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 19n, nextMatchDate: new Date("2026-08-01T15:00:00.000Z") }), "OLDER_MATCH");
  assert.equal(startingXiMatchOrderDecision({ previousMatchId: 20n, previousMatchDate: latestDate, nextMatchId: 21n, nextMatchDate: new Date("2026-08-16T15:00:00.000Z") }), "APPLY");
});

test("an incomplete FotMob lineup preserves every existing flag", async () => {
  let transactionCalls = 0;
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
    $transaction: async () => {
      transactionCalls += 1;
      throw new Error("Incomplete lineups must not open a write transaction.");
    }
  } as unknown as PrismaClient;

  const result = await applyStartingXiFromCompletedMatch(prisma, { matchId: 100n });
  assert.equal(transactionCalls, 0);
  assert.deepEqual(result.teams.map((team) => [team.teamId, team.reason, team.startersFound]), [
    [10n, "INCOMPLETE_LINEUP", 10],
    [20n, "INCOMPLETE_LINEUP", 0]
  ]);
});

test("incremental ingestion applies match starters instead of clearing the whole league", () => {
  const source = readFileSync(new URL("../core_data/ingestion-jobs.ts", import.meta.url), "utf8");
  assert.match(source, /applyStartingXiFromCompletedMatch\(prisma, \{ matchId: result\.matchId \}\)/);
  assert.doesNotMatch(source, /resetStartingXiForLatestCompletedRound|resetting_starting_xi/);
});
