/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
export async function storeKhlRaw(db: PrismaClient, input: { provider: string; scope: string; parserVersion: string; raw: Buffer; now: Date }) {
  if (input.raw.byteLength > 20 * 1024 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
  const compressed = gzipSync(input.raw);
  const contentHash = createHash("sha256").update(input.raw).digest("hex");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74832192)::text`;
    await tx.khlRawPayload.deleteMany({ where: { expiresAt: { lt: input.now } } });
    const existing = await tx.khlRawPayload.findUnique({ where: { provider_scope_contentHash: { provider: input.provider, scope: input.scope, contentHash } } });
    if (existing) return existing.id;
    const bytes = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(octet_length(compressed)),0)::bigint AS bytes FROM khl_raw_payloads`;
    if (Number(bytes[0].bytes) + compressed.byteLength > 250 * 1024 * 1024) throw new Error("KHL_RAW_BUDGET_EXCEEDED");
    return (await tx.khlRawPayload.create({ data: { provider: input.provider, scope: input.scope, parserVersion: input.parserVersion, contentHash, compressed, expiresAt: new Date(input.now.getTime() + 7 * 86400000) } })).id;
  });
}
export async function pruneKhl(db: PrismaClient, now: Date) {
  return db.$transaction(async tx => ({
    raw: (await tx.khlRawPayload.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    previews: (await tx.khlTransferScenario.deleteMany({ where: { status: "PREVIEW", expiresAt: { lt: now } } })).count,
    receipts: (await tx.khlObservationReceipt.deleteMany({ where: { observedAt: { lt: new Date(now.getTime() - 30 * 86400000) } } })).count,
    jobs: (await tx.khlSyncJob.deleteMany({ where: { status: { in: ["DONE", "FAILED"] }, updatedAt: { lt: new Date(now.getTime() - 30 * 86400000) } } })).count
  }));
}
