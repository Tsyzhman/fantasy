import { pruneOldLeagueSeasons } from "@/core_data/league-season-retention";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const DEFAULT_RETENTION_TIME = "03:30";
const DEFAULT_TIME_ZONE = "Europe/Moscow";
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const logger = createLogger("retention");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  leagueSeasonRetentionScheduler?: SchedulerState;
};

export function startLeagueSeasonRetentionScheduler() {
  if (process.env.LEAGUE_SEASON_RETENTION_ENABLED === "false") return;

  const state =
    globalForScheduler.leagueSeasonRetentionScheduler ??
    ({
      running: false,
      started: false
    } satisfies SchedulerState);

  if (state.started) return;

  state.started = true;
  globalForScheduler.leagueSeasonRetentionScheduler = state;

  scheduleNextRun(state);
}

function scheduleNextRun(state: SchedulerState) {
  const schedule = nextRetentionRun();

  state.timer = setTimeout(async () => {
    if (schedule.delayMs <= MAX_TIMER_DELAY_MS) {
      await runScheduledRetention(state, schedule.label);
    }
    scheduleNextRun(state);
  }, Math.min(schedule.delayMs, MAX_TIMER_DELAY_MS));
  state.timer.unref?.();

  logger.info("Scheduled league season cleanup.", { scheduledFor: schedule.label });
}

async function runScheduledRetention(state: SchedulerState, scheduledFor: string) {
  if (state.running) return;

  state.running = true;
  try {
    logger.info("Running scheduled league season cleanup.", { scheduledFor });
    const result = await pruneOldLeagueSeasons(prisma);
    if (result.skipped) {
      logger.info("Scheduled cleanup skipped.", { reason: result.reason ?? "nothing to do" });
    } else {
      logger.info("Scheduled cleanup removed league seasons.", { deletedLeagueSeasons: result.deleted.leagueSeasons ?? 0 });
    }
  } catch (error) {
    logger.error("Scheduled league season cleanup crashed.", { error });
  } finally {
    state.running = false;
  }
}

function nextRetentionRun() {
  const { hour, minute } = parseDailyTime(process.env.LEAGUE_SEASON_RETENTION_TIME ?? DEFAULT_RETENTION_TIME);
  const timeZone = process.env.LEAGUE_SEASON_RETENTION_TIMEZONE ?? DEFAULT_TIME_ZONE;
  const now = new Date();
  const nowParts = getZonedParts(now, timeZone);
  const target = [
    zonedDateTimeToUtc(nowParts.year, 1, 1, hour, minute, 0, timeZone),
    zonedDateTimeToUtc(nowParts.year, 7, 1, hour, minute, 0, timeZone),
    zonedDateTimeToUtc(nowParts.year + 1, 1, 1, hour, minute, 0, timeZone)
  ]
    .filter((candidate) => candidate.getTime() > now.getTime())
    .sort((first, second) => first.getTime() - second.getTime())[0];

  return {
    delayMs: target.getTime() - now.getTime(),
    label: `${formatZonedDate(target, timeZone)} ${pad(hour)}:${pad(minute)} ${timeZone}`
  };
}

function parseDailyTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 3, minute: 30 };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { hour: 3, minute: 30 };

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
