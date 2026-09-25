import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { expireTelegramLinkArtifacts } from "@/server/telegram/link-service";
import { deadlineReportsEnabled, deadlineSendEnabled, DEADLINE_DEFAULT_BATCH } from "./config";
import { executeDueStageJobs, planDeadlineCampaigns, type CampaignPlanSummary, type StageExecutionSummary } from "./campaigns";
import { expireOverdueOutbox, markBuiltCampaignsDelivering, runDeadlineDeliveryTick, type DeliveryTickResult } from "./delivery";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
const TICK_INTERVAL_MS = 5_000;
const STARTUP_DELAY_MS = 15_000;
const ARTIFACT_PURGE_EVERY_TICKS = 12;
const logger = createLogger("deadline-reports:scheduler");

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  ticks: number;
};

const globalForScheduler = globalThis as unknown as {
  deadlineReportScheduler?: SchedulerState;
};

export interface DeadlineTickSummary {
  campaigns: CampaignPlanSummary;
  stages: StageExecutionSummary;
  delivering: number;
  expired: number;
  delivery: DeliveryTickResult | null;
  purged: boolean;
}

export async function runDeadlineTick(
  prismaClient = prisma,
  options: { now?: Date; send?: boolean; maxBatch?: number } = {}
): Promise<DeadlineTickSummary> {
  const now = options.now ?? new Date();
  const campaigns = await planDeadlineCampaigns(prismaClient, { now });
  const stages = await executeDueStageJobs(prismaClient, { now });
  const delivering = await markBuiltCampaignsDelivering(prismaClient, now);
  const expired = await expireOverdueOutbox(prismaClient, now);
  const delivery = options.send ?? deadlineSendEnabled()
    ? await runDeadlineDeliveryTick(prismaClient, { now, maxBatch: options.maxBatch ?? DEADLINE_DEFAULT_BATCH })
    : null;
  const state = schedulerState();
  state.ticks += 1;
  const purged = state.ticks % ARTIFACT_PURGE_EVERY_TICKS === 0;
  if (purged) await expireTelegramLinkArtifacts(prismaClient, now).catch(() => undefined);
  return { campaigns, stages, delivering, expired, delivery, purged };
}

export function startDeadlineReportScheduler() {
  if (!deadlineReportsEnabled()) return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state, STARTUP_DELAY_MS);
}

export async function runDeadlineReportsNow(trigger: "startup" | "interval" | "manual" = "manual"): Promise<DeadlineTickSummary | null> {
  const state = schedulerState();
  if (state.running) {
    logger.info("Deadline report tick is already running; the trigger was skipped.", { trigger });
    return null;
  }
  state.running = true;
  try {
    const summary = await runDeadlineTick(prisma);
    logger.info("Deadline report tick finished.", { trigger, summary });
    return summary;
  } catch (error) {
    logger.error("Deadline report tick failed.", { trigger, error });
    return null;
  } finally {
    state.running = false;
  }
}

function scheduleNextRun(state: SchedulerState, delayMs = TICK_INTERVAL_MS) {
  state.timer = setTimeout(async () => {
    await runDeadlineReportsNow(delayMs === STARTUP_DELAY_MS ? "startup" : "interval");
    scheduleNextRun(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled deadline report tick.", { delayMs });
}

function schedulerState() {
  return globalForScheduler.deadlineReportScheduler ?? (globalForScheduler.deadlineReportScheduler = { started: false, running: false, ticks: 0 });
}
