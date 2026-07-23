import { run_incremental_update } from "@/core_data/ingestion-jobs";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { runSportsRuFantasySyncNow } from "@/server/sports-ru-fantasy-sync-scheduler";
import { syncMissingFotMobPlayerSeasonArchives } from "@/providers/fotmob/sync-player-season-archives";

const DEFAULT_SYNC_TIME = "03:00";
const DEFAULT_TIME_ZONE = "Europe/Moscow";
const INGESTION_POLL_INTERVAL_MS = 30_000;
const INGESTION_MAX_WAIT_MS = 12 * 60 * 60 * 1000;
const logger = createLogger("ingestion");

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

  logger.info("Scheduled shared FotMob incremental update.", { scheduledFor: schedule.label });
}

async function runScheduledSync(state: SchedulerState, scheduledFor: string) {
  if (state.running) return;

  state.running = true;
  try {
    logger.info("Queueing scheduled shared FotMob incremental update.", { scheduledFor });
    const queued = await run_incremental_update(prisma, { startedByUserId: null });
    logger.info("Scheduled shared FotMob incremental update queued for the ingestion worker loop.", { jobId: queued.job.id });
    const terminalStatus = await waitForIngestionJobTerminal(prisma, queued.job.id);
    if (terminalStatus === "completed" || terminalStatus === "completed_with_errors") {
      try {
        const archiveResult = await syncMissingFotMobPlayerSeasonArchives(prisma);
        logger.info("Post-FotMob gap-only player archive sync finished.", archiveResult);
      } catch (error) {
        logger.error("Post-FotMob player archive sync failed; continuing with Sports.ru sync.", { error });
      }
      const sportsRu = await runSportsRuFantasySyncNow("post-fotmob");
      logger.info("Post-FotMob Sports.ru fantasy price sync finished.", {
        jobId: queued.job.id,
        ingestionStatus: terminalStatus,
        ...sportsRu
      });
    } else {
      logger.warn("Post-FotMob Sports.ru fantasy price sync was not started because ingestion did not complete.", {
        jobId: queued.job.id,
        ingestionStatus: terminalStatus
      });
    }
  } catch (error) {
    logger.error("Scheduled shared FotMob incremental update crashed.", { error });
  } finally {
    state.running = false;
  }
}

export async function waitForIngestionJobTerminal(
  database: Pick<typeof prisma, "ingestionJob">,
  jobId: string,
  options: { pollIntervalMs?: number; maximumWaitMs?: number; wait?: (delayMs: number) => Promise<void> } = {}
) {
  const pollIntervalMs = options.pollIntervalMs ?? INGESTION_POLL_INTERVAL_MS;
  const maximumWaitMs = options.maximumWaitMs ?? INGESTION_MAX_WAIT_MS;
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maximumWaitMs) {
    const job = await database.ingestionJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) return "missing";
    if (["completed", "completed_with_errors", "failed", "cancelled"].includes(job.status)) return job.status;
    await wait(pollIntervalMs);
  }

  return "timeout";
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
