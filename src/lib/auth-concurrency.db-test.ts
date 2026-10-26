/** @spec spec://common/FEAT-009-session-authentication#attempts */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "./db";
import { recordFailedAuthAttempt, runLimitedAuthAttempt } from "./auth-rate-limit";
import { completeAdminBootstrap, isAdminBootstrapRequired } from "./auth-bootstrap";

const skip = !process.env.DATABASE_URL;
after(() => prisma.$disconnect());

test("100 concurrent failed records retain all failures", { skip }, async () => {
  const buckets = [{ action: "test", subject: randomUUID() }];
  await Promise.all(Array.from({ length: 100 }, () => recordFailedAuthAttempt(prisma, buckets)));
  const row = await prisma.authRateLimit.findFirstOrThrow({ where: { action: "test" }, orderBy: { updatedAt: "desc" } });
  assert.equal(row.failedCount, 100);
  assert.ok(row.lockedUntil && row.lockedUntil > new Date());
  await prisma.authRateLimit.delete({ where: { id: row.id } });
});

test("100 concurrent attempts admit five password checks and reject 95", { skip }, async () => {
  const action = `test-${randomUUID()}`;
  const buckets = [{ action, subject: "email" }, { action, subject: "ip" }];
  let checks = 0;
  const results = await Promise.all(Array.from({ length: 100 }, () => runLimitedAuthAttempt(prisma, buckets, async () => {
    checks += 1;
    return { success: false, value: null };
  })));
  assert.equal(checks, 5);
  assert.equal(results.filter((result) => !result.allowed).length, 95);
  const rows = await prisma.authRateLimit.findMany({ where: { action } });
  assert.deepEqual(rows.map((row) => row.failedCount), [5, 5]);
  await prisma.authRateLimit.updateMany({ where: { action }, data: { lockedUntil: new Date(0), lastFailedAt: new Date(0) } });
  assert.equal((await runLimitedAuthAttempt(prisma, buckets, async () => ({ success: false, value: null }))).allowed, true);
  assert.deepEqual((await prisma.authRateLimit.findMany({ where: { action } })).map((row) => row.failedCount), [1, 1]);
  await prisma.authRateLimit.deleteMany({ where: { action } });
});

/** @spec spec://common/FEAT-009-session-authentication#bootstrap */
test("concurrent first setup is permanent after the last administrator is disabled", { skip }, async () => {
  // This test requires a fresh isolated database; never clear real accounts.
  assert.equal(await prisma.user.count(), 0, "Fresh isolated database required");
  await prisma.$executeRaw`UPDATE "AuthBootstrapState" SET "completedAt" = NULL WHERE id = 'first-admin'`;
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    prisma.$transaction((tx) => completeAdminBootstrap(tx, { email: `first-${index}@example.invalid`, name: null, passwordHash: "test-only" }))
  ));
  assert.equal(results.filter(Boolean).length, 1);
  const user = results.find(Boolean)!;
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false, role: "USER" } });
  assert.equal(await isAdminBootstrapRequired(prisma), false);
  assert.equal(await prisma.$transaction((tx) => completeAdminBootstrap(tx, { email: "second@example.invalid", name: null, passwordHash: "test" })), null);
  await prisma.user.delete({ where: { id: user.id } });
  assert.equal(await isAdminBootstrapRequired(prisma), false);
});
