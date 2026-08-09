import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  FoontasySourceUnavailableError,
  foontasySyncConfigFromEnv,
  syncFoontasyForecasts,
  type FoontasySyncConfig
} from "@/machete/foontasy_forecasts";

const DEFAULT_TIME_ZONE = "Europe/Moscow";
const SYNC_LEAD_TIME_MS = 10 * 60 * 60 * 1_000;
const RETRY_DELAY_MS = 30 * 60 * 1_000;
const MAXIMUM_PLANNING_SLEEP_MS = 6 * 60 * 60 * 1_000;
const SCHEDULE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1_000;
const logger = createLogger("foontasy:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  retryRoundNumber?: number;
  retryNotBefore?: Date;
  timer?: ReturnType<typeof setTimeout>;
};

export type FoontasyScheduleMatch = {
  round: string | null;
  matchDate: Date | null;
  finished: boolean;
  cancelled: boolean;
};

export type FoontasyRoundForecastFetch = {
  roundNumber: number;
  fetchedAt: Date | null;
};

export type FoontasyRoundRun = {
  roundNumber: number;
  firstKickoffAt: Date;
  dueAt: Date;
  delayMs: number;
  label: string;
};

const globalForScheduler = globalThis as unknown as {
  foontasyForecastScheduler?: SchedulerState;
};

export function startFoontasyForecastScheduler() {
  if (process.env.FOONTASY_SYNC_ENABLED !== "true") return;
  try {
    foontasySyncConfigFromEnv();
  } catch (error) {
    logger.warn("Scheduled Foontasy sync is not configured.", {
      requiredEnvironment: ["FOONTASY_EMAIL", "FOONTASY_PASSWORD"],
      error
    });
    return;
  }

  const state = globalForScheduler.foontasyForecastScheduler ?? { running: false, started: false };
  if (state.started) return;
  state.started = true;
  globalForScheduler.foontasyForecastScheduler = state;
  void planNextRun(state);
}

async function planNextRun(state: SchedulerState) {
  try {
    const now = new Date();
    const config = foontasySyncConfigFromEnv();
    const schedule = await loadNextFoontasyRoundRun(now, config);
    if (!schedule) {
      state.retryRoundNumber = undefined;
      state.retryNotBefore = undefined;
      scheduleTimer(state, MAXIMUM_PLANNING_SLEEP_MS);
      logger.info("No pending Foontasy round was found; the fixture schedule will be checked again.", {
        recheckInMs: MAXIMUM_PLANNING_SLEEP_MS
      });
      return;
    }

    if (state.retryRoundNumber !== schedule.roundNumber) {
      state.retryRoundNumber = undefined;
      state.retryNotBefore = undefined;
    }

    const isDue = schedule.dueAt.getTime() <= now.getTime();
    const retryAt = isDue && state.retryRoundNumber === schedule.roundNumber && state.retryNotBefore && state.retryNotBefore > now
      ? state.retryNotBefore
      : null;
    const wakeAt = retryAt ?? (isDue ? now : schedule.dueAt);
    const delayMs = Math.min(Math.max(wakeAt.getTime() - now.getTime(), 0), MAXIMUM_PLANNING_SLEEP_MS);
    scheduleTimer(state, delayMs, isDue ? schedule.roundNumber : undefined);
    logger.info("Scheduled Foontasy forecast sync before the first match of the round.", {
      roundNumber: schedule.roundNumber,
      firstKickoffAt: schedule.firstKickoffAt.toISOString(),
      dueAt: schedule.dueAt.toISOString(),
      scheduledFor: schedule.label,
      delayMs,
      retryAt: retryAt?.toISOString() ?? null
    });
  } catch (error) {
    logger.error("Foontasy schedule planning failed; existing forecasts were preserved.", { error });
    scheduleTimer(state, RETRY_DELAY_MS);
  }
}

function scheduleTimer(state: SchedulerState, delayMs: number, expectedRoundNumber?: number) {
  state.timer = setTimeout(async () => {
    if (expectedRoundNumber !== undefined) {
      const succeeded = await runFoontasyForecastSyncNow(state, expectedRoundNumber);
      if (succeeded) {
        state.retryRoundNumber = undefined;
        state.retryNotBefore = undefined;
      } else {
        state.retryRoundNumber = expectedRoundNumber;
        state.retryNotBefore = new Date(Date.now() + RETRY_DELAY_MS);
      }
    }
    await planNextRun(state);
  }, delayMs);
  state.timer.unref?.();
}

async function runFoontasyForecastSyncNow(state: SchedulerState, expectedRoundNumber: number) {
  if (state.running) return false;
  state.running = true;
  try {
    const result = await syncFoontasyForecasts(prisma, foontasySyncConfigFromEnv());
    if (result.roundNumber !== expectedRoundNumber) {
      logger.warn("Foontasy source did not return the scheduled round; it will be retried.", {
        expectedRoundNumber,
        returnedRoundNumber: result.roundNumber,
        rows: result.rows
      });
      return false;
    }
    logger.info("Foontasy forecasts synchronized.", { expectedRoundNumber, ...result });
    return true;
  } catch (error) {
    logger.error("Foontasy forecast sync failed; existing forecasts were preserved.", { expectedRoundNumber, error });
    return false;
  } finally {
    state.running = false;
  }
}

