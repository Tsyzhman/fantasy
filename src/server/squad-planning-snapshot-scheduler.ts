import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS,
  syncSquadPlanningSnapshots
} from "@/machete/squad_planning_snapshots";

const STARTUP_DELAY_MS = 15_000;
// The schedule itself only changes when the existing Sports.ru / FotMob syncs
// refresh it, so re-planning a few times per day is plenty; the capture timer
// itself is always set to the exact pre-kickoff moment.
const MAXIMUM_PLANNING_SLEEP_MS = 6 * 60 * 60 * 1_000;
const logger = createLogger("squad-planning-snapshots:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  squadPlanningSnapshotScheduler?: SchedulerState;
};

export function startSquadPlanningSnapshotScheduler() {
  if (process.env.SQUAD_PLANNING_SNAPSHOT_ENABLED === "false") return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state, STARTUP_DELAY_MS);
}

export async function runSquadPlanningSnapshotSyncNow(trigger: "startup" | "scheduled" | "manual" = "manual") {
  const state = schedulerState();
  if (state.running) {
    logger.info("Squad planning snapshot sync is already running; the trigger was skipped.", { trigger });
    return null;
  }
  state.running = true;
  try {
    const result = await syncSquadPlanningSnapshots(prisma);
    logger.info("Squad planning snapshot sync finished.", { trigger, ...result });
    return result;
  } catch (error) {
    logger.error("Squad planning snapshot sync failed; stored snapshots were preserved.", { trigger, error });
    return null;
  } finally {
    state.running = false;
  }
}

async function scheduleNextCapture(state: SchedulerState) {
  let nextDelayMs = MAXIMUM_PLANNING_SLEEP_MS;
  try {
    const now = new Date();
    const result = await runSquadPlanningSnapshotSyncNow("scheduled");
    const failed = result?.failed ?? 0;
    const nextDueAt = failed > 0
      ? null
      : (await prisma.squadPlanningSnapshot.findFirst({
        where: { status: "PENDING" },
        orderBy: { dueAt: "asc" },
        select: { dueAt: true }
      }))?.dueAt ?? null;
    nextDelayMs = nextSquadPlanningSnapshotDelayMs(nextDueAt, failed, now);
  } catch (error) {
    logger.error("Squad planning snapshot scheduling failed; stored snapshots were preserved.", { error });
  }
  scheduleNextRun(state, nextDelayMs);
}

function scheduleNextRun(state: SchedulerState, delayMs: number) {
  state.timer = setTimeout(() => {
    void scheduleNextCapture(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled squad planning snapshot check.", { delayMs });
}

/**
 * Computes how long to sleep before the next planning/capture pass: failures
 * retry quickly, otherwise the timer lands exactly on the earliest pending
 * snapshot's due moment (one minute before kickoff), capped so newly synced
 * tours are still picked up several times per day.
 */
export function nextSquadPlanningSnapshotDelayMs(
  nextDueAt: Date | null,
  failedCount: number,
  now: Date,
  retryDelayMs = SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS
) {
  if (failedCount > 0) return retryDelayMs;
  if (!nextDueAt) return MAXIMUM_PLANNING_SLEEP_MS;
  return Math.min(Math.max(nextDueAt.getTime() - now.getTime(), 0), MAXIMUM_PLANNING_SLEEP_MS);
}

function schedulerState() {
  return globalForScheduler.squadPlanningSnapshotScheduler
    ?? (globalForScheduler.squadPlanningSnapshotScheduler = { running: false, started: false });
}
