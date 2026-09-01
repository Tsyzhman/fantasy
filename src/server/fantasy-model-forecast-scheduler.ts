import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
const isolatedChildPort = "39001";

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
  return runForecastCycle(state);
}

function scheduleNextRun(state: SchedulerState, delayMs: number) {
  state.timer = setTimeout(() => {
    void runForecastCycle(state).finally(() => scheduleNextRun(state, forecastSyncIntervalMs()));
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled fantasy model forecast recalculation.", { delayMs });
}

async function runForecastCycle(state: SchedulerState) {
  const standaloneServerPath = join(process.cwd(), "server.js");
  if (process.env.FANTASY_MODEL_FORECAST_CHILD === "true" || !existsSync(standaloneServerPath)) {
    return runCycle(state);
  }
  return runIsolatedForecastCycle(state, standaloneServerPath);
}

async function runIsolatedForecastCycle(state: SchedulerState, standaloneServerPath: string) {
  if (state.running) return false;
  state.running = true;
  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (succeeded: boolean) => {
        if (settled) return;
        settled = true;
        resolve(succeeded);
      };
      const child = spawn(process.execPath, ["--expose-gc", standaloneServerPath], {
        cwd: process.cwd(),
        env: fantasyModelForecastChildEnvironment(),
        stdio: ["ignore", "inherit", "inherit"]
      });
      logger.info("Started isolated fantasy model forecast recalculation process.", { pid: child.pid });
      child.once("error", (error) => {
        logger.error("Could not start isolated fantasy model forecast recalculation process.", { error });
        finish(false);
      });
      child.once("exit", (code, signal) => {
        const succeeded = code === 0;
        if (succeeded) {
          logger.info("Isolated fantasy model forecast recalculation process finished.", { code });
        } else {
          logger.error("Isolated fantasy model forecast recalculation process failed.", { code, signal });
        }
        finish(succeeded);
      });
    });
  } finally {
    state.running = false;
  }
}

export function fantasyModelForecastChildEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...environment,
    FANTASY_MODEL_FORECAST_CHILD: "true",
    INGESTION_WORKER_IN_PROCESS: "false",
    FPL_PRICE_SYNC_ENABLED: "false",
    PROBABLE_LINEUP_SYNC_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: isolatedChildPort
  };
}

async function runCycle(state: SchedulerState) {
  if (state.running) return false;
  state.running = true;
  try {
    const scopes = await loadFantasyModelForecastScopes(prisma);
    const summaries = [];
    let explicitGcRuns = 0;
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
      } finally {
        // Every scope materializes a sizeable stats working set. The production
        // worker exposes V8's collector so those temporary objects do not keep
        // the whole cycle's high-water mark resident until the next run.
        if (collectFantasyModelForecastGarbage()) explicitGcRuns += 1;
      }
    }
    const memory = process.memoryUsage();
    logger.info("Fantasy model forecast recalculation cycle finished.", {
      scopes: summaries,
      explicitGcRuns,
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, externalBytes: memory.external }
    });
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
  // Historical player memberships and LeagueSeason rows can remain active.
  // Squad itself is backed by current Sports.ru contests, so use the same
  // boundary and never precompute a tournament that the page cannot open.
  const leagues = await loadSharedLeagueOptions(prismaClient);
  const squadLeagues = leagues
    .filter((league) => league.isCurrent && isFantasySquadLeague(league))
    .map(({ leagueId, season }) => ({ leagueId, season }));
  if (squadLeagues.length === 0) return [];

  const contests = await prismaClient.fantasyContest.findMany({
    where: {
      provider: "SPORTS_RU",
      OR: squadLeagues.map(({ leagueId, season }) => ({ leagueId, season }))
    },
    select: { leagueId: true, season: true }
  });
  const contestScopes = new Set(contests.map(({ leagueId, season }) => `${leagueId}:${season}`));
  return squadLeagues.filter(({ leagueId, season }) => contestScopes.has(`${leagueId}:${season}`));
}

type ExplicitGarbageCollector = (() => void) | null | undefined;

export function collectFantasyModelForecastGarbage(
  collect: ExplicitGarbageCollector = (globalThis as typeof globalThis & { gc?: () => void }).gc
) {
  if (typeof collect !== "function") return false;
  try {
    collect();
    return true;
  } catch (error) {
    logger.warn("Explicit fantasy model forecast garbage collection failed.", { error });
    return false;
  }
}

export function forecastSyncIntervalMs(rawHours: string | undefined = process.env.FANTASY_MODEL_FORECAST_SYNC_INTERVAL_HOURS) {
  const parsed = Number(rawHours);
  const hours = Number.isFinite(parsed) && parsed >= minimumIntervalHours ? parsed : defaultIntervalHours;
  return Math.round(hours * 3_600_000);
}
