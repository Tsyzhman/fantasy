import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";
import { isFantasySquadLeague } from "@/lib/leagues/display";
import { createLogger } from "@/lib/logger";
import { recalculateFantasyModelForecasts } from "@/machete/foontasy_style_forecast_service";
import { loadSharedLeagueOptions } from "@/machete/shared_read_model";

const logger = createLogger("fantasy-model-forecast:scheduler");

const initialDelayMs = 30_000;
const retryDelayMs = 10 * 60 * 1_000;
const defaultIntervalHours = 6;
const minimumIntervalHours = 0.25;

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as { fantasyModelForecastScheduler?: SchedulerState };

export function startFantasyModelForecastScheduler() {
  if (process.env.FANTASY_MODEL_FORECAST_SYNC_ENABLED === "false") return;
  const state = globalForScheduler.fantasyModelForecastScheduler ?? { running: false, started: false };
  if (state.started) return;
  state.started = true;
  globalForScheduler.fantasyModelForecastScheduler = state;
  scheduleNextRun(state, initialDelayMs);
}

/** Manual entry point that shares the serialized cycle with the scheduled runs. */
export async function runFantasyModelForecastSyncNow() {
  const state = globalForScheduler.fantasyModelForecastScheduler ?? { running: false, started: false };
  state.started = true;
  globalForScheduler.fantasyModelForecastScheduler = state;
  return runCycle(state);
}

function scheduleNextRun(state: SchedulerState, delayMs: number) {
  state.timer = setTimeout(() => {
    void runCycle(state).finally(() => scheduleNextRun(state, forecastSyncIntervalMs()));
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled fantasy model forecast recalculation.", { delayMs });
}

async function runCycle(state: SchedulerState) {
  if (state.running) return false;
  state.running = true;
  try {
    const scopes = await loadFantasyModelForecastScopes(prisma);
    const summaries = [];
    let succeeded = true;
    for (const scope of scopes) {
      const key = `${scope.leagueId}:${scope.season}`;
      try {
        const result = await recalculateFantasyModelForecasts(prisma, scope);
        summaries.push({ scope: key, forecasts: result.forecasts });
      } catch (error) {
        // One league with incomplete provider data must not block the others;
        // the next cycle retries it automatically.
        succeeded = false;
        summaries.push({ scope: key, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
        logger.error("Fantasy model forecast recalculation failed for a scope.", { scope: key, error });
      }
    }
    logger.info("Fantasy model forecast recalculation cycle finished.", { scopes: summaries });
    return succeeded;
  } catch (error) {
    logger.error("Fantasy model forecast recalculation failed; existing forecasts were preserved.", { error });
    return false;
  } finally {
    state.running = false;
  }
}

type ActiveScope = { leagueId: bigint; season: string };

export async function loadFantasyModelForecastScopes(prismaClient: PrismaClient): Promise<ActiveScope[]> {
  // Historical player memberships can remain active. Use Squad's league and
  // default-season selection, but never schedule its archived-season fallback.
  const leagues = await loadSharedLeagueOptions(prismaClient);
  return leagues
    .filter((league) => league.isCurrent && isFantasySquadLeague(league))
    .map(({ leagueId, season }) => ({ leagueId, season }));
}

export function forecastSyncIntervalMs(rawHours: string | undefined = process.env.FANTASY_MODEL_FORECAST_SYNC_INTERVAL_HOURS) {
  const parsed = Number(rawHours);
  const hours = Number.isFinite(parsed) && parsed >= minimumIntervalHours ? parsed : defaultIntervalHours;
  return Math.round(hours * 3_600_000);
}
