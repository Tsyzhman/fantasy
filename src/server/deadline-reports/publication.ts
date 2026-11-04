import type { Prisma } from "@prisma/client";

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data */
export interface ClaimedStageJob {
  id: string;
  campaignId: string;
  stage: string;
  inputVersion: number;
  attempts: number;
  leaseToken: string;
}

/**
 * Lock the campaign before the job, consistently with planning. Keep these locks
 * through the result writes: checking a token before opening a transaction would
 * allow an old worker to publish after a new claim or campaign revision.
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
export async function lockDeadlinePublication(
  tx: Prisma.TransactionClient,
  input: { campaignId: string; inputVersion: number; job?: ClaimedStageJob; linkId?: string; userId?: string },
  clock: () => Date
): Promise<boolean> {
  const campaigns = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "deadline_campaigns"
    WHERE "id" = ${input.campaignId} AND "input_version" = ${input.inputVersion}
      AND "status" IN ('PLANNED', 'ACTIVE', 'BUILT', 'DELIVERING')
    FOR UPDATE
  `;
  if (campaigns.length === 0) return false;
  if (input.linkId) await tx.$queryRaw`SELECT "id" FROM "telegram_links" WHERE "id" = ${input.linkId} FOR UPDATE`;
  if (input.userId) await tx.$queryRaw`
    SELECT "id" FROM "telegram_outbox"
    WHERE "campaign_id" = ${input.campaignId} AND "user_id" = ${input.userId} AND "report_kind" = 'DEADLINE_REPORT'
    ORDER BY "part_number" FOR UPDATE
  `;
  if (!input.job) return true; // Explicit operator build still fences the input version.
  const job = input.job;
  if (job.campaignId !== input.campaignId || job.inputVersion !== input.inputVersion) return false;
  const jobs = await tx.$queryRaw<Array<{ leaseToken: string | null; leaseUntil: Date | null; status: string }>>`
    SELECT "lease_token" AS "leaseToken", "lease_until" AS "leaseUntil", "status" FROM "deadline_stage_jobs"
    WHERE "id" = ${job.id} AND "campaign_id" = ${input.campaignId}
      AND "input_version" = ${input.inputVersion} AND "stage" = ${job.stage}
    FOR UPDATE
  `;
  // Check after all lock waits. A lease may have expired while the SELECT was
  // blocked even when its token/status did not change.
  const current = jobs[0];
  return current?.leaseToken === job.leaseToken && current.status === "RUNNING"
    && current.leaseUntil != null && current.leaseUntil > clock();
}
