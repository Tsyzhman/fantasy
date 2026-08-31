import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { fantasySquadLeagueFotMobIds } from "@/lib/leagues/display";
import { forecastSyncIntervalMs, loadFantasyModelForecastScopes } from "@/server/fantasy-model-forecast-scheduler";

test("recalculation interval honors the configured hours and clamps below the minimum", () => {
  assert.equal(forecastSyncIntervalMs(undefined), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("1"), 3_600_000);
  assert.equal(forecastSyncIntervalMs("0.5"), Math.round(0.5 * 3_600_000));
  assert.equal(forecastSyncIntervalMs("0.01"), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("not-a-number"), 6 * 3_600_000);
});

test("forecast scopes use Squad leagues and current seasons without scanning player memberships", async () => {
  const calls: unknown[] = [];
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
  ], calls);

  const scopes = await loadFantasyModelForecastScopes(prisma);

  assert.deepEqual(scopes, [
    { leagueId: 47n, season: "2026/2027" },
    { leagueId: 48n, season: "2026/2027" }
  ]);
  assert.deepEqual(calls, [{
    where: { teams: { some: { active: true } } },
    include: { league: true },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  }]);
});

test("forecast scopes automatically follow the shared Squad allowlist", async () => {
  const prisma = scopePrisma([
    ...fantasySquadLeagueFotMobIds.map((id) => leagueSeason(BigInt(id), "2026/2027", true)),
    leagueSeason(132n, "2026/2027", true)
  ]);

  const scopes = await loadFantasyModelForecastScopes(prisma);

  assert.deepEqual(scopes.map((scope) => String(scope.leagueId)), [...fantasySquadLeagueFotMobIds]);
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
  const prisma = {
    leagueSeason: { async findMany() { return rows; } }
  } as unknown as PrismaClient;

  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), [{ leagueId: 47n, season: "2026/2027" }]);
  rows = [leagueSeason(48n, "2026/2027", true)];
  assert.deepEqual(await loadFantasyModelForecastScopes(prisma), [{ leagueId: 48n, season: "2026/2027" }]);
});

test("forecast scope lookup failure does not fall back to all active player memberships", async () => {
  const prisma = {
    leagueSeason: { async findMany() { throw new Error("scope lookup unavailable"); } },
    teamPlayerSeason: { async findMany() { assert.fail("must not scan player memberships"); } }
  } as unknown as PrismaClient;

  await assert.rejects(loadFantasyModelForecastScopes(prisma), /scope lookup unavailable/);
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

function scopePrisma(rows: ReturnType<typeof leagueSeason>[], calls: unknown[] = []) {
  return {
    leagueSeason: { async findMany(input: unknown) { calls.push(input); return rows; } },
    teamPlayerSeason: { async findMany() { assert.fail("must not scan player memberships"); } }
  } as unknown as PrismaClient;
}
