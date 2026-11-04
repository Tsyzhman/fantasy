/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { consumeTelegramRateLimit, telegramRateLimitSubject } from "./rate-limit";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

test("concurrent first attempts share the fresh bucket and admit exactly its limit", { skip, timeout: 10_000 }, async () => {
  const action = `telegram:test:race:${randomUUID()}`;
  const subject = randomUUID();
  let emptyReads = 0;
  let release!: () => void;
  const bothMissing = new Promise<void>(resolve => { release = resolve; });
  // Force the missing-row interleaving when it exists. The fixed implementation
  // materializes the row first, so its reads never wait on this test barrier.
  const racingDb = prisma.$extends({ query: { async $queryRaw({ args, query }) {
    const rows = await query(args);
    if (Array.isArray(rows) && rows.length === 0) {
      emptyReads++;
      if (emptyReads >= 2) release();
      await bothMissing;
    }
    return rows;
  } } });
  try {
    const outcomes = await Promise.all(Array.from({ length: 16 }, () => consumeTelegramRateLimit(racingDb as unknown as typeof prisma, { action, subject, limit: 2, windowMs: 60_000 })));
    assert.equal(outcomes.filter(result => result.allowed).length, 2);
    assert.ok(outcomes.filter(result => !result.allowed).every(result => result.retryAfterSeconds > 0));
    const row = await prisma.telegramRateLimit.findUniqueOrThrow({ where: { action_subjectHash: { action, subjectHash: telegramRateLimitSubject(subject) } } });
    assert.equal(row.failedCount, 3, "subsequent attempts see the shared lock, not a fresh counter");
  } finally { await prisma.telegramRateLimit.deleteMany({ where: { action } }); }
});
