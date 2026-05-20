import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { FotMobFixtureDetailsUnavailableError, type FotMobClient } from "./fotmob_client";
import { discover_matches_for_scope, ingest_match } from "./ingestion";
import { createIngestionScope } from "./ingestion-scope";
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

test("shallow FotMob payloads are not marked final raw payloads", async () => {
  const calls: unknown[] = [];
  const prisma = {
    coreLeague: {
      async upsert() {
        return {};
      }
    },
    coreTeam: {
      async upsert() {
        return {};
      }
    },
    corePlayer: {
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
