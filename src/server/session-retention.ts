/** @spec spec://common/FEAT-009-session-authentication#sessions */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
export async function pruneExpiredSessions(db: PrismaClient, now = new Date(), batchSize = 1000) {
  const limit = Math.max(1, Math.min(1000, Math.floor(batchSize)));
  return db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(74832194) AS acquired`;
    if (!lock.acquired) return 0;
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
    return tx.$executeRaw`DELETE FROM "UserSession" WHERE id IN (
      SELECT id FROM "UserSession" WHERE "expiresAt" <= ${now} ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)`;
  }, { timeout: 15000 });
}
let started = false;
export function startSessionRetention() {
  if (started) return; started = true;
  const run = async () => { try { const deleted = await pruneExpiredSessions(prisma); if (deleted) console.info("Expired sessions removed", { deleted }); } catch { console.error("Session retention failed"); } };
  const first = setTimeout(() => void run(), 60000); first.unref();
  const timer = setInterval(() => void run(), 3600000); timer.unref();
}
