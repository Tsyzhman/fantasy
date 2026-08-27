import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  applyProbableLineupTeamPlan,
  buildProbableLineupSyncPlan,
  fetchProbableLineupPage,
  PROBABLE_LINEUP_SOURCE_DEFINITIONS,
  type ProbableLineupSourceKey
} from "@/machete/probable-lineup-sync";

export const PROBABLE_LINEUP_SYNC_HOUR_UTC = 14;
export const PROBABLE_LINEUP_SYNC_MINUTE_UTC = 30;

const logger = createLogger("probable-lineups:scheduler");

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

type SourceRunResult = {
  source: ProbableLineupSourceKey;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  parsedTeams: number;
  appliedTeams: number;
  unchangedTeams: number;
  skippedTeams: number;
  failedTeams: number;
  error: string | null;
};

export type ProbableLineupScheduledRunResult = {
  started: boolean;
  sourceFailures: number;
  teamFailures: number;
  skippedTeams: number;
  appliedTeams: number;
  unchangedTeams: number;
  sources: SourceRunResult[];
};

const globalForScheduler = globalThis as unknown as {
  probableLineupScheduler?: SchedulerState;
};

export function startProbableLineupScheduler() {
  if (process.env.PROBABLE_LINEUP_SYNC_ENABLED === "false") return;
  const state = probableLineupSchedulerState();
  if (state.started) return;

  state.started = true;
  void runProbableLineupSyncNow("STARTUP").finally(() => scheduleNextRun(state));
  logger.info("Started probable-lineup scheduler with startup catch-up.", {
    scheduledTime: `${String(PROBABLE_LINEUP_SYNC_HOUR_UTC).padStart(2, "0")}:${String(PROBABLE_LINEUP_SYNC_MINUTE_UTC).padStart(2, "0")} UTC`
  });
}

export async function runProbableLineupSyncNow(
  trigger: "STARTUP" | "SCHEDULED" | "MANUAL"
): Promise<ProbableLineupScheduledRunResult> {
  if (trigger !== "MANUAL" && process.env.PROBABLE_LINEUP_SYNC_ENABLED === "false") {
    return emptyRunResult(false);
  }

  const state = probableLineupSchedulerState();
  if (state.running) {
    logger.info("Probable-lineup sync is already running; the trigger was skipped.", { trigger });
    return emptyRunResult(false);
  }

  state.running = true;
  const sources: SourceRunResult[] = [];
  try {
    for (const definition of PROBABLE_LINEUP_SOURCE_DEFINITIONS) {
      try {
        const fetchedAt = new Date();
        const page = await fetchProbableLineupPage(definition);
        const plan = await buildProbableLineupSyncPlan(prisma, { definition, page, fetchedAt });
        let appliedTeams = 0;
        let raceUnchangedTeams = 0;
        let failedTeams = 0;

        for (const team of plan.teams) {
          if (team.status !== "READY") continue;
          try {
            const result = await applyProbableLineupTeamPlan(prisma, team);
            if (result.status === "APPLIED") appliedTeams += 1;
            else raceUnchangedTeams += 1;
          } catch (error) {
            failedTeams += 1;
            logger.error("Probable lineup failed for one team; that team's prior flags were preserved.", {
              trigger,
              source: definition.key,
              team: team.databaseTeamName ?? team.sourceLineup.teamName,
              error: errorMessage(error)
            });
          }
        }

        const unchangedTeams = plan.teams.filter((team) => team.status === "UNCHANGED").length + raceUnchangedTeams;
        const skippedTeams = plan.teams.filter((team) =>
          team.status === "TEAM_UNMATCHED" || team.status === "PLAYERS_UNMATCHED"
        ).length;
        const status = failedTeams > 0 || skippedTeams > 0 ? "PARTIAL" : "SUCCEEDED";
        const result: SourceRunResult = {
          source: definition.key,
          status,
          parsedTeams: plan.parsedTeams,
          appliedTeams,
          unchangedTeams,
          skippedTeams,
          failedTeams,
          error: null
        };
        sources.push(result);

        const message = "Probable-lineup source synchronized.";
        if (status === "SUCCEEDED") logger.info(message, { trigger, ...result });
        else logger.warn(message, { trigger, ...result });
      } catch (error) {
        const result: SourceRunResult = {
          source: definition.key,
          status: "FAILED",
          parsedTeams: 0,
          appliedTeams: 0,
          unchangedTeams: 0,
          skippedTeams: 0,
          failedTeams: 0,
          error: errorMessage(error)
        };
        sources.push(result);
        logger.error("Probable-lineup source failed; its prior starting flags were preserved.", {
          trigger,
          ...result
        });
      }
    }
  } finally {
    state.running = false;
  }

  const result = summarizeRun(sources);
  logger.info("Probable-lineup synchronization cycle finished.", { trigger, ...result });
  return result;
}

export function nextProbableLineupSyncAt(now: Date) {
  const runAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    PROBABLE_LINEUP_SYNC_HOUR_UTC,
    PROBABLE_LINEUP_SYNC_MINUTE_UTC,
    0
  ));
  if (runAt.getTime() <= now.getTime()) runAt.setUTCDate(runAt.getUTCDate() + 1);

  return {
    runAt,
    delayMs: Math.max(0, runAt.getTime() - now.getTime()),
    label: `${runAt.toISOString().slice(0, 10)} ${String(PROBABLE_LINEUP_SYNC_HOUR_UTC).padStart(2, "0")}:${String(PROBABLE_LINEUP_SYNC_MINUTE_UTC).padStart(2, "0")} UTC`
  };
}

function scheduleNextRun(state: SchedulerState) {
  if (!state.started) return;
  const schedule = nextProbableLineupSyncAt(new Date());
  state.timer = setTimeout(async () => {
    await runProbableLineupSyncNow("SCHEDULED");
    scheduleNextRun(state);
  }, schedule.delayMs);
  state.timer.unref?.();
  logger.info("Scheduled next probable-lineup synchronization.", { scheduledFor: schedule.label });
}

function probableLineupSchedulerState() {
  return globalForScheduler.probableLineupScheduler ??
    (globalForScheduler.probableLineupScheduler = { running: false, started: false });
}

function summarizeRun(sources: SourceRunResult[]): ProbableLineupScheduledRunResult {
  return {
    started: true,
    sourceFailures: sources.filter((source) => source.status === "FAILED").length,
    teamFailures: sources.reduce((total, source) => total + source.failedTeams, 0),
    skippedTeams: sources.reduce((total, source) => total + source.skippedTeams, 0),
    appliedTeams: sources.reduce((total, source) => total + source.appliedTeams, 0),
    unchangedTeams: sources.reduce((total, source) => total + source.unchangedTeams, 0),
    sources
  };
}

function emptyRunResult(started: boolean): ProbableLineupScheduledRunResult {
  return {
    started,
    sourceFailures: 0,
    teamFailures: 0,
    skippedTeams: 0,
    appliedTeams: 0,
    unchangedTeams: 0,
    sources: []
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
