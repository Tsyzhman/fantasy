import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { recalculateFantasyModelForecasts } from "@/machete/foontasy_style_forecast_service";

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
    const scopes = await loadActiveScopes();
    const results = [];
    for (const scope of scopes) {
      results.push(await recalculateFantasyModelForecasts(prisma, scope));
    }
    logger.info("Fantasy model forecasts recalculated.", {
      scopes: results.map((result) => ({
        modelVersion: result.modelVersion,
        players: result.players,
        fixtures: result.fixtures,
        forecasts: result.forecasts
      }))
    });
    return true;
  } catch (error) {
    logger.error("Fantasy model forecast recalculation failed; existing forecasts were preserved.", { error });
    return false;
  } finally {
    state.running = false;
  }
}

type ActiveScope = { leagueId: bigint; season: string };

async function loadActiveScopes(): Promise<ActiveScope[]> {
  const rows = await prisma.teamPlayerSeason.findMany({
    where: { active: true },
    distinct: ["leagueId", "season"],
    select: { leagueId: true, season: true }
  });
  return activeScopesFromRows(rows);
}

export function activeScopesFromRows(
  rows: ReadonlyArray<{ leagueId: bigint | null; season: string | null }>
): ActiveScope[] {
  const scopes = new Map<string, ActiveScope>();
  for (const row of rows) {
    if (row.leagueId === null || row.season === null || !row.season.trim()) continue;
    scopes.set(`${row.leagueId}:${row.season}`, { leagueId: row.leagueId, season: row.season });
  }
  return [...scopes.values()].sort((left, right) =>
    `${left.leagueId}:${left.season}`.localeCompare(`${right.leagueId}:${right.season}`)
  );
}

export function forecastSyncIntervalMs(rawHours: string | undefined = process.env.FANTASY_MODEL_FORECAST_SYNC_INTERVAL_HOURS) {
  const parsed = Number(rawHours);
  const hours = Number.isFinite(parsed) && parsed >= minimumIntervalHours ? parsed : defaultIntervalHours;
  return Math.round(hours * 3_600_000);
}
