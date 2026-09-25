import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import { buildCampaignReports } from "@/server/deadline-reports/build";
import { executeDueStageJobs, planDeadlineCampaigns } from "@/server/deadline-reports/campaigns";
import { deadlineSendEnabled } from "@/server/deadline-reports/config";
import { runDeadlineDeliveryTick } from "@/server/deadline-reports/delivery";
import { runDeadlineTick } from "@/server/deadline-reports/scheduler";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#contracts
 */
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function stringArg(prefix: string): string | null {
  const index = process.argv.indexOf(prefix);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function numberArg(prefix: string): number | null {
  const value = stringArg(prefix);
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function main() {
  loadDotEnv();
  const command = process.argv[2] ?? "status";

  if (command === "plan") {
    const summary = await planDeadlineCampaigns(prisma);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "run") {
    const summary = await runDeadlineTick(prisma, {
      send: process.argv.includes("--send"),
      maxBatch: numberArg("--limit") ?? undefined
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "stage") {
    const summary = await executeDueStageJobs(prisma, { maxJobs: numberArg("--limit") ?? 4 });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "build") {
    const campaignId = stringArg("--campaign");
    if (!campaignId) throw new Error("--campaign is required.");
    const result = await buildCampaignReports(prisma, { campaignId, maxSubscriptions: numberArg("--limit") ?? 500 });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "send") {
    if (!process.argv.includes("--apply")) throw new Error("Refusing to send without the explicit --apply flag.");
    if (!deadlineSendEnabled()) throw new Error("TELEGRAM_DEADLINE_ENABLED and TELEGRAM_SEND_ENABLED must both be true.");
    const result = await runDeadlineDeliveryTick(prisma, { maxBatch: numberArg("--limit") ?? 10 });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "dry-run") {
    const campaignId = stringArg("--campaign");
    if (!campaignId) throw new Error("--campaign is required.");
    const campaign = await prisma.deadlineCampaign.findUnique({
      where: { id: campaignId },
      include: {
        stageJobs: { orderBy: [{ dueAt: "asc" }] },
        snapshots: true,
        reports: { select: { userId: true, status: true, partsCount: true } },
        outbox: { select: { userId: true, partNumber: true, state: true, text: true }, orderBy: [{ userId: "asc" }, { partNumber: "asc" }] }
      }
    });
    if (!campaign) throw new Error(`Campaign ${campaignId} not found.`);
    const output = {
      id: campaign.id,
      contestId: campaign.contestId,
      season: campaign.season,
      providerRoundId: campaign.providerRoundId,
      status: campaign.status,
      deadlineAt: campaign.deadlineAt,
      reportDate: campaign.reportDate,
      blockedReason: campaign.blockedReason,
      inputVersion: campaign.inputVersion,
      stageJobs: campaign.stageJobs.map((job) => ({ stage: job.stage, status: job.status, dueAt: job.dueAt, attempts: job.attempts, lastError: job.lastError })),
      snapshots: campaign.snapshots.map((snapshot) => ({ dataset: snapshot.dataset, status: snapshot.status, capturedAt: snapshot.capturedAt })),
      reports: campaign.reports,
      messages: campaign.outbox.map((row) => ({ userId: row.userId, partNumber: row.partNumber, state: row.state, preview: row.text.slice(0, 400) })),
      sendEnabled: deadlineSendEnabled()
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (command === "status") {
    const [campaigns, stages, outbox, links] = await Promise.all([
      prisma.deadlineCampaign.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.deadlineStageJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.telegramOutbox.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.telegramLink.groupBy({ by: ["state"], _count: { _all: true } })
    ]);
    console.log(JSON.stringify({ campaigns, stages, outbox, links, sendEnabled: deadlineSendEnabled() }, null, 2));
    return;
  }

  throw new Error(`Unknown command ${command}. Use plan | run | stage | build | send | dry-run | status.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
