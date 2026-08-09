import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasySyncIntervalMilliseconds,
  type SportsRuFantasySyncScope
} from "@/machete/sports_ru_fantasy_config";
import { syncSportsRuFantasy } from "@/machete/sports_ru_fantasy_sync";

const logger = createLogger("sports-ru-fantasy:scheduler");
const POST_FOTMOB_BUSY_WAIT_MS = 5_000;
const POST_FOTMOB_BUSY_MAX_WAIT_MS = 30 * 60 * 1000;

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

  const state = sportsRuFantasySchedulerState();
  if (state.started) return;
  state.started = true;
  globalForScheduler.sportsRuFantasySyncScheduler = state;
  scheduleNextRun(state, 5_000);
}

function scheduleNextRun(state: SchedulerState, delayMs = syncIntervalMilliseconds()) {
  state.timer = setTimeout(async () => {
    await runSportsRuFantasySyncNow("interval");
    scheduleNextRun(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled Sports.ru fantasy price sync.", { delayMs });
}

export async function runSportsRuFantasySyncNow(
  trigger: "interval" | "post-fotmob" | "manual",
  requestedScopes?: readonly SportsRuFantasySyncScope[]
) {
  if (trigger !== "manual" && process.env.SPORTS_RU_FANTASY_SYNC_ENABLED === "false") {
    return { started: false, succeeded: 0, failed: 0, unavailable: 0, scopes: [] };
  }
  const state = sportsRuFantasySchedulerState();
  if (state.running && trigger === "post-fotmob") {
    logger.info("Waiting for the active Sports.ru sync before the required post-FotMob refresh.");
    const deadline = Date.now() + POST_FOTMOB_BUSY_MAX_WAIT_MS;
    while (state.running && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, POST_FOTMOB_BUSY_WAIT_MS));
    }
  }
  if (state.running) {
    logger.info("Sports.ru fantasy price sync is already running; the trigger was skipped.", { trigger });
    return { started: false, succeeded: 0, failed: 0, unavailable: 0, scopes: [] };
  }
  state.running = true;
  let succeeded = 0;
  let failed = 0;
  let unavailable = 0;
  const scopeResults: Array<Record<string, unknown>> = [];
  try {
    const scopes = requestedScopes
      ? [...requestedScopes]
      : parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");
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
        if (result.status === "UNAVAILABLE") {
          unavailable += 1;
          scopeResults.push({ ...fields, status: result.status });
          logger.warn("Sports.ru current fantasy season is not available; existing prices were preserved.", fields);
        } else {
          succeeded += 1;
          scopeResults.push({
            ...fields,
            status: result.status,
            mapping: result.mapping,
            deletedStalePrices: result.deletedStalePrices
          });
          logger.info("Sports.ru fantasy prices synchronized.", { ...fields, trigger, mapping: result.mapping, deletedStalePrices: result.deletedStalePrices });
        }
      } catch (error) {
        failed += 1;
        scopeResults.push({
          leagueId: String(scope.leagueId),
          season: scope.season,
          tournamentHru: scope.tournamentHru,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown Sports.ru sync error"
        });
        logger.error("Scheduled Sports.ru fantasy price scope failed; existing prices were preserved.", { ...scope, trigger, error });
      }
    }
  } finally {
    state.running = false;
  }
  return { started: true, succeeded, failed, unavailable, scopes: scopeResults };
}

function syncIntervalMilliseconds() {
  return sportsRuFantasySyncIntervalMilliseconds(process.env.SPORTS_RU_FANTASY_SYNC_INTERVAL_HOURS);
}

function sportsRuFantasySchedulerState() {
  return globalForScheduler.sportsRuFantasySyncScheduler ??
    (globalForScheduler.sportsRuFantasySyncScheduler = { running: false, started: false });
}
