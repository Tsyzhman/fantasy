import type { Prisma } from "@prisma/client";
export type KhlLease = { id: string; token: string };
export async function lockValidLease(tx: Prisma.TransactionClient, lease?: KhlLease) {
  if (!lease) return;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM khl_sync_jobs WHERE id = ${lease.id} AND "leaseToken" = ${lease.token} AND status = 'RUNNING' AND "leaseUntil" > (NOW() AT TIME ZONE 'UTC') FOR UPDATE`;
  if (rows.length !== 1) throw new Error("LEASE_LOST");
}