export async function runSelectedFoontasyForecastSyncNow(configs: readonly FoontasySyncConfig[]) {
  const state = globalForScheduler.foontasyForecastScheduler ?? { running: false, started: false };
  globalForScheduler.foontasyForecastScheduler = state;
  if (state.running) return { started: false, succeeded: 0, failed: 0, unavailable: 0, scopes: [] };
  state.running = true;
  let succeeded = 0;
  let failed = 0;
  let unavailable = 0;
  const scopes: Array<Record<string, unknown>> = [];
  try {
    for (const config of configs) {
      const fields = {
        leagueId: String(config.leagueId),
        season: config.season,
        sourceKey: config.sourceKey,
        sourceVariant: config.sourceVariant,
        assistantLocation: safeAssistantLocation(config.url)
      };
      try {
        const result = await syncFoontasyForecasts(prisma, config);
        succeeded += 1;
        scopes.push({ ...fields, status: "SYNCED", ...result });
        logger.info("Manually selected Foontasy forecasts synchronized.", { ...fields, ...result });
      } catch (error) {
        if (error instanceof FoontasySourceUnavailableError) {
          unavailable += 1;
          scopes.push({ ...fields, status: "UNAVAILABLE", error: error.message });
          logger.warn("Selected Foontasy scope is not ready; other selected leagues will continue.", { ...fields, error });
          continue;
        }
        failed += 1;
        scopes.push({
          ...fields,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown Foontasy sync error"
        });
        logger.error("Selected Foontasy scope failed; other selected leagues will continue.", { ...fields, error });
      }
    }
  } finally {
    state.running = false;
  }
  return { started: true, succeeded, failed, unavailable, scopes };
}

async function loadNextFoontasyRoundRun(now: Date, config: FoontasySyncConfig) {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId: config.leagueId,
      season: config.season,
      cancelled: false,
      matchDate: { gte: new Date(now.getTime() - SCHEDULE_LOOKBACK_MS) }
    },
    select: { round: true, matchDate: true, finished: true, cancelled: true }
  });
  const roundNumbers = [...new Set(matches.flatMap((match) => {
    const roundNumber = parseRoundNumber(match.round);
    return roundNumber === null ? [] : [roundNumber];
  }))];
  const forecasts = roundNumbers.length === 0
    ? []
    : await prisma.foontasyForecast.groupBy({
      by: ["roundNumber"],
      where: {
        leagueId: config.leagueId,
        season: config.season,
        sourceVariant: config.sourceVariant,
        roundNumber: { in: roundNumbers }
      },
      _max: { fetchedAt: true }
    });
  return nextFoontasyRoundRun(
    matches,
    forecasts.map((forecast) => ({ roundNumber: forecast.roundNumber, fetchedAt: forecast._max.fetchedAt })),
    now,
    { timeZone: process.env.FOONTASY_SYNC_TIMEZONE ?? DEFAULT_TIME_ZONE }
  );
}

/**
 * Chooses the earliest active RPL round whose Foontasy snapshot has not yet
 * been captured at or after the required cutoff: ten hours before kickoff.
 */
export function nextFoontasyRoundRun(
  matches: readonly FoontasyScheduleMatch[],
  forecasts: readonly FoontasyRoundForecastFetch[],
  now: Date,
  options: { timeZone?: string } = {}
): FoontasyRoundRun | null {
  const rounds = new Map<number, { firstKickoffAt: Date; hasOpenMatch: boolean }>();
  for (const match of matches) {
    const roundNumber = parseRoundNumber(match.round);
    if (roundNumber === null || match.cancelled || !match.matchDate) continue;
    const existing = rounds.get(roundNumber);
    rounds.set(roundNumber, {
      firstKickoffAt: !existing || match.matchDate < existing.firstKickoffAt ? match.matchDate : existing.firstKickoffAt,
      hasOpenMatch: Boolean(existing?.hasOpenMatch || !match.finished)
    });
  }

  const fetchedAtByRound = new Map<number, Date>();
  for (const forecast of forecasts) {
    if (!forecast.fetchedAt) continue;
    const previous = fetchedAtByRound.get(forecast.roundNumber);
    if (!previous || forecast.fetchedAt > previous) fetchedAtByRound.set(forecast.roundNumber, forecast.fetchedAt);
  }

  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  for (const [roundNumber, round] of [...rounds.entries()].sort((left, right) => left[1].firstKickoffAt.getTime() - right[1].firstKickoffAt.getTime())) {
    if (!round.hasOpenMatch) continue;
    const dueAt = new Date(round.firstKickoffAt.getTime() - SYNC_LEAD_TIME_MS);
    const fetchedAt = fetchedAtByRound.get(roundNumber);
    if (fetchedAt && fetchedAt.getTime() >= dueAt.getTime()) continue;
    return {
      roundNumber,
      firstKickoffAt: round.firstKickoffAt,
      dueAt,
      delayMs: Math.max(dueAt.getTime() - now.getTime(), 0),
      label: `${formatZonedDateTime(dueAt, timeZone)} ${timeZone}`
    };
  }
  return null;
}

function parseRoundNumber(value: string | null) {
  const match = /\d+/.exec(value ?? "");
  if (!match) return null;
  const roundNumber = Number(match[0]);
  return Number.isSafeInteger(roundNumber) && roundNumber > 0 ? roundNumber : null;
}

function formatZonedDateTime(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function safeAssistantLocation(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "invalid";
  }
}
