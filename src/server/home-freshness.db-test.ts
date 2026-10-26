/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentEuropeanSeason } from "@/machete/fantasy-source-sync-config";
import { loadHomeSourceFreshness } from "./home-freshness";

after(() => prisma.$disconnect());

test("Home reads actual source receipts from generated Prisma queries for active Sports scopes", { skip: !process.env.DATABASE_URL }, async () => {
  const leagueId = 47n, season = currentEuropeanSeason(new Date());
  const receipt = new Date("2026-10-10T12:10:00Z");
  const rollback = new Error("Rollback isolated Home fixture");
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.coreLeague.upsert({ where: { id: leagueId }, update: {}, create: { id: leagueId, name: "Home fixture" } });
    await tx.leagueSeason.upsert({ where: { leagueId_season: { leagueId, season } }, update: { isCurrent: true }, create: { leagueId, season, isCurrent: true } });
    await tx.fantasyContest.upsert({ where: { provider_leagueId_season: { provider: "SPORTS_RU", leagueId, season } }, update: { lastSyncedAt: receipt }, create: { leagueId, season, provider: "SPORTS_RU", name: "Home fixture", lastSyncedAt: receipt } });
    const rows = await loadHomeSourceFreshness(tx as unknown as PrismaClient, randomUUID());
    const row = rows.find(scope => scope.leagueId === leagueId && scope.season === season);
    assert.ok(row, "An active source appears without a saved squad");
    assert.equal(row.isCurrent, true);
    assert.equal(row.sources.prices?.getTime(), receipt.getTime(), "Use the receipt, not season updatedAt");
    assert.deepEqual(Object.keys(row.sources).sort(), ["forecast", "lineups", "prices", "stats"]);
    throw rollback;
  }, { timeout: 15000 }), error => error === rollback);
});
