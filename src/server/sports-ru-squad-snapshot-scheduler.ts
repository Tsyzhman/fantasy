import { prisma } from "@/lib/db";
import { loadActiveFantasySourceScopes } from "./fantasy-source-registry";
import { createLogger } from "@/lib/logger";
import { parseSportsRuFantasySyncScopes } from "@/machete/sports_ru_fantasy_config";
import { syncSportsRuSquadSnapshots } from "@/machete/sports_ru_squad_snapshots";

const DEFAULT_INTERVAL_MINUTES = 5;
const STARTUP_DELAY_MS = 10_000;
const logger = createLogger("sports-ru-squads:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  sportsRuSquadSnapshotScheduler?: SchedulerState;
};

export function startSportsRuSquadSnapshotScheduler() {
  if (
    process.env.SPORTS_RU_FANTASY_SYNC_ENABLED === "false"
    || process.env.SPORTS_RU_SQUAD_SYNC_ENABLED === "false"
  ) return;
  parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");

  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state, STARTUP_DELAY_MS);
}

export async function runSportsRuSquadSnapshotSyncNow(trigger: "startup" | "interval" | "manual" = "manual") {
  const state = schedulerState();
  if (state.running) {
    logger.info("Sports.ru squad snapshot sync is already running; the trigger was skipped.", { trigger });
    return null;
  }
  state.running = true;
  try {
    const scopes = await loadActiveFantasySourceScopes(prisma);
    const result = await syncSportsRuSquadSnapshots(prisma, scopes);
    logger.info("Sports.ru squad snapshot sync finished.", { trigger, ...result });
    return result;
  } catch (error) {
    logger.error("Sports.ru squad snapshot sync failed; stored squads were preserved.", { trigger, error });
    return null;
  } finally {
    state.running = false;
  }
}

function scheduleNextRun(state: SchedulerState, delayMs = schedulerIntervalMilliseconds()) {
  state.timer = setTimeout(async () => {
    await runSportsRuSquadSnapshotSyncNow(delayMs === STARTUP_DELAY_MS ? "startup" : "interval");
    scheduleNextRun(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled Sports.ru squad snapshot check.", { delayMs });
}

export function sportsRuSquadSnapshotIntervalMilliseconds(value: string | undefined) {
  const configured = Number(value ?? DEFAULT_INTERVAL_MINUTES);
  const minutes = Number.isFinite(configured) && configured >= 1 && configured <= 60
    ? configured
    : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1_000;
}

function schedulerIntervalMilliseconds() {
  return sportsRuSquadSnapshotIntervalMilliseconds(process.env.SPORTS_RU_SQUAD_SYNC_INTERVAL_MINUTES);
}

function schedulerState() {
  return globalForScheduler.sportsRuSquadSnapshotScheduler
    ?? (globalForScheduler.sportsRuSquadSnapshotScheduler = { running: false, started: false });
}
