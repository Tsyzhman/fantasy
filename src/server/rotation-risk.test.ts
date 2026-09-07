/** @spec spec://modules/machete/FEAT-004-rotation-risk#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, Prisma } from "@prisma/client";
import { loadRotationRisks } from "./rotation-risk";
const now = new Date("2026-09-07T12:00:00Z");

test("reader deduplicates IDs, bounds batches to 250 and history to 50; repeated calls retain no cache", async () => {
  let calls = 0;
  const prisma = { $queryRaw: async (query: Prisma.Sql) => {
    calls++;
    const ids = query.values.filter((v): v is bigint => typeof v === "bigint");
    assert.ok(ids.length <= 250);
    assert.match(query.sql, /LIMIT 50/);
    assert.match(query.sql, /s.started IS NOT NULL/);
    assert.match(query.sql, /s.minutes > 0/);
    assert.match(query.sql, /NOT m.cancelled/);
    return ids.map((id) => ({ playerId: id, matchId: 10n, matchDate: new Date("2026-09-05T12:00:00Z"), started: true, lastPlayedAt: new Date("2026-09-05T12:00:00Z") }));
  } } as unknown as PrismaClient;
  const players = Array.from({ length: 601 }, (_, i) => ({ playerId: String(i + 1), kickoffAt: new Date("2026-09-08T12:00:00Z") }));
  for (let pass = 0; pass < 3; pass++) {
    const result = await loadRotationRisks(prisma, [...players, players[0], { playerId: "placeholder:9", kickoffAt: null }], now);
    assert.equal(result.size, 601);
    assert.equal(result.get("1")?.restDays, 3);
    assert.equal(result.get("1")?.value, .06);
  }
  assert.equal(calls, 9);
  assert.equal((await loadRotationRisks(prisma, [], now)).size, 0);
  assert.equal(calls, 9);
});

test("missing DB observations are unavailable and database failures are not masked", async () => {
  const players = [{ playerId: "1", kickoffAt: new Date("2026-09-08T12:00:00Z") }];
  const result = await loadRotationRisks({ $queryRaw: async () => [] } as unknown as PrismaClient, players, now);
  assert.equal(result.get("1")?.value, null);
  await assert.rejects(loadRotationRisks({ $queryRaw: async () => { throw new Error("DB offline"); } } as unknown as PrismaClient, players, now), /DB offline/);
});
