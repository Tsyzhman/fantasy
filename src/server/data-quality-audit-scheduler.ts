import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { runFantasyDataQualityAudit } from "@/machete/data_quality_audit";
import { readDataQualityAuditScheduleConfig } from "@/machete/data_quality_schedule";
import { loadActiveFantasySourceScopes } from "./fantasy-source-registry";

const DEFAULT_AUDIT_TIME = "10:00";
const DEFAULT_TIME_ZONE = "Europe/Moscow";
const logger = createLogger("data-quality:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  dataQualityAuditScheduler?: SchedulerState;
};

export function startDataQualityAuditScheduler() {
  if (process.env.DATA_QUALITY_AUDIT_ENABLED === "false") return;

  try {
    const config = readDataQualityAuditScheduleConfig();
    void config;
  } catch (error) {
    logger.error("Scheduled data-quality audit configuration is invalid.", { error });
    return;
  }

  const state =
    globalForScheduler.dataQualityAuditScheduler ??
    ({
      running: false,
      started: false
    } satisfies SchedulerState);
  if (state.started) return;

  state.started = true;
  globalForScheduler.dataQualityAuditScheduler = state;
  scheduleNextRun(state);
}

function scheduleNextRun(state: SchedulerState) {
  const schedule = nextDailyRun();
  state.timer = setTimeout(async () => {
    await runScheduledAudit(state, schedule.label);
    scheduleNextRun(state);
  }, schedule.delayMs);
  state.timer.unref?.();

  logger.info("Scheduled fantasy data-quality audit.", { scheduledFor: schedule.label });
}

async function runScheduledAudit(state: SchedulerState, scheduledFor: string) {
  if (state.running) return;
  state.running = true;

  try {
    const config = readDataQualityAuditScheduleConfig();
    config.scopes = await loadActiveFantasySourceScopes(prisma);
    if (config.scopes.length === 0) throw new Error("No active fantasy source scopes.");

    for (const scope of config.scopes) {
      logger.info("Running scheduled fantasy data-quality audit.", { scheduledFor, ...scope });
      try {
        const report = await runFantasyDataQualityAudit(prisma, {
          ...scope,
          coveragePercent: config.coveragePercent,
          maximumLatencyHours: config.maximumLatencyHours
        });
        const fields = {
          runId: report.runId,
          leagueId: report.scope.leagueId,
          season: report.scope.season,
          gatePassed: report.quality.betaGate.passed,
          reasons: report.quality.betaGate.reasons
        };
        if (report.quality.betaGate.passed) logger.info("Scheduled fantasy data-quality audit passed.", fields);
        else logger.warn("Scheduled fantasy data-quality audit failed its beta gate.", fields);
      } catch (error) {
        logger.error("Scheduled fantasy data-quality audit scope crashed.", { ...scope, error });
      }
    }
  } catch (error) {
    logger.error("Scheduled fantasy data-quality audit crashed.", { error });
  } finally {
    state.running = false;
  }
}

function nextDailyRun() {
  const { hour, minute } = parseDailyTime(process.env.DATA_QUALITY_AUDIT_TIME ?? DEFAULT_AUDIT_TIME);
  const timeZone = process.env.DATA_QUALITY_AUDIT_TIMEZONE ?? DEFAULT_TIME_ZONE;
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

function parseDailyTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 10, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { hour: 10, minute: 0 };
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

function formatZonedDate(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
