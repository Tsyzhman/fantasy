/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
export async function storeKhlRaw(db: PrismaClient, input: { provider: string; scope: string; parserVersion: string; raw: Buffer; now: Date }) {
  if (input.raw.byteLength > 20 * 1024 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
  const compressed = gzipSync(input.raw);
  const contentHash = createHash("sha256").update(input.raw).digest("hex");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74832192)::text`;
    const existing = await tx.khlRawPayload.findFirst({ where: { provider: input.provider, scope: input.scope, contentHash, expiresAt: { gt: input.now } } });
    if (existing) return existing.id;
    // The unique content key may refer to an expired copy.
    await tx.khlRawPayload.deleteMany({ where: { provider: input.provider, scope: input.scope, contentHash, expiresAt: { lte: input.now } } });
    const bytes = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(octet_length(compressed)),0)::bigint AS bytes FROM khl_raw_payloads WHERE "expiresAt" > ${input.now}`;
    if (Number(bytes[0].bytes) + compressed.byteLength > 250 * 1024 * 1024) throw new Error("KHL_RAW_BUDGET_EXCEEDED");
    return (await tx.khlRawPayload.create({ data: { provider: input.provider, scope: input.scope, parserVersion: input.parserVersion, contentHash, compressed, expiresAt: new Date(input.now.getTime() + 7 * 86400000) } })).id;
  });
}
/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
export async function pruneKhl(db: PrismaClient, now: Date, options: { batchSize?: number; maxBatches?: number } = {}) {
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const targets = [
    ["raw", "khl_raw_payloads", Prisma.sql`"expiresAt" < ${now}`, "expiresAt"],
    ["availability", "khl_availability_observations", Prisma.sql`"expiresAt" < ${cutoff}`, "expiresAt"],
    ["availabilityRevisions", "khl_observation_revisions", Prisma.sql`"streamId" LIKE 'availability:%' AND "observedAt" < ${cutoff}`, "observedAt"],
    ["previews", "khl_transfer_scenarios", Prisma.sql`status = 'PREVIEW' AND "expiresAt" < ${now}`, "expiresAt"],
    ["receipts", "khl_observation_receipts", Prisma.sql`"observedAt" < ${cutoff}`, "observedAt"],
    ["jobs", "khl_sync_jobs", Prisma.sql`status IN ('DONE', 'FAILED') AND "updatedAt" < ${cutoff}`, "updatedAt"]
  ] as const;
  const batchSize = Math.max(1, Math.min(2000, options.batchSize ?? 2000));
  const maxBatches = Math.max(1, Math.min(40, options.maxBatches ?? 40));
  const counts: Record<string, number> = {};
  for (const [key, table, predicate, order] of targets) {
    counts[key] = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const count = await db.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(74832193) AS locked`;
        if (!lock.locked) return 0;
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '10s'`;
        return tx.$executeRaw(Prisma.sql`
          DELETE FROM ${Prisma.raw(table)} WHERE id IN (
            SELECT id FROM ${Prisma.raw(table)} WHERE ${predicate}
            ORDER BY ${Prisma.raw('"' + order + '"')} LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
          )
        `);
      }, { timeout: 15_000 });
      counts[key] += count;
      if (count < batchSize) break;
    }
  }
  return counts;
}

let retentionStarted = false;
/** Hourly physical cleanup; logical expiry is enforced by every reader. */
export function startKhlRetentionScheduler() {
  if (retentionStarted) return;
  retentionStarted = true;
  const tick = async () => {
    try { await pruneKhl(prisma, new Date()); }
    catch (error) { console.error("KHL retention failed", error); }
    finally { setTimeout(() => { void tick(); }, 60 * 60_000).unref(); }
  };
  setTimeout(() => { void tick(); }, 60_000).unref();
}
