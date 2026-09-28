/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status */
import type { PrismaClient } from "@prisma/client";
import { khlSyncStatus } from "@/khl/sync-status";

export async function readKhlSyncStatus(db: PrismaClient, contestId: string, catalogUpdatedAt: Date | null) {
  const checkpoint = await db.khlProviderCheckpoint.findUnique({
    where: { provider_scope_jobType: { provider: "KHL_DAILY", scope: contestId, jobType: "ALL_SOURCES" } },
    select: { cursor: true, completedAt: true }
  });
  return khlSyncStatus(checkpoint, catalogUpdatedAt);
}
