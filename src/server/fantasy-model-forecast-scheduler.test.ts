import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { fantasySquadLeagueFotMobIds } from "@/lib/leagues/display";
import {
  collectFantasyModelForecastGarbage,
  forecastSyncIntervalMs,
  loadFantasyModelForecastScopes
} from "@/server/fantasy-model-forecast-scheduler";

test("recalculation interval honors the configured hours and clamps below the minimum", () => {
  assert.equal(forecastSyncIntervalMs(undefined), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("1"), 3_600_000);
  assert.equal(forecastSyncIntervalMs("0.5"), Math.round(0.5 * 3_600_000));
  assert.equal(forecastSyncIntervalMs("0.01"), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("not-a-number"), 6 * 3_600_000);
});

test("forecast scopes use Squad leagues and current seasons without scanning player memberships", async () => {
  const leagueCalls: unknown[] = [];
  const contestCalls: unknown[] = [];
  const prisma = scopePrisma([
    leagueSeason(48n, "2026/2027", true),
    leagueSeason(47n, "2024/2025", false),
    leagueSeason(47n, "2025/2026", false),
    leagueSeason(47n, "2026/2027", true),
    leagueSeason(48n, "2026/2027", true),
    leagueSeason(132n, "2026/2027", true),
    leagueSeason(133n, "2026/2027", true),
    leagueSeason(77n, "2026", true),
    leagueSeason(87n, "2025/2026", false)
  ], {
    contestScopes: [contestScope(47n), contestScope(48n)],
    leagueCalls,
    contestCalls
  });

  const scopes = await loadFantasyModelForecastScopes(prisma);

  assert.deepEqual(scopes, [
    { leagueId: 47n, season: "2026/2027" },
    { leagueId: 48n, season: "2026/2027" }
  ]);
  assert.deepEqual(leagueCalls, [{
    where: { teams: { some: { active: true } } },
    include: { league: true },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  }]);
  assert.deepEqual(contestCalls, [{
    where: {
      provider: "SPORTS_RU",
      OR: [
        { leagueId: 47n, season: "2026/2027" },
        { leagueId: 48n, season: "2026/2027" }
      ]
    },
    select: { leagueId: true, season: true }
  }]);
});

test("forecast scopes intersect the shared Squad allowlist with active Sports.ru contests", async () => {
  const activeContestIds = fantasySquadLeagueFotMobIds.filter((id) => id !== "42" && id !== "73");
  const prisma = scopePrisma([
    ...fantasySquadLeagueFotMobIds.map((id) => leagueSeason(BigInt(id), "2026/2027", true)),
    leagueSeason(132n, "2026/2027", true)
  ], { contestScopes: activeContestIds.map((id) => contestScope(BigInt(id))) });

  const scopes = await loadFantasyModelForecastScopes(prisma);

  assert.deepEqual(scopes.map((scope) => String(scope.leagueId)), activeContestIds);
  assert.ok(!scopes.some((scope) => scope.leagueId === 42n || scope.leagueId === 73n));
});

test("forecast scopes keep one default current season per Squad league", async () => {
  const prisma = scopePrisma([
    leagueSeason(47n, "2025/2026", true, "2026-08-31T12:00:00Z"),
    leagueSeason(47n, "2026/2027", true, "2026-08-01T00:00:00Z"),
    leagueSeason(47n, "2027/2028", false, "2026-08-31T12:00:00Z")
  ]);

  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), [
    { leagueId: 47n, season: "2026/2027" }
  ]);
});

test("forecast scopes never fall back to archived seasons or unrelated tournaments", async () => {
  const prisma = scopePrisma([
    leagueSeason(47n, "2025/2026", false),
    leagueSeason(48n, "2024/2025", false),
    leagueSeason(42n, "2025/2026", false),
    leagueSeason(132n, "2026/2027", true)
  ]);

  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), []);
  assert.deepEqual(await loadFantasyModelForecastScopes(scopePrisma([])), []);
});

test("forecast scope selection is refreshed each cycle without retaining a cached league list", async () => {
  let rows = [leagueSeason(47n, "2026/2027", true)];
  let contests = [contestScope(47n)];
  const prisma = {
    leagueSeason: { async findMany() { return rows; } },
    fantasyContest: { async findMany() { return contests; } }
  } as unknown as PrismaClient;

  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), [{ leagueId: 47n, season: "2026/2027" }]);
  rows = [leagueSeason(48n, "2026/2027", true)];
  contests = [contestScope(48n)];
  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), [{ leagueId: 48n, season: "2026/2027" }]);
});

test("forecast scope lookup failure does not fall back to all active player memberships", async () => {
  const prisma = {
    leagueSeason: { async findMany() { throw new Error("scope lookup unavailable"); } },
    teamPlayerSeason: { async findMany() { assert.fail("must not scan player memberships"); } }
  } as unknown as PrismaClient;

  await assert.rejects(loadFantasyModelForecastScopes(prisma), /scope lookup unavailable/);
});

test("forecast working-set collection is optional and invokes the exposed collector once", () => {
  let calls = 0;
  assert.equal(collectFantasyModelForecastGarbage(null), false);
  assert.equal(collectFantasyModelForecastGarbage(() => { calls += 1; }), true);
  assert.equal(calls, 1);
});

function leagueSeason(leagueId: bigint, season: string, isCurrent: boolean, updatedAt = "2026-08-31T00:00:00Z") {
  return {
    leagueId,
    season,
    isCurrent,
    updatedAt: new Date(updatedAt),
    name: null,
    country: null,
    league: { id: leagueId, name: `League ${leagueId}`, country: "England" }
  };
}

function contestScope(leagueId: bigint, season = "2026/2027") {
  return { leagueId, season };
}

function scopePrisma(rows: ReturnType<typeof leagueSeason>[], options: {
  contestScopes?: ReturnType<typeof contestScope>[];
  leagueCalls?: unknown[];
  contestCalls?: unknown[];
} = {}) {
  const contests = options.contestScopes ?? rows.map((row) => contestScope(row.leagueId, row.season));
  return {
    leagueSeason: { async findMany(input: unknown) { options.leagueCalls?.push(input); return rows; } },
    fantasyContest: {
      async findMany(input: unknown) {
        options.contestCalls?.push(input);
        return contests;
      }
    },
    teamPlayerSeason: { async findMany() { assert.fail("must not scan player memberships"); } }
  } as unknown as PrismaClient;
}
