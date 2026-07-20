import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { syncFonbetFixtureOdds } from "@/machete/fixture-odds-sync";

const logger = createLogger("fixture-odds:scheduler");
const defaultIntervalMs = 15 * 60 * 1_000;
const minimumIntervalMs = 5 * 60 * 1_000;
const maximumIntervalMs = 6 * 60 * 60 * 1_000;

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as { fixtureOddsScheduler?: SchedulerState };

export function startFixtureOddsScheduler() {
  if (process.env.FIXTURE_ODDS_SYNC_ENABLED === "false") return;
  const state = globalForScheduler.fixtureOddsScheduler ?? { running: false, started: false };
  if (state.started) return;
  state.started = true;
  globalForScheduler.fixtureOddsScheduler = state;
  scheduleNext(state, 10_000);
}

function scheduleNext(state: SchedulerState, delayMs = intervalMilliseconds()) {
  state.timer = setTimeout(async () => {
    await runSync(state);
    scheduleNext(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled fixture odds synchronization.", { delayMs });
}

async function runSync(state: SchedulerState) {
  if (state.running) return;
  state.running = true;
  try {
    const result = await syncFonbetFixtureOdds(prisma);
    logger.info("Fixture odds synchronized.", result);
  } catch (error) {
    logger.error("Fixture odds synchronization failed; existing snapshots were preserved.", { error });
  } finally {
    state.running = false;
  }
}

export function fixtureOddsSyncIntervalMilliseconds(value = process.env.FIXTURE_ODDS_SYNC_INTERVAL_MINUTES) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return defaultIntervalMs;
  return Math.min(Math.max(Math.round(minutes * 60_000), minimumIntervalMs), maximumIntervalMs);
}

function intervalMilliseconds() {
  return fixtureOddsSyncIntervalMilliseconds();
}
