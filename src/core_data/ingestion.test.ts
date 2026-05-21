import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { FotMobFixtureDetailsUnavailableError, type FotMobClient } from "./fotmob_client";
import { run_next_ingestion_job } from "./ingestion-jobs";
import { discover_matches_for_scope, ingest_match } from "./ingestion";
import { createIngestionScope } from "./ingestion-scope";
import { CorePlayerRepository, CoreStatsRepository } from "./repositories";
import { ScopeTooBroadError } from "./scope-validation";

test("scope discovery uses league-season fixtures only and does not load team history", async () => {
  const calls: string[] = [];
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      calls.push("getTeams");
      throw new Error("team history discovery is forbidden");
    },
    async getFixtures(leagueId, season) {
      calls.push(`getFixtures:${leagueId}:${season}`);
      return [
        {
          id: "1",
          leagueId,
          homeTeamId: "10",
          awayTeamId: "20",
          kickoffAt: "2023-08-01T12:00:00.000Z",
          status: "FINISHED",
          homeScore: 1,
          awayScore: 0
        }
      ];
    },
    async getFixtureDetails() {
      throw new Error("detail fetching should happen after discovery validation");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  const matches = await discover_matches_for_scope(client, createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 }));

  assert.equal(matches.length, 1);
  assert.deepEqual(calls, ["getFixtures:47:2023/2024"]);
});

test("scope validation blocks before matchDetails fetching", async () => {
  let detailsFetched = false;
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures(leagueId) {
      return Array.from({ length: 701 }, (_, index) => ({
        id: String(index + 1),
        leagueId,
        homeTeamId: "10",
        awayTeamId: "20",
        kickoffAt: "2023-08-01T12:00:00.000Z",
        status: "FINISHED" as const,
        homeScore: 1,
        awayScore: 0
      }));
    },
    async getFixtureDetails() {
      detailsFetched = true;
      throw new Error("should not fetch details");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  await assert.rejects(
    discover_matches_for_scope(client, createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 })),
    ScopeTooBroadError
  );
  assert.equal(detailsFetched, false);
});

