/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { refreshKhlCatalogs } from "./catalog-scheduler";

after(() => prisma.$disconnect());
test("catalog refresh keeps unchanged observations bounded and publishes corrections", {
  skip: !(process.env.KHL_TEST_DATABASE === "true" && process.env.DATABASE_URL?.includes("127.0.0.1:55439/khl_test"))
}, async () => {
  const key = randomUUID();
  const competition = await prisma.khlCompetition.create({ data: { code: key } });
  const season = await prisma.khlSeason.create({ data: { competitionId: competition.id, seasonKey: key, label: "TEST" } });
  const contest = await prisma.khlContest.create({ data: { seasonId: season.id, providerContestId: "999998", name: "TEST" } });
  const payload = { players: Array.from({ length: 694 }, (_, i) => ({ id: i + 1, club_id: i % 22 + 1, club: `Club ${i % 22}`, amplua: i % 3 + 1, sport_name: "hockey", name: `Player ${i}`, price: "500", delta: "0", lock: "0" })) };
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.KHL_SYNC_ENABLED, originalIds = process.env.KHL_CATALOG_CONTEST_IDS;
  process.env.KHL_SYNC_ENABLED = "true"; process.env.KHL_CATALOG_CONTEST_IDS = "999998";
  globalThis.fetch = async () => Response.json(payload);
  try {
    const receiptWhere = { streamId: { startsWith: `SPORTS_RU:catalog:${contest.id}:` } };
    await refreshKhlCatalogs();
    const first = await prisma.khlContest.findUniqueOrThrow({ where: { id: contest.id } });
    assert.equal(await prisma.khlFantasyPlayer.count({ where: { contestId: contest.id } }), 694);
    assert.equal(await prisma.khlObservationReceipt.count({ where: receiptWhere }), 694);
    await refreshKhlCatalogs();
    const second = await prisma.khlContest.findUniqueOrThrow({ where: { id: contest.id } });
    assert.equal(second.revision, first.revision);
    assert.equal(second.publishedAt?.getTime(), first.publishedAt?.getTime());
    assert.ok(second.catalogCheckedAt! > first.catalogCheckedAt!);
    assert.equal((await prisma.khlFantasyPlayer.findFirstOrThrow({ where: { contestId: contest.id } })).observedAt.getTime(), first.publishedAt!.getTime());
    assert.equal(await prisma.khlObservationReceipt.count({ where: receiptWhere }), 694);
    payload.players[0].price = "600";
    await refreshKhlCatalogs();
    assert.equal((await prisma.khlContest.findUniqueOrThrow({ where: { id: contest.id } })).revision, first.revision + 1);
    assert.equal(await prisma.khlFantasyPlayer.count({ where: { contestId: contest.id } }), 694);
    assert.equal(await prisma.khlSyncJob.count({ where: { scope: contest.id, status: "DONE" } }), 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.KHL_SYNC_ENABLED; else process.env.KHL_SYNC_ENABLED = originalFlag;
    if (originalIds === undefined) delete process.env.KHL_CATALOG_CONTEST_IDS; else process.env.KHL_CATALOG_CONTEST_IDS = originalIds;
  }
});
