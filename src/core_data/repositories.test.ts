import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { OFFICIAL_TRANSFER_ROSTER_SOURCE } from "./models";
import { CoreSeasonRosterRepository, CoreTeamRepository } from "./repositories";

test("core team repository does not overwrite a named team with a FotMob placeholder", async () => {
  const upserts: unknown[] = [];
  const prisma = {
    coreTeam: {
      async upsert(input: unknown) {
        upserts.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreTeamRepository(prisma);
  await repository.upsert({
    id: 9879n,
    name: "FotMob team 9879",
    country: null,
    ccode: null,
    rawRef: "9879"
  });
  await repository.upsert({
    id: 9879n,
    name: "Fulham",
    country: "England",
    ccode: "ENG",
    rawRef: "9879"
  });

  assert.deepEqual(upserts[0], {
    where: { id: 9879n },
    update: {
      rawRef: "9879",
      source: "fotmob"
    },
    create: {
      id: 9879n,
      name: "FotMob team 9879",
      country: null,
      ccode: null,
      rawRef: "9879",
      source: "fotmob"
    }
  });
  assert.deepEqual(upserts[1], {
    where: { id: 9879n },
    update: {
      name: "Fulham",
      country: "England",
      ccode: "ENG",
      rawRef: "9879",
      source: "fotmob"
    },
    create: {
      id: 9879n,
      name: "Fulham",
      country: "England",
      ccode: "ENG",
      rawRef: "9879",
      source: "fotmob"
    }
  });
});

test("FotMob roster deactivation preserves Sports.ru authoritative starter rows", async () => {
  const updates: unknown[] = [];
  const prisma = {
    teamPlayerSeason: {
      async updateMany(input: unknown) {
        updates.push(input);
        return { count: 0 };
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreSeasonRosterRepository(prisma);
  await repository.deactivateMissingTeamPlayers(57n, "2026/2027", 10229n, [1n, 2n]);

  assert.deepEqual(updates, [{
    where: {
      leagueId: 57n,
      season: "2026/2027",
      teamId: 10229n,
      source: "fotmob",
      playerId: { notIn: [1n, 2n] },
      active: true
    },
    data: { active: false }
  }]);
});

test("deactivating missing season teams also retires their active roster and starter flags", async () => {
  const seasonTeamUpdates: unknown[] = [];
  const rosterUpdates: unknown[] = [];
  const prisma = {
    leagueSeasonTeam: {
      async updateMany(input: unknown) {
        seasonTeamUpdates.push(input);
        return { count: 2 };
      }
    },
    teamPlayerSeason: {
      async updateMany(input: unknown) {
        rosterUpdates.push(input);
        return { count: 7 };
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreSeasonRosterRepository(prisma);
  await repository.deactivateMissingSeasonTeams(54n, "2026/2027", [8406n, 8460n]);

  assert.deepEqual(seasonTeamUpdates, [{
    where: {
      leagueId: 54n,
      season: "2026/2027",
      teamId: { notIn: [8406n, 8460n] },
      active: true
    },
    data: { active: false }
  }]);
  assert.deepEqual(rosterUpdates, [{
    where: {
      leagueId: 54n,
      season: "2026/2027",
      teamId: { notIn: [8406n, 8460n] },
      active: true
    },
    data: { active: false, isStarter: false }
  }]);
});

test("FotMob roster sync takes ownership when an authoritative Sports.ru row appears in FotMob", async () => {
  const upserts: Array<{ update: { source?: string } }> = [];
  const prisma = {
    coreTeam: { createMany: async () => ({ count: 0 }) },
    corePlayer: { createMany: async () => ({ count: 0 }) },
    teamPlayerSeason: {
      async findMany() {
        return [{
          leagueId: 57n,
          season: "2026/2027",
          teamId: 10229n,
          playerId: 1352213n,
          source: "sports.ru"
        }];
      },
      async upsert(input: { update: { source?: string } }) {
        upserts.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreSeasonRosterRepository(prisma);
  await repository.upsertTeamPlayers([{
    leagueId: 57n,
    season: "2026/2027",
    teamId: 10229n,
    playerId: 1352213n,
    active: true,
    position: "MID",
    shirtNumber: null,
    nationality: null,
    age: null,
    photoUrl: null
  }]);

  assert.equal(upserts[0]?.update.source, "fotmob");
});

test("stale FotMob membership cannot reclaim a player from an official transfer override", async () => {
  const upserts: unknown[] = [];
  const prisma = {
    coreTeam: { createMany: async () => ({ count: 0 }) },
    corePlayer: { createMany: async () => ({ count: 0 }) },
    teamPlayerSeason: {
      async findMany() {
        return [{
          leagueId: 54n,
          season: "2026/2027",
          teamId: 9810n,
          playerId: 1281100n,
          source: OFFICIAL_TRANSFER_ROSTER_SOURCE
        }];
      },
      async upsert(input: unknown) {
        upserts.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreSeasonRosterRepository(prisma);
  await repository.upsertTeamPlayers([{
    leagueId: 54n,
    season: "2026/2027",
    teamId: 8358n,
    playerId: 1281100n,
    active: true,
    position: "GK",
    shirtNumber: 1,
    nationality: "Germany",
    age: 24,
    photoUrl: null
  }]);

  assert.equal(upserts.length, 0);
});

test("FotMob refreshes the target club without removing an official transfer marker", async () => {
  const upserts: Array<{ update: { source?: string; shirtNumber?: number | null } }> = [];
  const prisma = {
    coreTeam: { createMany: async () => ({ count: 0 }) },
    corePlayer: { createMany: async () => ({ count: 0 }) },
    teamPlayerSeason: {
      async findMany() {
        return [{
          leagueId: 54n,
          season: "2026/2027",
          teamId: 9810n,
          playerId: 1281100n,
          source: OFFICIAL_TRANSFER_ROSTER_SOURCE
        }];
      },
      async upsert(input: { update: { source?: string; shirtNumber?: number | null } }) {
        upserts.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreSeasonRosterRepository(prisma);
  await repository.upsertTeamPlayers([{
    leagueId: 54n,
    season: "2026/2027",
    teamId: 9810n,
    playerId: 1281100n,
    active: true,
    position: "GK",
    shirtNumber: 99,
    nationality: "Germany",
    age: 24,
    photoUrl: null
  }]);

  assert.equal(upserts[0]?.update.source, OFFICIAL_TRANSFER_ROSTER_SOURCE);
  assert.equal(upserts[0]?.update.shirtNumber, 99);
});
