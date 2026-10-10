import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { expireTelegramLinkArtifacts } from "@/server/telegram/link-service";
import { deadlineReportsEnabled, deadlineSendEnabled, DEADLINE_DEFAULT_BATCH } from "./config";
import { deadlinePlanningVersion, executeDueStageJobs, planDeadlineCampaigns, type CampaignPlanSummary, type StageExecutionSummary } from "./campaigns";
import { expireOverdueOutbox, markBuiltCampaignsDelivering, runDeadlineDeliveryTick, type DeliveryTickResult } from "./delivery";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
const TICK_INTERVAL_MS = 5_000;
const STARTUP_DELAY_MS = 15_000;
const PLAN_RECONCILE_MS = 5 * 60_000;
const ARTIFACT_PURGE_EVERY_TICKS = 12;
const logger = createLogger("deadline-reports:scheduler");

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  ticks: number;
  planningVersion?: string;
  plannedAt?: number;
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
  options: { now?: Date; send?: boolean; maxBatch?: number; forcePlan?: boolean } = {}
): Promise<DeadlineTickSummary> {
  const now = options.now ?? new Date();
  const state = schedulerState();
  const planningVersion = await deadlinePlanningVersion(prismaClient);
  const needsPlan = options.forcePlan || state.planningVersion !== planningVersion
    || state.plannedAt == null || now.getTime() < state.plannedAt || now.getTime() - state.plannedAt >= PLAN_RECONCILE_MS;
  const campaigns = needsPlan ? await planDeadlineCampaigns(prismaClient, { now })
    : { created: 0, updated: 0, blocked: 0, skipped: 0, details: [] };
  if (needsPlan) {
    state.planningVersion = planningVersion;
    state.plannedAt = now.getTime();
  }
  const stages = await executeDueStageJobs(prismaClient, { now });
  const delivering = await markBuiltCampaignsDelivering(prismaClient, now);
  const expired = await expireOverdueOutbox(prismaClient, now);
  const delivery = options.send ?? deadlineSendEnabled()
    ? await runDeadlineDeliveryTick(prismaClient, { now, maxBatch: options.maxBatch ?? DEADLINE_DEFAULT_BATCH })
    : null;
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
    const summary = await runDeadlineTick(prisma, { forcePlan: trigger === "manual" });
    if (trigger !== "interval" || state.ticks % 12 === 0 || summary.campaigns.created
      || summary.campaigns.updated || summary.delivering || summary.expired) {
      logger.info("Deadline report tick finished.", { trigger, summary });
    }
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
  if (delayMs === STARTUP_DELAY_MS) logger.info("Scheduled deadline report tick.", { delayMs });
}

function schedulerState() {
  return globalForScheduler.deadlineReportScheduler ?? (globalForScheduler.deadlineReportScheduler = { started: false, running: false, ticks: 0 });
}
