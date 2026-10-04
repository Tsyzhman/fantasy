/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { refreshFantasyPlayerPoolSnapshots, type FantasyPlayerPoolSnapshotRefreshResult } from "@/machete/fantasy-player-pool-snapshots";
import { drainCurrentXiTeamSnapshotRefreshQueue } from "@/machete/fantasy-player-pool-refresh-queue";

export const FANTASY_PLAYER_POOL_SNAPSHOT_TIME_ZONE = "Europe/Moscow";
export const FANTASY_PLAYER_POOL_SNAPSHOT_MINUTE = 0;
export const FANTASY_PLAYER_POOL_SNAPSHOT_HOURS = Array.from({ length: 14 }, (_, index) => index + 10);
export const FANTASY_PLAYER_POOL_REFRESH_QUEUE_POLL_MS = 2_000;

const logger = createLogger("fantasy-player-pool-snapshots:scheduler");
type RefreshTrigger = "SCHEDULED" | "MANUAL" | "BOOTSTRAP";

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  queueTimer?: ReturnType<typeof setTimeout>;
  pendingFullRefresh?: RefreshTrigger;
};

const globalForScheduler = globalThis as unknown as {
  fantasyPlayerPoolSnapshotScheduler?: SchedulerState;
};

export function startFantasyPlayerPoolSnapshotScheduler() {
  if (process.env.FANTASY_PLAYER_POOL_SNAPSHOT_ENABLED === "false") return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state);
  scheduleQueueDrain(state);
  void runFantasyPlayerPoolSnapshotRefreshNow("BOOTSTRAP");
  logger.info("Started hourly fantasy player-pool snapshot scheduler.", {
    timezone: FANTASY_PLAYER_POOL_SNAPSHOT_TIME_ZONE,
    hours: FANTASY_PLAYER_POOL_SNAPSHOT_HOURS
  });
}

export async function runFantasyPlayerPoolSnapshotRefreshNow(
  trigger: RefreshTrigger = "MANUAL"
) {
  const state = schedulerState();
  if (state.running) {
    state.pendingFullRefresh = trigger;
    return { started: false, queued: true, trigger } as const;
  }
  state.running = true;
  try {
    const options = { onlyMissing: trigger === "BOOTSTRAP" };
    const script = join(process.cwd(), "scripts", "player-pool-refresh.cjs");
    const result = existsSync(script)
      ? await runPlayerPoolRefreshProcess(script, options.onlyMissing)
      : await refreshFantasyPlayerPoolSnapshots(prisma, options);
    logger.info("Fantasy player-pool snapshot cycle finished.", { trigger, ...result });
    return { started: true, trigger, result } as const;
  } catch (error) {
    logger.error("Fantasy player-pool snapshot cycle failed; READY revisions were preserved.", { trigger, error });
    return { started: true, trigger, error: error instanceof Error ? error.message : String(error) } as const;
  } finally {
    state.running = false;
    runPendingFullRefresh(state);
  }
}

/** Full refresh keeps the scheduler's running lock until the child has exited. */
export function runPlayerPoolRefreshProcess(script: string, onlyMissing: boolean) {
  return new Promise<FantasyPlayerPoolSnapshotRefreshResult>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...(onlyMissing ? ["--only-missing"] : [])], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let result: FantasyPlayerPoolSnapshotRefreshResult | undefined;
    child.on("message", (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message) || message.type !== "player-pool-result" || !("result" in message)) return;
      const value = message.result as FantasyPlayerPoolSnapshotRefreshResult | undefined;
      if (value && Number.isInteger(value.scopes) && Number.isInteger(value.snapshots) && Number.isInteger(value.players) && Array.isArray(value.failed)) result = value;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 && result) resolve(result);
      else reject(new Error(`Isolated player-pool refresh failed (code=${code}, signal=${signal}, result=${Boolean(result)}).`));
    });
  });
}

export function nextFantasyPlayerPoolSnapshotRun(
  now: Date,
  timeZone = FANTASY_PLAYER_POOL_SNAPSHOT_TIME_ZONE
) {
  const parts = getZonedParts(now, timeZone);
  const candidates = FANTASY_PLAYER_POOL_SNAPSHOT_HOURS
    .map((hour) => zonedDateTimeToUtc(parts.year, parts.month, parts.day, hour, FANTASY_PLAYER_POOL_SNAPSHOT_MINUTE, 0, timeZone))
    .filter((candidate) => candidate.getTime() > now.getTime())
    .sort((left, right) => left.getTime() - right.getTime());
  const runAt = candidates[0] ?? zonedDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day + 1,
    FANTASY_PLAYER_POOL_SNAPSHOT_HOURS[0],
    FANTASY_PLAYER_POOL_SNAPSHOT_MINUTE,
    0,
    timeZone
  );
  const runParts = getZonedParts(runAt, timeZone);
  return {
    runAt,
    delayMs: Math.max(0, runAt.getTime() - now.getTime()),
    slotKey: `${runParts.year}-${pad(runParts.month)}-${pad(runParts.day)}-${pad(runParts.hour)}${pad(runParts.minute)}`,
    label: `${runParts.year}-${pad(runParts.month)}-${pad(runParts.day)} ${pad(runParts.hour)}:${pad(runParts.minute)} ${timeZone}`
  };
}

function scheduleNextRun(state: SchedulerState) {
  if (!state.started) return;
  const schedule = nextFantasyPlayerPoolSnapshotRun(new Date());
  state.timer = setTimeout(async () => {
    await runFantasyPlayerPoolSnapshotRefreshNow("SCHEDULED");
    scheduleNextRun(state);
  }, schedule.delayMs);
  state.timer.unref?.();
  logger.info("Scheduled next fantasy player-pool snapshot cycle.", {
    scheduledFor: schedule.label,
    slotKey: schedule.slotKey
  });
}

function scheduleQueueDrain(state: SchedulerState) {
  if (!state.started) return;
  state.queueTimer = setTimeout(async () => {
    // Full and incremental calculations never overlap in the worker. Keeping
    // one heavy pool alive also bounds transient memory across all leagues.
    if (!state.running) {
      state.running = true;
      try {
        await drainCurrentXiTeamSnapshotRefreshQueue(prisma);
      } catch (error) {
        logger.error("Could not drain persistent CURRENT_XI refresh queue.", { error });
      } finally {
        state.running = false;
        runPendingFullRefresh(state);
      }
    }
    scheduleQueueDrain(state);
  }, FANTASY_PLAYER_POOL_REFRESH_QUEUE_POLL_MS);
  state.queueTimer.unref?.();
}

function runPendingFullRefresh(state: SchedulerState) {
  const trigger = state.pendingFullRefresh;
  if (!trigger) return;
  state.pendingFullRefresh = undefined;
  void runFantasyPlayerPoolSnapshotRefreshNow(trigger);
}

function schedulerState() {
  return globalForScheduler.fantasyPlayerPoolSnapshotScheduler ??
    (globalForScheduler.fantasyPlayerPoolSnapshotScheduler = { running: false, started: false });
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) {
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
