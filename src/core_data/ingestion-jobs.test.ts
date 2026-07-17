import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import type { FotMobClient } from "./fotmob_client";
import { aggregateCompletedCanonicalScopes, buildIncrementalScopes } from "./ingestion-jobs";
import { selectLatestIngestionAttempt } from "../machete/planner_readiness";
import { createIngestionScope } from "./ingestion-scope";

test("job-level incremental scopes retain upcoming fixtures for a targeted league", async () => {
  const prisma = {
    leagueSeason: {
      async findMany() {
        return [];
      }
    },
    coreLeague: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;
  const client = {
    async getLeague(leagueId: string) {
      assert.equal(leagueId, "47");
      return { id: leagueId, name: "Premier League", season: "2026/2027" };
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures() {
      throw new Error("not used");
    },
    async getFixtureDetails() {
      throw new Error("not used");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  } satisfies FotMobClient;

  const scopes = await buildIncrementalScopes(prisma, client, [47]);

  assert.equal(scopes.length, 1);
  assert.equal(scopes[0].league_id, 47);
  assert.equal(scopes[0].season, "2026/2027");
  assert.equal(scopes[0].include_upcoming, true);
});

test("targeted incremental scopes reject disabled or unknown leagues", async () => {
  const prisma = {
    leagueSeason: { async findMany() { return []; } },
    coreLeague: { async findMany() { return []; } }
  } as unknown as PrismaClient;
  const client = {} as FotMobClient;

  await assert.rejects(buildIncrementalScopes(prisma, client, [999999]), /disabled or unknown league ids/);
});

test("canonical scope evidence fails when any required alias scope fails", () => {
  const scopes = [
    createIngestionScope({ league_id: 47, season: "2026/2027" }),
    { ...createIngestionScope({ league_id: 90047, season: "2026/2027" }), canonical_league_id: 47 }
  ];
  const completed = [
    {
      source_league_id: 47,
      canonical_league_id: 47,
      season: "2026/2027",
      status: "completed",
      roster_synced: true,
      fixture_failures: 0,
      fixtures_discovered: 380,
      upcoming_fixtures_discovered: 380,
      minimum_fixtures_required: 380,
      finished_at: "2026-07-17T09:00:00.000Z"
    },
    {
      source_league_id: 90047,
      canonical_league_id: 47,
      season: "2026/2027",
      status: "completed_with_errors",
      roster_synced: false,
      fixture_failures: 0,
      fixtures_discovered: 0,
      upcoming_fixtures_discovered: 0,
      minimum_fixtures_required: 1,
      finished_at: "2026-07-17T09:05:00.000Z"
    }
  ];

  const evidence = aggregateCompletedCanonicalScopes(scopes, completed);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].status, "completed_with_errors");
  assert.deepEqual(evidence[0].source_league_ids, [47, 90047]);
  assert.equal(evidence[0].upcoming_fixtures_discovered, 380);
});

test("canonical scope evidence deduplicates fixture ids across successful aliases", () => {
  const scopes = [
    createIngestionScope({ league_id: 47, season: "2026/2027" }),
    { ...createIngestionScope({ league_id: 90047, season: "2026/2027" }), canonical_league_id: 47 }
  ];
  const completed = [
    {
      source_league_id: 47,
      canonical_league_id: 47,
      season: "2026/2027",
      status: "completed",
      roster_synced: true,
      fixture_failures: 0,
      fixtures_discovered: 2,
      upcoming_fixtures_discovered: 2,
      fixture_ids: ["1", "2"],
      upcoming_fixture_ids: ["1", "2"],
      minimum_fixtures_required: 1,
      finished_at: "2026-07-17T09:00:00.000Z"
    },
    {
      source_league_id: 90047,
      canonical_league_id: 47,
      season: "2026/2027",
      status: "completed",
      roster_synced: true,
      fixture_failures: 0,
      fixtures_discovered: 2,
      upcoming_fixtures_discovered: 2,
      fixture_ids: ["2", "3"],
      upcoming_fixture_ids: ["2", "3"],
      minimum_fixtures_required: 1,
      finished_at: "2026-07-17T09:05:00.000Z"
    }
  ];

  const evidence = aggregateCompletedCanonicalScopes(scopes, completed);

  assert.equal(evidence[0].status, "completed");
  assert.equal(evidence[0].fixtures_discovered, 3);
  assert.equal(evidence[0].upcoming_fixtures_discovered, 3);
});

test("a newer failed exact ingestion attempt invalidates an older success", () => {
  const olderSuccess = {
    id: "success",
    status: "completed",
    startedAt: new Date("2026-07-17T08:00:00.000Z"),
    finishedAt: new Date("2026-07-17T09:00:00.000Z"),
    currentSeason: null,
    metadata: {
      completed_canonical_scopes: [
        { league_id: 47, season: "2026/2027", status: "completed", upcoming_fixtures_discovered: 380 }
      ]
    }
  };
  const newerFailure = {
    id: "failure",
    status: "failed",
    startedAt: new Date("2026-07-17T10:00:00.000Z"),
    finishedAt: new Date("2026-07-17T10:05:00.000Z"),
    currentSeason: "2026/2027",
    metadata: { current_scope_canonical_league_id: 47 }
  };

  const selected = selectLatestIngestionAttempt([newerFailure, olderSuccess], 47n, "2026/2027");

  assert.equal(selected?.job.id, "failure");
  assert.equal(selected?.evidence.status, "failed");
});
