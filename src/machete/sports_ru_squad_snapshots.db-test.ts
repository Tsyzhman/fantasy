/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { prisma } from "@/lib/db";
import { loadSportsRuSquadSnapshotStatus, loadStoredSportsRuSquadImportPreview } from "./sports_ru_squad_snapshots";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

test("Sports.ru status and import prefer a published snapshot at the same kickoff", { skip }, async () => {
  const leagueId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 14)}`);
  const userId = randomUUID();
  const providerProfileId = "101";
  const season = "2026/2027";
  const firstMatchAt = new Date("2026-10-30T20:00:00Z");
  const completedAt = new Date("2026-10-30T20:32:00Z");
  const scope = { userId, leagueId, season };
  const tour = {
    ...scope, providerProfileId, firstMatchAt, availableAfter: completedAt,
    providerSeasonId: "80", providerTourId: "2471", roundLabel: "11 тур"
  };
  const selections = [{
    playerId: "123", isStarter: true, isLocked: false, isCaptain: false,
    isViceCaptain: false, slotIndex: 0, purchasePrice: 5
  }];

  await prisma.coreLeague.create({ data: { id: leagueId, name: "Squad snapshot QA", source: "test" } });
  try {
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test` } });
    await prisma.userExternalProfile.create({
      data: { userId, provider: "SPORTS_RU", providerUserId: providerProfileId, profileUrl: "https://www.sports.ru/profile/101/" }
    });
    await prisma.sportsRuSquadSnapshot.createMany({ data: [
      {
        ...tour, roundKey: "sports-ru:tour:12:2471", status: "UNAVAILABLE",
        lastError: "Sports.ru still exposes the preceding published tour."
      },
      {
        ...tour, roundKey: "sports-ru:tour:11:2471", status: "COMPLETE", tourName: "11 тур",
        completedAt, fetchedAt: completedAt, playersCount: 1, mappedPlayersCount: 1, selections
      }
    ] });

    const status = await loadSportsRuSquadSnapshotStatus(prisma, scope);
    assert.equal(status.status, "COMPLETE");
    assert.equal(status.lastError, null);
    const preview = await loadStoredSportsRuSquadImportPreview(prisma, { ...scope, expectedSquadSize: 1 });
    assert.equal(preview.tourId, "2471");
    assert.deepEqual(preview.selections, selections);

    await prisma.sportsRuSquadSnapshot.create({
      data: {
        ...tour, roundKey: "sports-ru:tour:12:2472", providerTourId: "2472", roundLabel: "12 тур",
        firstMatchAt: new Date("2026-11-06T20:00:00Z"), availableAfter: new Date("2026-11-06T20:30:00Z")
      }
    });

    assert.equal((await loadSportsRuSquadSnapshotStatus(prisma, scope)).status, "PENDING");
    await assert.rejects(
      loadStoredSportsRuSquadImportPreview(prisma, { ...scope, expectedSquadSize: 1 }),
      { code: "SPORTS_SNAPSHOT_PENDING" }
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.coreLeague.delete({ where: { id: leagueId } });
  }
});
