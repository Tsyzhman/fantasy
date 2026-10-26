/** @spec spec://modules/machete/FEAT-006-sports-popularity#data */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { createOwnershipSnapshot } from "./ownership";
const skip = !process.env.DATABASE_URL;
after(() => prisma.$disconnect());

test("ten parallel publications create one complete ownership snapshot", { skip }, async () => {
  const contestId = `isolated-${randomUUID()}`;
  const observedAt = new Date("2026-10-10T10:00:00Z");
  const entries = Array.from({ length: 15 }, (_, index) => ({
    providerPlayerId: String(index), playerId: null, playerName: `Player ${index}`, teamName: null, positionLabel: null, value: index
  }));
  const results = await Promise.all(Array.from({ length: 10 }, () => createOwnershipSnapshot(prisma, contestId, "test", observedAt, entries,
    { category: "OWNERSHIP", metricKind: "ownership_percent", unit: "percent", statusReason: "fixture" })));
  assert.equal(results.filter(Boolean).length, 1);
  const snapshots = await prisma.sportsTrendSnapshot.findMany({ where: { contestId }, include: { entries: true } });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].entries.length, 15);
  await prisma.sportsTrendSnapshot.deleteMany({ where: { contestId } });
});
