import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import type { FotMobClient } from "./fotmob_client";
import { aggregateCompletedCanonicalScopes, buildIncrementalScopes, runSequentialScopesIndependently } from "./ingestion-jobs";
import { selectLatestIngestionAttempt } from "../machete/planner_readiness";
import { createIngestionScope } from "./ingestion-scope";

test("league scopes run sequentially and a failed league does not stop later leagues", async () => {
  const events: string[] = [];
  let activeScopes = 0;
  let maximumConcurrentScopes = 0;

  const result = await runSequentialScopesIndependently(
    [42, 63, 47],
    0,
    async (leagueId) => {
      activeScopes += 1;
      maximumConcurrentScopes = Math.max(maximumConcurrentScopes, activeScopes);
      events.push(`start:${leagueId}`);
      try {
        await Promise.resolve();
        if (leagueId === 63) throw new Error("league 63 failed");
        events.push(`complete:${leagueId}`);
      } finally {
        activeScopes -= 1;
      }
    },
    async (leagueId, _scopeIndex, error) => {
      events.push(`error:${leagueId}:${error instanceof Error ? error.message : "unknown"}`);
    }
  );

  assert.equal(result.stopped, false);
  assert.equal(maximumConcurrentScopes, 1);
  assert.deepEqual(events, [
    "start:42",
    "complete:42",
    "start:63",
    "error:63:league 63 failed",
    "start:47",
    "complete:47"
  ]);
});

test("explicit cancellation still stops the sequential scope runner", async () => {
  const visited: number[] = [];
  const result = await runSequentialScopesIndependently(
    [42, 63, 47],
    0,
    async (leagueId) => {
      visited.push(leagueId);
      return leagueId === 63 ? "stop" : "continue";
    },
    async () => {
      throw new Error("cancellation is not a scope failure");
    }
  );

  assert.equal(result.stopped, true);
  assert.deepEqual(visited, [42, 63]);
});

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

test("a failed tournament does not invalidate successful RPL evidence from the same job", () => {
  const mixedJob = {
    id: "mixed-result",
    status: "completed_with_errors",
    startedAt: new Date("2026-07-30T00:00:00.000Z"),
    finishedAt: new Date("2026-07-30T00:20:00.000Z"),
    currentSeason: null,
    metadata: {
      completed_canonical_scopes: [
        { league_id: 42, season: "2026/2027", status: "completed_with_errors", upcoming_fixtures_discovered: 0 },
        { league_id: 63, season: "2026/2027", status: "completed", upcoming_fixtures_discovered: 232 }
      ]
    }
  };

  const selected = selectLatestIngestionAttempt([mixedJob], 63n, "2026/2027");

  assert.equal(selected?.job.id, "mixed-result");
  assert.equal(selected?.evidence.status, "completed");
  assert.equal(selected?.evidence.upcoming_fixtures_discovered, 232);
});
