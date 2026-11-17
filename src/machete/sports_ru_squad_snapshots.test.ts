import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  publishedSportsRoundPlans,
  latestStartedSportsRuSquadRound,
  latestStartedSportsRuProviderRound,
  loadStoredSportsRuSquadImportPreview,
  syncSportsRuSquadSnapshotOnDemand
} from "./sports_ru_squad_snapshots";

const importRouteSource = readFileSync(new URL("../app/api/machete/squads/import-sports-ru/route.ts", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("./sports_ru_squad_snapshots.ts", import.meta.url), "utf8");

test("Sports.ru squad publication is eligible at the first match of the latest started round", () => {
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
  assert.equal(schedule.availableAfter.getTime() - schedule.firstMatchAt.getTime(), 0);
  assert.equal(schedule.availableAfter.toISOString(), "2026-07-30T15:00:00.000Z");
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

test("Sports.ru snapshots select the exact provider tour ID and never compare it with a FotMob round", () => {
  assert.match(snapshotSource, /expectedTourId: snapshot\.providerTourId/);
  assert.doesNotMatch(snapshotSource, /sportsRuTourMatchesFotMobRound/);
});

test("Sports.ru snapshot schedule follows provider tour 3 even when it contains a league-round-6 fixture", () => {
  const schedule = latestStartedSportsRuProviderRound([
    {
      providerRoundId: "2462",
      ordinal: 2,
      name: "2 тур",
      startsAt: new Date("2026-08-25T17:00:00Z"),
      fixtures: [{ kickoffAt: new Date("2026-08-25T17:00:00Z"), status: "FINISHED" }]
    },
    {
      providerRoundId: "2463",
      ordinal: 3,
      name: "3 тур",
      startsAt: new Date("2026-09-03T18:00:00Z"),
      fixtures: [
        { kickoffAt: new Date("2026-09-03T18:00:00Z"), status: "STARTED" },
        { kickoffAt: new Date("2026-09-12T14:00:00Z"), status: "SCHEDULED" }
      ]
    }
  ], new Date("2026-09-03T19:00:00Z"));

  assert.equal(schedule?.roundKey, "sports-ru:tour:3:2463");
  assert.equal(schedule?.providerTourId, "2463");
  assert.equal(schedule?.roundLabel, "3 тур");
});

test("the one-click import route reuses a stored snapshot or starts a targeted on-demand sync", () => {
  assert.match(importRouteSource, /loadStoredSportsRuSquadImportPreview/);
  assert.match(importRouteSource, /syncSportsRuSquadSnapshotOnDemand/);
  assert.match(importRouteSource, /availablePlayerIds: plannerData\.players\.map/);
  assert.match(importRouteSource, /selections: validation\.selections/);
  assert.match(importRouteSource, /roundPlans,/);
  assert.match(importRouteSource, /const importedPlayers = validation\.selections\.flatMap/);
  assert.match(importRouteSource, /toFantasyPlayerPoolListItem/);
  assert.doesNotMatch(importRouteSource, /fetchSportsRuLatestPublishedSquad|loadSportsRuSquadImportPreview/);
  assert.doesNotMatch(importRouteSource, /SPORTS_PLAYERS_UNMAPPED/);
  assert.ok(
    importRouteSource.indexOf("snapshotStatus = await syncSportsRuSquadSnapshotOnDemand")
      < importRouteSource.indexOf("preview = await loadStoredSportsRuSquadImportPreview"),
    "the current round must be scheduled before an older stored snapshot can be imported"
  );
});

test("unmapped Sports.ru players complete the snapshot as provider placeholders", () => {
  assert.doesNotMatch(snapshotSource, /data:\s*\{\s*status:\s*"MAPPING_INCOMPLETE"/);
  assert.match(snapshotSource, /\{ status: "MAPPING_INCOMPLETE" \}/);
  assert.match(snapshotSource, /mappedPlayersCount: preview\.selections\.length - preview\.unmapped\.length/);
  assert.match(snapshotSource, /unmappedPlayers: preview\.unmapped as Prisma\.InputJsonValue/);
});

test("stored Sports.ru snapshot turns a transferred-out mapped player into a priced placeholder", async () => {
  const published = {
    providerSquadId: "squad-1",
    squadName: "Imported",
    seasonId: "season-1",
    tournamentHru: "spain",
    tournamentName: "Испания",
    tourId: "2462",
    tourName: "2 тур",
    tourFinishedAt: "2026-08-28T00:00:00Z",
    totalPrice: 14.5,
    currentBalance: 85.5,
    players: [
      {
        providerPlayerId: "known-1",
        name: "Known player",
        teamName: "Бетис",
        role: "GOALKEEPER",
        price: 6.1,
        isStarter: true,
        isCaptain: false,
        isViceCaptain: false,
        substitutePriority: null
      },
      {
        providerPlayerId: "gone-2",
        name: "Ушедший игрок",
        teamName: "Севилья",
        role: "MIDFIELDER",
        price: 8.4,
        isStarter: true,
        isCaptain: true,
        isViceCaptain: false,
        substitutePriority: null
      }
    ]
  };
  const prisma = {
    userExternalProfile: {
      findUnique: async () => ({ providerUserId: "profile-1" })
    },
    sportsRuSquadSnapshot: {
      findFirst: async () => ({
        status: "COMPLETE",
        lastError: null,
        providerSquadId: published.providerSquadId,
        squadName: published.squadName,
        tournamentName: published.tournamentName,
        providerTourId: published.tourId,
        tourName: published.tourName,
        roundLabel: "2",
        providerPayload: published,
        selections: [
          { playerId: "101", isStarter: true, isLocked: false, isCaptain: false, isViceCaptain: false, slotIndex: 0, purchasePrice: 6.1 },
          { playerId: "202", isStarter: true, isLocked: false, isCaptain: true, isViceCaptain: false, slotIndex: 1, purchasePrice: 8.4 }
        ],
        unmappedPlayers: []
      })
    }
  } as unknown as PrismaClient;

  const preview = await loadStoredSportsRuSquadImportPreview(prisma, {
    userId: "user-1",
    leagueId: 87n,
    season: "2026/2027",
    expectedSquadSize: 2,
    availablePlayerIds: ["101"]
  });

  assert.equal(preview.selections[0].playerId, "101");
  assert.match(preview.selections[1].playerId, /^provider-placeholder:SPORTS_RU:/);
  assert.equal(preview.selections[1].slotIndex, 1);
  assert.equal(preview.selections[1].isCaptain, true);
  assert.equal(preview.selections[1].purchasePrice, 8.4);
  assert.deepEqual(preview.unmapped.map((player) => ({
    providerPlayerId: player.providerPlayerId,
    name: player.name,
    teamName: player.teamName,
    position: player.position,
    price: player.price
  })), [{
    providerPlayerId: "gone-2",
    name: "Ушедший игрок",
    teamName: "Севилья",
    position: "MIDFIELDER",
    price: 8.4
  }]);
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

// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data
test("published tour replaces the expired selection and carries the user's next round edits", () => {
  const player = (playerId: string) => ({ playerId, isStarter: true, slotIndex: 0, isCaptain: false, isViceCaptain: false, isLocked: false, purchasePrice: 5 });
  const input = { published: [player("3")], roundKey: "tour2", nextRoundKeys: ["tour3", "tour4"],
    savedRoundIds: ["tour1", "tour2", "tour3"], editedAfterKickoff: false,
    savedPlans: ["1", "2", "4"].map((id, roundOffset) => ({ roundOffset, linkedToPrevious: false, selections: [player(id)] })) };
  const next = publishedSportsRoundPlans(input);
  assert.deepEqual(next.roundIds, ["tour2", "tour3", "tour4"]);
  assert.deepEqual(next.plans.map(p => p.selections[0].playerId), ["3", "4", "4", "4", "4"]);
  const future = publishedSportsRoundPlans({ ...input, savedRoundIds: ["tour3"], savedPlans: [input.savedPlans[2]] });
  assert.equal(future.plans[0].selections[0].playerId, "4");
  assert.equal(future.roundIds[0], "tour3");
});
