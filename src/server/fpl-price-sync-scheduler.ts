import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { FplPublicClient } from "@/lib/providers/fpl";

import { syncFplPrices, type FplPriceSyncResult } from "./fpl-price-sync";
import { syncFplOfficialScores } from "./fpl-official-score-sync";

export const FPL_SCHEDULE_TIME_ZONE = "Europe/London";
export const FPL_SCHEDULE_MINUTE = 1;
export const FPL_SCHEDULE_HOURS = [0, 12] as const;
const logger = createLogger("fpl:price-scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  fplPriceSyncScheduler?: SchedulerState;
};

export function startFplPriceSyncScheduler() {
  if (process.env.FPL_ENABLED === "false" || process.env.FPL_PRICE_SYNC_ENABLED === "false") return;
  const state = fplSchedulerState();
  if (state.started) return;
  state.started = true;
  globalForScheduler.fplPriceSyncScheduler = state;
  void runFplPriceSyncNow("STARTUP").finally(() => scheduleNextFplPriceSync(state));
  logger.info("Started FPL price scheduler with startup catch-up.", {
    timezone: FPL_SCHEDULE_TIME_ZONE,
    runs: FPL_SCHEDULE_HOURS.map((hour) => `${String(hour).padStart(2, "0")}:01`)
  });
}

export async function runFplPriceSyncNow(trigger: "STARTUP" | "SCHEDULED" | "MANUAL"): Promise<{
  started: boolean;
  result?: FplPriceSyncResult;
  error?: string;
  officialScoreError?: string;
}> {
  if (trigger !== "MANUAL" && (process.env.FPL_ENABLED === "false" || process.env.FPL_PRICE_SYNC_ENABLED === "false")) {
    return { started: false };
  }
  const state = fplSchedulerState();
  if (state.running) return { started: false };
  state.running = true;
  try {
    const client = new FplPublicClient();
    const result = await syncFplPrices(prisma, { client, trigger });
    let officialScoreError: string | undefined;
    if (result.latestFinalizedGameweek !== null) {
      try {
        await syncFplOfficialScores(prisma, { client, gameweek: result.latestFinalizedGameweek, trigger });
      } catch (error) {
        officialScoreError = error instanceof Error ? error.message : String(error);
        logger.warn("FPL prices synchronized, but official score refresh was unavailable; prior official rows were preserved.", {
          trigger,
          gameweek: result.latestFinalizedGameweek,
          error: officialScoreError
        });
      }
    }
    logger.info("FPL price snapshot synchronized.", { trigger, ...result, officialScoreError: officialScoreError ?? null });
    return { started: true, result, ...(officialScoreError ? { officialScoreError } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("FPL price synchronization failed; previous snapshot was preserved when available.", { trigger, error: message });
    return { started: true, error: message };
  } finally {
    state.running = false;
  }
}

export function nextFplPriceSyncAt(now: Date, timeZone = FPL_SCHEDULE_TIME_ZONE) {
  const parts = getZonedParts(now, timeZone);
  const candidates = FPL_SCHEDULE_HOURS
    .map((hour) => zonedDateTimeToUtc(parts.year, parts.month, parts.day, hour, FPL_SCHEDULE_MINUTE, 0, timeZone))
    .filter((candidate) => candidate.getTime() > now.getTime())
    .sort((left, right) => left.getTime() - right.getTime());
  const runAt = candidates[0] ?? zonedDateTimeToUtc(parts.year, parts.month, parts.day + 1, FPL_SCHEDULE_HOURS[0], FPL_SCHEDULE_MINUTE, 0, timeZone);
  const runParts = getZonedParts(runAt, timeZone);
  return {
    runAt,
    delayMs: Math.max(0, runAt.getTime() - now.getTime()),
    slotKey: `${runParts.year}-${pad(runParts.month)}-${pad(runParts.day)}-${pad(runParts.hour)}${pad(runParts.minute)}`,
    label: `${runParts.year}-${pad(runParts.month)}-${pad(runParts.day)} ${pad(runParts.hour)}:${pad(runParts.minute)} ${timeZone}`
  };
}

function scheduleNextFplPriceSync(state: SchedulerState) {
  if (!state.started) return;
  const schedule = nextFplPriceSyncAt(new Date());
  state.timer = setTimeout(async () => {
    await runFplPriceSyncNow("SCHEDULED");
    scheduleNextFplPriceSync(state);
  }, schedule.delayMs);
  state.timer.unref?.();
  logger.info("Scheduled next FPL price snapshot.", { scheduledFor: schedule.label, slotKey: schedule.slotKey });
}

function fplSchedulerState() {
  return globalForScheduler.fplPriceSyncScheduler ??
    (globalForScheduler.fplPriceSyncScheduler = { running: false, started: false });
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let index = 0; index < 3; index += 1) {
    utc = Date.UTC(year, month - 1, day, hour, minute, second) - getTimeZoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
