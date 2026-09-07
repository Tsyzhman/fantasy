/** @spec spec://modules/betting/FEAT-001-virtual-league#opportunities */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { eventListQuery } from "./event-list";
import { OPPORTUNITY_VERSION } from "./opportunities";

test("PostgreSQL ranks fresh opportunities before pagination and filters stale snapshots", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /127\.0\.0\.1:55439\/fantasy_betting_test_/);
  const rollback = new Error("test rollback"), prefix = `opportunity-${randomUUID()}`, now = new Date();
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.coreLeague.upsert({ where: { id: 47n }, create: { id: 47n, name: "Premier League" }, update: {} });
      await tx.bettingEvent.createMany({ data: Array.from({ length: 32 }, (_, i) => {
        const kickoff = new Date(now.getTime() + 3600000 + i * 60000);
        const fetchedAt = new Date(now.getTime() - (i === 31 ? 300001 : 0));
        return { id: `${prefix}-${i}`, leagueId: 47n, home: prefix, away: "Opponent", kickoff, fetchedAt, markets: [],
          model: { _opportunities: { version: OPPORTUNITY_VERSION, fetchedAt: fetchedAt.toISOString(), kickoff: kickoff.toISOString(), count: 1, bestEv: i / 100 } } };
      }) });
      const ranked = await tx.$queryRaw<{ id: string }[]>(eventListQuery("47", prefix, 0, "value", now));
      assert.equal(ranked.length, 30);
      assert.equal(ranked[0].id, `${prefix}-30`, "Highest fresh EV is ranked before LIMIT");
      const time = await tx.$queryRaw<{ id: string }[]>(eventListQuery("47", prefix, 0, "time", now));
      assert.equal(time[0].id, `${prefix}-0`);
      const tail = await tx.$queryRaw<{ id: string; opportunity: unknown }[]>(eventListQuery("47", prefix, 30, "value", now));
      assert.equal(tail.length, 2);
      assert.equal(tail[1].id, `${prefix}-31`);
      assert.equal(tail[1].opportunity, null);
      const quoted = await tx.$queryRaw<unknown[]>(eventListQuery("47", "' OR TRUE --", 0, "value", now));
      assert.equal(quoted.length, 0);
      throw rollback;
    }), error => error === rollback);
    assert.equal(await prisma.bettingEvent.count({ where: { home: prefix } }), 0);
  } finally { await prisma.$disconnect(); }
});
