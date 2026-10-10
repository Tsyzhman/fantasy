/** @spec spec://common/FEAT-009-session-authentication#sessions */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "./db";
import { pruneExpiredSessions } from "@/server/session-retention";
after(() => prisma.$disconnect());
test("bounded session retention removes only expired rows and leaves active logins", { skip: !process.env.DATABASE_URL }, async () => {
  const user = await prisma.user.create({ data: { email: `retention-${randomUUID()}@example.invalid` } });
  const cutoff = new Date("2010-01-02T00:00:00Z");
  try {
    await prisma.userSession.createMany({ data: Array.from({ length: 19 }, (_, index) => ({ id: randomUUID(), userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(index < 14 ? "2010-01-01T00:00:00Z" : "2099-01-01T00:00:00Z") })) });
    assert.equal(await pruneExpiredSessions(prisma, cutoff, 7), 7);
    assert.equal(await prisma.userSession.count({ where: { userId: user.id } }), 12);
    assert.equal(await pruneExpiredSessions(prisma, cutoff, 7), 7);
    assert.equal(await pruneExpiredSessions(prisma, cutoff, 7), 0);
    assert.equal(await prisma.userSession.count({ where: { userId: user.id } }), 5);
  } finally { await prisma.user.delete({ where: { id: user.id } }); }
});