test("unavailable FotMob matchDetails are skipped instead of failed", async () => {
  const prisma = {
    coreMatch: {
      async findUnique() {
        return null;
      }
    },
    rawMatchPayload: {
      async findUnique() {
        return null;
      }
    }
  } as unknown as PrismaClient;
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures() {
      throw new Error("not used");
    },
    async getFixtureDetails(fixtureId) {
      throw new FotMobFixtureDetailsUnavailableError(fixtureId, "empty payload");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  const result = await ingest_match(prisma, "1000008820", { client });

  assert.equal(result.matchId, 1000008820n);
  assert.equal(result.fetched, false);
  assert.equal(result.skipped, true);
});

test("required detailed FotMob matchDetails fail instead of creating partial data", async () => {
  const prisma = {
    coreMatch: {
      async findUnique() {
        return null;
      }
    },
    rawMatchPayload: {
      async findUnique() {
        return null;
      }
    }
  } as unknown as PrismaClient;
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures() {
      throw new Error("not used");
    },
    async getFixtureDetails(fixtureId) {
      throw new FotMobFixtureDetailsUnavailableError(fixtureId, "match page payload id mismatch: 4813704");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  await assert.rejects(
    ingest_match(prisma, "4813417", { client, requireDetailedPayload: true }),
    /requires detailed match payloads/
  );
});

test("non-browser workers leave current league 47 backfills queued", async () => {
  const previousMode = process.env.MACHETE_FOTMOB_PROVIDER_MODE;
  process.env.MACHETE_FOTMOB_PROVIDER_MODE = "unofficial";
  let findUniqueCalled = false;
  const prisma = {
    ingestionJob: {
      async findFirst() {
        return {
          id: "job-current-47",
          jobType: "initial_backfill",
          status: "pending",
          startedByUserId: null,
          startedAt: new Date("2026-05-21T12:00:00.000Z"),
          finishedAt: null,
          totalScopes: 1,
          processedScopes: 0,
          totalMatches: 0,
          fetchedMatches: 0,
          skippedMatches: 0,
          failedMatches: 0,
          currentLeagueId: 47n,
          currentSeason: "2025/2026",
          currentMatchId: null,
          errorMessage: null,
          metadata: { backfill_mode: "current_league_47" },
          createdAt: new Date("2026-05-21T12:00:00.000Z"),
          updatedAt: new Date("2026-05-21T12:00:00.000Z")
        };
      },
      async findUnique() {
        findUniqueCalled = true;
        throw new Error("wrong worker should not claim this job");
      }
    }
  } as unknown as PrismaClient;

  try {
    const result = await run_next_ingestion_job(prisma);
    assert.equal(result.ran, false);
    assert.equal(result.job?.id, "job-current-47");
    assert.equal(findUniqueCalled, false);
  } finally {
    if (previousMode === undefined) {
      delete process.env.MACHETE_FOTMOB_PROVIDER_MODE;
    } else {
      process.env.MACHETE_FOTMOB_PROVIDER_MODE = previousMode;
    }
  }
});

test("browser worker leaves full backfills for the regular worker", async () => {
  const previousMode = process.env.MACHETE_FOTMOB_PROVIDER_MODE;
  process.env.MACHETE_FOTMOB_PROVIDER_MODE = "browser";
  let findUniqueCalled = false;
  const prisma = {
    ingestionJob: {
      async findFirst() {
        return {
          id: "job-full",
          jobType: "initial_backfill",
          status: "pending",
          startedByUserId: null,
          startedAt: new Date("2026-05-21T12:00:00.000Z"),
          finishedAt: null,
          totalScopes: 201,
          processedScopes: 0,
          totalMatches: 0,
          fetchedMatches: 0,
          skippedMatches: 0,
          failedMatches: 0,
          currentLeagueId: null,
          currentSeason: null,
          currentMatchId: null,
          errorMessage: null,
          metadata: { backfill_mode: "full" },
          createdAt: new Date("2026-05-21T12:00:00.000Z"),
          updatedAt: new Date("2026-05-21T12:00:00.000Z")
        };
      },
      async findUnique() {
        findUniqueCalled = true;
        throw new Error("browser worker should not claim full jobs");
      }
    }
  } as unknown as PrismaClient;

  try {
    const result = await run_next_ingestion_job(prisma);
    assert.equal(result.ran, false);
    assert.equal(result.job?.id, "job-full");
    assert.equal(findUniqueCalled, false);
  } finally {
    if (previousMode === undefined) {
      delete process.env.MACHETE_FOTMOB_PROVIDER_MODE;
    } else {
      process.env.MACHETE_FOTMOB_PROVIDER_MODE = previousMode;
    }
  }
});

test("shallow FotMob payloads are not marked final raw payloads", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreLeague: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreTeam: {
      async upsert() {
        return {};
      },
      async createMany() {
        return {};
      }
    },
    corePlayer: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreMatch: {
      async upsert() {
        return {};
      }
    },
    matchTeamStat: {
      async upsert() {
        return {};
      }
    },
    matchPlayerStat: {
      async upsert() {
        return {};
      }
    },
    matchEvent: {
      async deleteMany() {
        return {};
      }
    },
    matchShot: {
      async upsert() {
        return {};
      }
    },
    rawMatchPayload: {
      async upsert(input: unknown) {
        calls.push(input);
        return {};
      }
    },
    shotmapComparisonsCache: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;

  const { persist_match_payload } = await import("./ingestion");
  await persist_match_payload(
    prisma,
    {
      id: 1001,
      leagueId: 47,
      home: { id: 10, name: "Home FC", score: 1 },
      away: { id: 20, name: "Away FC", score: 0 },
      status: { finished: true, started: true, utcTime: "2026-05-01T18:00:00.000Z" }
    },
    { matchId: 1001n, fetched: true }
  );

  const rawUpsert = calls[0] as { update?: { isFinal?: boolean }; create?: { isFinal?: boolean } };
  assert.equal(rawUpsert.update?.isFinal, false);
  assert.equal(rawUpsert.create?.isFinal, false);
});

test("match payload persistence creates placeholder teams for player stat team references", async () => {
  const placeholderCalls: unknown[] = [];
  const playerStatCalls: unknown[] = [];
  const prisma = {
    coreLeague: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreTeam: {
      async upsert() {
        return {};
      },
      async createMany(input: unknown) {
        placeholderCalls.push(input);
        return {};
      }
    },
    corePlayer: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreMatch: {
      async upsert() {
        return {};
      }
    },
    matchTeamStat: {
      async upsert() {
        return {};
      }
    },
    matchPlayerStat: {
      async upsert(input: unknown) {
        playerStatCalls.push(input);
        return {};
      }
    },
    matchEvent: {
      async deleteMany() {
        return {};
      }
    },
    matchShot: {
      async upsert() {
        return {};
      }
    },
    rawMatchPayload: {
      async upsert() {
        return {};
      }
    },
    shotmapComparisonsCache: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;

  const { persist_match_payload } = await import("./ingestion");
  await persist_match_payload(
    prisma,
    {
      id: 1002,
      leagueId: 47,
      home: { id: 10, name: "Home FC", score: 1 },
      away: { id: 20, name: "Away FC", score: 0 },
      status: { finished: true, started: true, utcTime: "2026-05-01T18:00:00.000Z" },
      playerStats: [{ id: 999, name: "Loose Team Player", teamId: 30, stats: { minutes: 90 } }]
    },
    { matchId: 1002n, fetched: true }
  );

  const createMany = placeholderCalls[0] as { data?: Array<{ id: bigint; name: string }> };
  assert.ok(createMany.data?.some((team) => team.id === 30n && team.name === "FotMob team 30"));
  assert.equal(playerStatCalls.length, 1);
});

test("match payload persistence repairs player stat team links from shot ownership", async () => {
  const playerStatCalls: unknown[] = [];
  const prisma = {
    coreLeague: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreTeam: {
      async upsert() {
        return {};
      },
      async createMany() {
        return {};
      }
    },
    corePlayer: {
      async createMany() {
        return {};
      },
      async upsert() {
        return {};
      }
    },
    coreMatch: {
      async upsert() {
        return {};
      }
    },
    matchTeamStat: {
      async upsert() {
        return {};
      }
    },
    matchPlayerStat: {
      async upsert(input: unknown) {
        playerStatCalls.push(input);
        return {};
      }
    },
    matchEvent: {
      async deleteMany() {
        return {};
      }
    },
    matchShot: {
      async upsert() {
        return {};
      }
    },
    rawMatchPayload: {
      async upsert() {
        return {};
      }
    },
    shotmapComparisonsCache: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;

  const { persist_match_payload } = await import("./ingestion");
  const result = await persist_match_payload(
    prisma,
    {
      id: 1003,
      leagueId: 47,
      home: { id: 10, name: "Home FC", score: 1 },
      away: { id: 20, name: "Away FC", score: 0 },
      status: { finished: true, started: true, utcTime: "2026-05-01T18:00:00.000Z" },
      playerStats: [{ id: 777, name: "Shot Linked Player", stats: { minutes: 90 } }],
      content: {
        shotmap: {
          shots: [{ matchId: 1003, teamId: 10, playerId: 777, playerName: "Shot Linked Player", x: 90, y: 50 }]
        }
      }
    },
    { matchId: 1003n, fetched: true }
  );

  const call = playerStatCalls[0] as { create?: { teamId?: bigint | null; opponentTeamId?: bigint | null } };
  assert.equal(call.create?.teamId, 10n);
  assert.equal(call.create?.opponentTeamId, 20n);
  assert.equal(result.dataQuality.repaired.playerStatsTeamIds, 1);
  assert.equal(result.dataQuality.dropped.playerStats, 0);
});

test("player placeholder creation ignores invalid ids and deduplicates references", async () => {
  const calls: unknown[] = [];
  const prisma = {
    corePlayer: {
      async createMany(input: unknown) {
        calls.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  await new CorePlayerRepository(prisma).ensurePlaceholders([7001n, 0n, null, undefined, 7001n, 7002n]);

  const createMany = calls[0] as { data?: Array<{ id: bigint; name: string }> };
  assert.deepEqual(createMany.data?.map((player) => player.id), [7001n, 7002n]);
  assert.ok(createMany.data?.every((player) => player.name.startsWith("FotMob player ")));
});

test("stats repositories skip invalid required ids and null invalid optional relation ids", async () => {
  const teamStatCalls: unknown[] = [];
  const playerStatCalls: unknown[] = [];
  const prisma = {
    coreTeam: {
      async createMany() {
        return {};
      }
    },
    corePlayer: {
      async createMany() {
        return {};
      }
    },
    matchTeamStat: {
      async upsert(input: unknown) {
        teamStatCalls.push(input);
        return {};
      }
    },
    matchPlayerStat: {
      async upsert(input: unknown) {
        playerStatCalls.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;
  const repository = new CoreStatsRepository(prisma);

  await repository.upsertTeamStats([
    { matchId: 1n, teamId: 0n, opponentTeamId: 10n },
    { matchId: 1n, teamId: 20n, opponentTeamId: 0n }
  ] as never);
  await repository.upsertPlayerStats([
    { matchId: 1n, playerId: 0n, teamId: 20n, opponentTeamId: 30n },
    { matchId: 1n, playerId: 7001n, teamId: 0n, opponentTeamId: 0n }
  ] as never);

  assert.equal(teamStatCalls.length, 1);
  assert.equal((teamStatCalls[0] as { create?: { opponentTeamId?: bigint | null } }).create?.opponentTeamId, null);
  assert.equal(playerStatCalls.length, 1);
  assert.equal((playerStatCalls[0] as { create?: { teamId?: bigint | null; opponentTeamId?: bigint | null } }).create?.teamId, null);
  assert.equal((playerStatCalls[0] as { create?: { teamId?: bigint | null; opponentTeamId?: bigint | null } }).create?.opponentTeamId, null);
});
