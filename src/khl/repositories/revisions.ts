/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export async function appendRevision(tx: Prisma.TransactionClient, input: { streamId: string; transitionKey: string; value: Prisma.InputJsonValue; observedAt: Date; availableAt?: Date }) {
  if (input.availableAt && input.availableAt > input.observedAt) throw new Error("FUTURE_AVAILABLE_AT");
  const hash = contentHash(input.value);
  await tx.$executeRaw`INSERT INTO khl_revision_streams (id, revision, "lastSeenAt") VALUES (${input.streamId}, 0, ${input.observedAt.toISOString()}::timestamp) ON CONFLICT (id) DO NOTHING`;
  await tx.$queryRaw`SELECT id FROM khl_revision_streams WHERE id = ${input.streamId} FOR UPDATE`;
  const stream = await tx.khlRevisionStream.findUniqueOrThrow({ where: { id: input.streamId } });
  const retry = await tx.khlObservationReceipt.findUnique({ where: { streamId_transitionKey: { streamId: input.streamId, transitionKey: input.transitionKey } } });
  if (retry) {
    if (retry.hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return { sequence: retry.sequence, changed: false, replayed: true };
  }
  if (input.observedAt < stream.lastSeenAt) throw new Error("STALE_OBSERVATION");
  if (stream.hash === hash) {
    await tx.khlRevisionStream.update({ where: { id: input.streamId }, data: { lastSeenAt: input.observedAt } });
    await tx.khlObservationReceipt.create({ data: { streamId: input.streamId, transitionKey: input.transitionKey, hash, sequence: stream.revision, observedAt: input.observedAt } });
    return { sequence: stream.revision, changed: false, replayed: false };
  }
  const sequence = stream.revision + 1;
  await tx.khlObservationRevision.create({ data: { ...input, hash, sequence } });
  await tx.khlObservationReceipt.create({ data: { streamId: input.streamId, transitionKey: input.transitionKey, hash, sequence, observedAt: input.observedAt } });
  await tx.khlRevisionStream.update({ where: { id: input.streamId }, data: { revision: sequence, hash, lastSeenAt: input.observedAt } });
  return { sequence, changed: true, replayed: false };
}
