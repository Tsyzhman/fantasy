import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { resetStartingXiForLatestCompletedRound, shouldResetStartingXiRound } from "./starting-xi-round-reset";

test("first completed round with stats initializes the reset marker", () => {
  assert.equal(shouldResetStartingXiRound(null, "1"), true);
});

test("repeated nightly updates in the same round do not reset manual flags again", () => {
  assert.equal(shouldResetStartingXiRound("5", "5"), false);
  assert.equal(shouldResetStartingXiRound("Round 5", "Round 5"), false);
});

test("the first completed match of a newer round triggers a reset", () => {
  assert.equal(shouldResetStartingXiRound("5", "6"), true);
  assert.equal(shouldResetStartingXiRound("Round 5", "Round 6"), true);
});

test("a postponed match from an older numbered round cannot roll the marker back", () => {
  assert.equal(shouldResetStartingXiRound("8", "3"), false);
  assert.equal(shouldResetStartingXiRound("Round 8", "Round 3"), false);
});

test("database reset clears flags and team timestamps exactly once per round", async () => {
  let marker: string | null = null;
  let playerUpdates = 0;
  let teamTimestampUpdates = 0;
  const transaction = {
    $executeRaw: async () => 1,
    leagueSeason: {
      findUnique: async () => ({ startingXiResetRound: marker }),
      update: async (args: { data: { startingXiResetRound: string } }) => {
        marker = args.data.startingXiResetRound;
        return {};
      }
    },
    teamPlayerSeason: {
      findMany: async () => [{ teamId: 10n }, { teamId: 20n }],
      updateMany: async () => {
        playerUpdates += 1;
        return { count: 7 };
      }
    },
    leagueSeasonTeam: {
      updateMany: async () => {
        teamTimestampUpdates += 1;
        return { count: 2 };
      }
    }
  };
  const prisma = {
    coreMatch: { findFirst: async () => ({ round: "6" }) },
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction)
  } as unknown as PrismaClient;

  const first = await resetStartingXiForLatestCompletedRound(prisma, { leagueId: 63n, season: "2026/2027" });
  const repeated = await resetStartingXiForLatestCompletedRound(prisma, { leagueId: 63n, season: "2026/2027" });

  assert.deepEqual(first, { reset: true, round: "6", playersReset: 7, teamsChanged: 2, reason: "RESET" });
  assert.equal(repeated.reason, "ROUND_ALREADY_RESET");
  assert.equal(playerUpdates, 1);
  assert.equal(teamTimestampUpdates, 1);
});
