import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { sportsTrendsEnabled, sportsTrendsIntervalMs } from "./config";
import { collectSportsTrends } from "./collector";
import { captureSportsOwnershipSnapshots, pruneSportsOwnershipHistory } from "./ownership";
import { captureSportsTransferTrends } from "./transfers";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 */
const STARTUP_DELAY_MS = 20_000;
const logger = createLogger("sports-trends:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  sportsTrendsScheduler?: SchedulerState;
};

export interface SportsTrendsRunResult {
  collection: Awaited<ReturnType<typeof collectSportsTrends>>;
  ownership: Awaited<ReturnType<typeof captureSportsOwnershipSnapshots>>;
  transfers: Awaited<ReturnType<typeof captureSportsTransferTrends>>;
  pruned: number;
}

export function startSportsTrendsScheduler() {
  if (!sportsTrendsEnabled()) return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state, STARTUP_DELAY_MS);
}

export async function runSportsTrendsNow(trigger: "startup" | "interval" | "manual" = "manual"): Promise<SportsTrendsRunResult | null> {
  const state = schedulerState();
  if (state.running) {
    logger.info("Sports trends collection is already running; the trigger was skipped.", { trigger });
    return null;
  }
  state.running = true;
  try {
    const collection = await collectSportsTrends(prisma);
    const ownership = await captureSportsOwnershipSnapshots(prisma);
    const transfers = await captureSportsTransferTrends(prisma);
    const pruned = await pruneSportsOwnershipHistory(prisma).catch(() => 0);
    logger.info("Sports trends collection finished.", { trigger, collection, ownership, transfers, pruned });
    return { collection, ownership, transfers, pruned };
  } catch (error) {
    logger.error("Sports trends collection failed; stored ratings were preserved.", { trigger, error });
    return null;
  } finally {
    state.running = false;
  }
}

function scheduleNextRun(state: SchedulerState, delayMs = sportsTrendsIntervalMs()) {
  state.timer = setTimeout(async () => {
    await runSportsTrendsNow(delayMs === STARTUP_DELAY_MS ? "startup" : "interval");
    scheduleNextRun(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled Sports trends collection.", { delayMs });
}

function schedulerState() {
  return globalForScheduler.sportsTrendsScheduler ?? (globalForScheduler.sportsTrendsScheduler = { running: false, started: false });
}
