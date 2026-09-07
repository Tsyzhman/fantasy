/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
export async function enqueueKhl(db: PrismaClient, provider: string, scope: string, jobType: string) {
  if (process.env.KHL_SYNC_ENABLED !== "true") throw new Error("KHL_SYNC_DISABLED");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74832191)::text`;
    const duplicate = await tx.khlSyncJob.findFirst({ where: { provider, scope, jobType, status: { in: ["PENDING", "RUNNING"] } } });
    if (duplicate) return duplicate;
    if (await tx.khlSyncJob.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }) >= 1000) throw new Error("KHL_QUEUE_FULL");
    return tx.khlSyncJob.create({ data: { provider, scope, jobType, nextRunAt: new Date() } });
  });
}
export async function claimKhlJob(db: PrismaClient, requestedId: string | null = null) {
  if (process.env.KHL_SYNC_ENABLED !== "true") return null;
  await db.khlSyncJob.updateMany({ where: { status: "RUNNING", attempts: { gte: 3 }, leaseUntil: { lt: new Date() } }, data: { status: "FAILED", leaseToken: null, leaseUntil: null, error: "LEASE_EXHAUSTED" } });
  const token = randomUUID();
  const rows = await db.$queryRaw<{ id: string; leaseToken: string }[]>`
    UPDATE khl_sync_jobs SET status = 'RUNNING', "leaseToken" = ${token}, "leaseUntil" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '60 seconds', attempts = attempts + 1, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE id = (
      SELECT id FROM khl_sync_jobs
      WHERE (${requestedId}::text IS NULL OR id = ${requestedId}) AND attempts < 3
        AND (
          (status = 'PENDING' AND "nextRunAt" <= (NOW() AT TIME ZONE 'UTC'))
          OR (status = 'RUNNING' AND "leaseUntil" < (NOW() AT TIME ZONE 'UTC'))
        )
      ORDER BY "nextRunAt", id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, "leaseToken"`;
  return rows[0] ?? null;
}
export async function heartbeatKhlJob(db: PrismaClient, id: string, token: string) {
  return db.$executeRaw`UPDATE khl_sync_jobs SET "leaseUntil" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '60 seconds' WHERE id = ${id} AND "leaseToken" = ${token} AND status = 'RUNNING' AND "leaseUntil" > (NOW() AT TIME ZONE 'UTC')`;
}
export async function finishKhlJob(db: PrismaClient, id: string, token: string, error?: string) {
  return db.khlSyncJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { status: error ? "FAILED" : "DONE", error: error?.slice(0, 1000) ?? null, leaseToken: null, leaseUntil: null } });
}
export async function khlResourceStatus(db: PrismaClient) {
  return { memory: process.memoryUsage(), queue: await db.khlSyncJob.groupBy({ by: ["status"], _count: true }), raw: await db.$queryRaw`SELECT count(*)::int AS count, COALESCE(SUM(octet_length(compressed)),0)::text AS bytes FROM khl_raw_payloads`, readCacheBytes: 0 };
}
