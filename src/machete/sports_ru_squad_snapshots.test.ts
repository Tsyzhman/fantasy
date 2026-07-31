import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  latestStartedSportsRuSquadRound,
  SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS,
  syncSportsRuSquadSnapshotOnDemand,
  sportsRuTourMatchesFotMobRound
} from "./sports_ru_squad_snapshots";

const importRouteSource = readFileSync(new URL("../app/api/machete/squads/import-sports-ru/route.ts", import.meta.url), "utf8");

test("Sports.ru squad publication is scheduled 30 minutes after the first match of the latest started round", () => {
  const now = new Date("2026-07-30T17:00:00.000Z");
  const schedule = latestStartedSportsRuSquadRound([
    match(1n, "1", "2026-07-20T12:00:00.000Z"),
    match(2n, "1", "2026-07-20T15:00:00.000Z"),
    match(3n, "2", "2026-07-30T15:00:00.000Z"),
    match(4n, "2", "2026-07-30T16:00:00.000Z"),
    match(5n, "3", "2026-08-05T15:00:00.000Z")
  ], now);

  assert.ok(schedule);
  assert.equal(schedule.roundKey, "round:2");
  assert.equal(schedule.firstMatchAt.toISOString(), "2026-07-30T15:00:00.000Z");
  assert.equal(schedule.availableAfter.getTime() - schedule.firstMatchAt.getTime(), SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS);
  assert.equal(schedule.availableAfter.toISOString(), "2026-07-30T15:30:00.000Z");
});

test("Sports.ru squad schedule ignores cancelled, future, and roundless fixtures", () => {
  const now = new Date("2026-07-30T17:00:00.000Z");
  const schedule = latestStartedSportsRuSquadRound([
    { ...match(1n, "1", "2026-07-30T15:00:00.000Z"), cancelled: true },
    match(2n, null, "2026-07-30T15:00:00.000Z"),
    match(3n, "2", "2026-07-31T15:00:00.000Z")
  ], now);

  assert.equal(schedule, null);
});

test("Sports.ru published tour must match the FotMob round when both expose a round number", () => {
  assert.equal(sportsRuTourMatchesFotMobRound("Regular Season - 1", "1 тур"), true);
  assert.equal(sportsRuTourMatchesFotMobRound("2", "Тур 1"), false);
  assert.equal(sportsRuTourMatchesFotMobRound("Final", "Final"), true);
});

test("the one-click import route reuses a stored snapshot or starts a targeted on-demand sync", () => {
  assert.match(importRouteSource, /loadStoredSportsRuSquadImportPreview/);
  assert.match(importRouteSource, /syncSportsRuSquadSnapshotOnDemand/);
  assert.doesNotMatch(importRouteSource, /fetchSportsRuLatestPublishedSquad|loadSportsRuSquadImportPreview/);
  assert.ok(
    importRouteSource.indexOf("snapshotStatus = await syncSportsRuSquadSnapshotOnDemand")
      < importRouteSource.indexOf("preview = await loadStoredSportsRuSquadImportPreview"),
    "the current round must be scheduled before an older stored snapshot can be imported"
  );
});

test("a button request revives an exhausted snapshot without waiting for the background scheduler", async () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  let fetchCalls = 0;
  let upsertCalls = 0;
  const snapshot = {
    id: "snapshot-1",
    userId: "user-1",
    leagueId: 63n,
    season: "2026/2027",
    roundKey: "round:1",
    roundLabel: "1",
    firstMatchAt: new Date("2026-07-31T10:00:00.000Z"),
    availableAfter: new Date("2026-07-31T10:30:00.000Z"),
    providerProfileId: "1090024123",
    providerSeasonId: "75",
    providerSquadId: null,
    providerTourId: null,
    squadName: null,
    tournamentName: null,
    tourName: null,
    status: "UNAVAILABLE",
    attemptCount: 8,
    lastAttemptAt: new Date("2026-07-31T11:50:00.000Z"),
    nextAttemptAt: null as Date | null,
    syncLeaseUntil: null as Date | null,
    playersCount: 0,
    mappedPlayersCount: 0,
    selections: null,
    providerPayload: null,
    unmappedPlayers: null,
    fetchedAt: null as Date | null,
    completedAt: null as Date | null,
    lastError: "The current tour squad is not public yet.",
    createdAt: new Date("2026-07-31T10:30:00.000Z"),
    updatedAt: new Date("2026-07-31T11:50:00.000Z")
  };
  const prisma = {
    userExternalProfile: {
      findUnique: async () => ({ providerUserId: snapshot.providerProfileId })
    },
    sportsRuFantasyContest: {
      findFirst: async () => ({
        squadSize: 15,
        rules: { sportsRuSeasonId: snapshot.providerSeasonId },
        lastSyncedAt: now
      })
    },
    coreMatch: {
      findMany: async () => [match(1n, "1", "2026-07-31T10:00:00.000Z")]
    },
    sportsRuSquadSnapshot: {
      upsert: async () => {
        upsertCalls += 1;
        return snapshot;
      },
      updateMany: async (args: {
        where: { status: { in: string[] } };
        data: { lastAttemptAt: Date; syncLeaseUntil: Date };
      }) => {
        assert.ok(args.where.status.in.includes("UNAVAILABLE"));
        snapshot.attemptCount += 1;
        snapshot.lastAttemptAt = args.data.lastAttemptAt;
        snapshot.syncLeaseUntil = args.data.syncLeaseUntil;
        return { count: 1 };
      },
      findUnique: async () => snapshot,
      update: async (args: {
        data: Partial<typeof snapshot>;
      }) => {
        Object.assign(snapshot, args.data);
        return snapshot;
      },
      findFirst: async () => snapshot
    }
  } as unknown as PrismaClient;

  const status = await syncSportsRuSquadSnapshotOnDemand(prisma, {
    userId: snapshot.userId,
    leagueId: snapshot.leagueId,
    season: snapshot.season,
    expectedSquadSize: 15,
    now,
    fetchPublishedSquad: async () => {
      fetchCalls += 1;
      return null;
    }
  });

  assert.equal(upsertCalls, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(status.status, "UNAVAILABLE");
  assert.equal(status.attemptCount, 9);
  assert.equal(status.inProgress, false);
});

function match(id: bigint, round: string | null, matchDate: string) {
  return { id, round, matchDate: new Date(matchDate), cancelled: false };
}
