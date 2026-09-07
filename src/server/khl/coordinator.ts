import type { Prisma, PrismaClient } from "@prisma/client";
import { claimKhlJob, heartbeatKhlJob } from "./jobs";

export type KhlJobHandler = (job: { id: string; leaseToken: string; provider: string; scope: string; jobType: string; cursor: Prisma.JsonValue | null }, signal: AbortSignal) => Promise<Prisma.InputJsonValue>;
/** Runs one leased job. Caller controls cadence; no worker is enabled merely by importing this file. */
export async function runNextKhl(db: PrismaClient, handlers: Record<string, KhlJobHandler>, requestedId?: string) {
  const lease = await claimKhlJob(db, requestedId ?? null);
  if (!lease) return null;
  const job = await db.khlSyncJob.findUniqueOrThrow({ where: { id: lease.id } });
  const abort = new AbortController();
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    heartbeatKhlJob(db, lease.id, lease.leaseToken).then(count => { if (!count) abort.abort(); }).catch(() => abort.abort()).finally(() => { heartbeatRunning = false; });
  }, 20000);
  timer.unref();
  try {
    const handler = handlers[`${job.provider}:${job.jobType}`];
    if (!handler) throw new Error("HANDLER_UNAVAILABLE");
    const checkpoint = await db.khlProviderCheckpoint.findUnique({ where: { provider_scope_jobType: { provider: job.provider, scope: job.scope, jobType: job.jobType } } });
    const cursor = await handler({ ...job, leaseToken: lease.leaseToken, cursor: checkpoint?.cursor ?? job.cursor }, AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]));
    if (abort.signal.aborted) throw new Error("LEASE_LOST");
    const completedAt = new Date();
    await db.$transaction(async tx => {
      const done = await tx.khlSyncJob.updateMany({ where: { id: job.id, leaseToken: lease.leaseToken, status: "RUNNING", leaseUntil: { gt: completedAt } }, data: { status: "DONE", cursor, leaseUntil: null, leaseToken: null, error: null } });
      if (!done.count) throw new Error("LEASE_LOST");
      const key = { provider: job.provider, scope: job.scope, jobType: job.jobType };
      await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, cursor, completedAt }, update: { cursor, completedAt } });
      await tx.khlSourceContract.updateMany({ where: { provider: job.provider }, data: { health: "HEALTHY", lastSuccessAt: completedAt } });
    });
    return { id: job.id, status: "DONE" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SYNC_FAILED";
    const retry = job.attempts < 3 && !/SCHEMA|INVALID|UNVERIFIED|UNAVAILABLE|CONFLICT|HTTP_40[134]/.test(message);
    await db.khlSyncJob.updateMany({ where: { id: job.id, leaseToken: lease.leaseToken, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { status: retry ? "PENDING" : "FAILED", nextRunAt: new Date(Date.now() + Math.min(300000, 30000 * 2 ** (job.attempts - 1))), leaseToken: null, leaseUntil: null, error: message.slice(0, 1000) } });
    await db.khlSourceContract.updateMany({ where: { provider: job.provider }, data: { health: "DEGRADED" } });
    return { id: job.id, status: retry ? "RETRY" : "FAILED", error: message };
  } finally { clearInterval(timer); abort.abort(); }
}
