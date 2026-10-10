/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { FplPublicClient, FPL_LEAGUE_ID, FPL_SEASON, type FplBootstrap } from "@/lib/providers/fpl";
import { syncFplOfficialScores } from "./fpl-official-score-sync";
const skip = !process.env.DATABASE_URL;
after(() => prisma.$disconnect());

test("identical official payload applies a new exact mapping, then skips without duplicates", { skip }, async () => {
  await prisma.coreLeague.upsert({ where: { id: FPL_LEAGUE_ID }, create: { id: FPL_LEAGUE_ID, name: "England", country: "England" }, update: {} });
  const existing = await prisma.fantasyContest.findUnique({ where: { provider_leagueId_season: { provider: "FPL", leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } } });
  const contest = existing ?? await prisma.fantasyContest.create({ data: { provider: "FPL", leagueId: FPL_LEAGUE_ID, season: FPL_SEASON, name: "FPL test" } });
  const providerPlayerId = "audit-fixture";
  const playerId = 9999912345n;
  const now = new Date("2026-10-10T12:00:00Z");
  await prisma.corePlayer.upsert({ where: { id: playerId }, create: { id: playerId, name: "Exact ID test" }, update: {} });
  const price = await prisma.fantasyPlayerPrice.create({ data: { contestId: contest.id, provider: "FPL", leagueId: FPL_LEAGUE_ID,
    season: FPL_SEASON, providerPlayerId, playerName: "Exact ID test", normalizedName: "exact", price: 5, position: "MID" } });
  const client = new FplPublicClient();
  client.getBootstrap = async () => ({ fetchedAt: now, teams: [], elements: [], elementTypes: [], chips: [], gameConfig: {},
    events: [{ id: 5, name: "GW5", deadlineTime: new Date("2026-09-01"), finished: true, isPrevious: true, isCurrent: false,
      isNext: false, released: true, dataChecked: true }] } satisfies FplBootstrap);
  client.getLiveEvent = async () => ({ gameweek: 5, payload: { fixture: "same" },
    elements: [{ providerPlayerId, points: 13, stats: { minutes: 90 }, fixtureBreakdowns: [] }] });
  try {
    const first = await syncFplOfficialScores(prisma, { gameweek: 5, client, now });
    assert.equal(first.unmatchedRows, 1);
    await prisma.fantasyPlayerPrice.update({ where: { id: price.id }, data: { playerId } });
    const second = await syncFplOfficialScores(prisma, { gameweek: 5, client, now });
    assert.equal(second.mappedRows, 1);
    const rows = await prisma.fantasyProviderPlayerMatchScore.findMany({ where: { contestId: contest.id, providerPlayerId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].playerId, playerId);
    assert.equal(rows[0].points, 13);
    assert.deepEqual(rows[0].breakdown, { minutes: 90, fixture_breakdowns: [] });
    const third = await syncFplOfficialScores(prisma, { gameweek: 5, client, now });
    assert.equal(third.status, "SKIPPED");
    assert.equal(third.mappedRows, 1);
  } finally {
    await prisma.fantasyProviderPlayerMatchScore.deleteMany({ where: { contestId: contest.id, providerPlayerId } });
    await prisma.fantasyProviderSyncRun.deleteMany({ where: { contestId: contest.id, jobType: "FPL_OFFICIAL_SCORE_SYNC", payloadHash:
      (await import("node:crypto")).createHash("sha256").update(JSON.stringify({ fixture: "same" })).digest("hex") } });
    await prisma.fantasyPlayerPrice.delete({ where: { id: price.id } });
    await prisma.corePlayer.delete({ where: { id: playerId } });
    if (!existing) await prisma.fantasyContest.delete({ where: { id: contest.id } });
  }
});
