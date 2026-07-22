import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { foontasySyncConfigFromEnv, syncFoontasyForecasts } from "@/machete/foontasy_forecasts";

const DEFAULT_WEEKDAY = 4;
const DEFAULT_SYNC_TIME = "04:30";
const DEFAULT_TIME_ZONE = "Europe/Moscow";
const logger = createLogger("foontasy:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  foontasyForecastScheduler?: SchedulerState;
};

export function startFoontasyForecastScheduler() {
  if (process.env.FOONTASY_SYNC_ENABLED !== "true") return;
  if (!process.env.FOONTASY_EMAIL?.trim() || !process.env.FOONTASY_PASSWORD?.trim()) {
    logger.warn("Scheduled Foontasy sync is not configured.", {
      requiredEnvironment: ["FOONTASY_EMAIL", "FOONTASY_PASSWORD"]
    });
    return;
  }

  const state = globalForScheduler.foontasyForecastScheduler ?? { running: false, started: false };
  if (state.started) return;
  state.started = true;
  globalForScheduler.foontasyForecastScheduler = state;
  scheduleNextRun(state);
}

function scheduleNextRun(state: SchedulerState) {
  const schedule = nextFoontasyWeeklyRun(new Date(), {
    weekday: parseWeekday(process.env.FOONTASY_SYNC_WEEKDAY),
    time: process.env.FOONTASY_SYNC_TIME ?? DEFAULT_SYNC_TIME,
    timeZone: process.env.FOONTASY_SYNC_TIMEZONE ?? DEFAULT_TIME_ZONE
  });
  state.timer = setTimeout(async () => {
    await runFoontasyForecastSyncNow(state);
    scheduleNextRun(state);
  }, schedule.delayMs);
  state.timer.unref?.();
  logger.info("Scheduled weekly Foontasy forecast sync.", { scheduledFor: schedule.label });
}

async function runFoontasyForecastSyncNow(state: SchedulerState) {
  if (state.running) return;
  state.running = true;
  try {
    const result = await syncFoontasyForecasts(prisma, foontasySyncConfigFromEnv());
    logger.info("Foontasy forecasts synchronized.", result);
  } catch (error) {
    logger.error("Weekly Foontasy forecast sync failed; existing forecasts were preserved.", { error });
  } finally {
    state.running = false;
  }
}

export function nextFoontasyWeeklyRun(
  now: Date,
  options: { weekday?: number; time?: string; timeZone?: string } = {}
) {
  const weekday = normalizeWeekday(options.weekday ?? DEFAULT_WEEKDAY);
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const { hour, minute } = parseSyncTime(options.time ?? DEFAULT_SYNC_TIME);
  const nowParts = getZonedParts(now, timeZone);
  const currentWeekday = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)).getUTCDay();
  const daysAhead = (weekday - currentWeekday + 7) % 7;
  let target = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day + daysAhead, hour, minute, timeZone);
  if (target.getTime() <= now.getTime()) {
    target = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day + daysAhead + 7, hour, minute, timeZone);
  }
  return {
    delayMs: target.getTime() - now.getTime(),
    label: `${formatZonedDate(target, timeZone)} ${pad(hour)}:${pad(minute)} ${timeZone}`
  };
}

function parseWeekday(value: string | undefined) {
  if (!value?.trim()) return DEFAULT_WEEKDAY;
  return normalizeWeekday(Number.parseInt(value, 10));
}

function normalizeWeekday(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 6 ? value : DEFAULT_WEEKDAY;
}

function parseSyncTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 4, minute: 30 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : { hour: 4, minute: 30 };
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let index = 0; index < 2; index += 1) {
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - getTimeZoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function getZonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function formatZonedDate(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
