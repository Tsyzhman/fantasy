import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasySyncIntervalMilliseconds
} from "@/machete/sports_ru_fantasy_config";
import { syncSportsRuFantasy } from "@/machete/sports_ru_fantasy_sync";

const logger = createLogger("sports-ru-fantasy:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  sportsRuFantasySyncScheduler?: SchedulerState;
};

export function startSportsRuFantasySyncScheduler() {
  if (process.env.SPORTS_RU_FANTASY_SYNC_ENABLED === "false") return;
  const scopes = parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");
  if (scopes.length === 0) {
    logger.warn("Scheduled Sports.ru fantasy sync is not configured.", { requiredEnvironment: "SPORTS_RU_FANTASY_SYNC_SCOPES" });
    return;
  }

  const state =
    globalForScheduler.sportsRuFantasySyncScheduler ??
    ({ running: false, started: false } satisfies SchedulerState);
  if (state.started) return;
  state.started = true;
  globalForScheduler.sportsRuFantasySyncScheduler = state;
  scheduleNextRun(state, 5_000);
}

function scheduleNextRun(state: SchedulerState, delayMs = syncIntervalMilliseconds()) {
  state.timer = setTimeout(async () => {
    await runScheduledSync(state);
    scheduleNextRun(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled Sports.ru fantasy price sync.", { delayMs });
}

async function runScheduledSync(state: SchedulerState) {
  if (state.running) return;
  state.running = true;
  try {
    const scopes = parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");
    for (const scope of scopes) {
      try {
        const result = await syncSportsRuFantasy(prisma, scope);
        const fields = {
          leagueId: String(scope.leagueId),
          season: scope.season,
          tournamentHru: scope.tournamentHru,
          sportsRuSeasonId: result.seasonId,
          prices: result.prices
        };
        if (result.status === "UNAVAILABLE") logger.warn("Sports.ru current fantasy season is not available; existing prices were preserved.", fields);
        else logger.info("Sports.ru fantasy prices synchronized.", { ...fields, mapping: result.mapping, deletedStalePrices: result.deletedStalePrices });
      } catch (error) {
        logger.error("Scheduled Sports.ru fantasy price scope failed; existing prices were preserved.", { ...scope, error });
      }
    }
  } finally {
    state.running = false;
  }
}

function syncIntervalMilliseconds() {
  return sportsRuFantasySyncIntervalMilliseconds(process.env.SPORTS_RU_FANTASY_SYNC_INTERVAL_HOURS);
}
