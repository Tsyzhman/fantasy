import { run_incremental_update } from "@/core_data/ingestion-jobs";
import { prisma } from "@/lib/db";

const DEFAULT_SYNC_TIME = "03:00";
const DEFAULT_TIME_ZONE = "Europe/Moscow";

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  macheteDailyFotMobSyncScheduler?: SchedulerState;
};

export function startMacheteDailyFotMobSyncScheduler() {
  if (process.env.MACHETE_DAILY_SYNC_ENABLED === "false") return;

  const state =
    globalForScheduler.macheteDailyFotMobSyncScheduler ??
    ({
      running: false,
      started: false
    } satisfies SchedulerState);

  if (state.started) return;

  state.started = true;
  globalForScheduler.macheteDailyFotMobSyncScheduler = state;

  scheduleNextRun(state);
}

function scheduleNextRun(state: SchedulerState) {
  const schedule = nextDailyRun();
  state.timer = setTimeout(async () => {
    await runScheduledSync(state, schedule.label);
    scheduleNextRun(state);
  }, schedule.delayMs);
  state.timer.unref?.();

  console.info(`[ingestion] Scheduled shared FotMob incremental update at ${schedule.label}.`);
}

async function runScheduledSync(state: SchedulerState, scheduledFor: string) {
  if (state.running) return;

  state.running = true;
  try {
    console.info(`[ingestion] Starting scheduled shared FotMob incremental update for ${scheduledFor}.`);
    await run_incremental_update(prisma, { startedByUserId: null });
    console.info("[ingestion] Scheduled shared FotMob incremental update started.");
  } catch (error) {
    console.error("[ingestion] Scheduled shared FotMob incremental update crashed.", error);
  } finally {
    state.running = false;
  }
}

function nextDailyRun() {
  const { hour, minute } = parseDailySyncTime(process.env.MACHETE_DAILY_SYNC_TIME ?? DEFAULT_SYNC_TIME);
  const timeZone = process.env.MACHETE_DAILY_SYNC_TIMEZONE ?? DEFAULT_TIME_ZONE;
  const now = new Date();
  const nowParts = getZonedParts(now, timeZone);
  let target = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, hour, minute, 0, timeZone);

  if (target.getTime() <= now.getTime()) {
    target = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day + 1, hour, minute, 0, timeZone);
  }

  return {
    delayMs: target.getTime() - now.getTime(),
    label: `${formatZonedDate(target, timeZone)} ${pad(hour)}:${pad(minute)} ${timeZone}`
  };
}

function parseDailySyncTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 3, minute: 0 };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { hour: 3, minute: 0 };

  return { hour, minute };
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let index = 0; index < 2; index += 1) {
    utc = Date.UTC(year, month - 1, day, hour, minute, second) - getTimeZoneOffsetMs(new Date(utc), timeZone);
  }

  return new Date(utc);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
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

function formatZonedDate(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
