import { prisma } from "@/lib/db";
import { fantasySquadLeagueFotMobIds } from "@/lib/leagues/display";
import { createLogger } from "@/lib/logger";
import { syncFonbetFixtureOdds } from "@/machete/fixture-odds-sync";

const logger = createLogger("fixture-odds:scheduler");
const beforeRoundMs = 3 * 60 * 60 * 1_000;
const retryDelayMs = 30 * 60 * 1_000;
const maximumPlanningSleepMs = 6 * 60 * 60 * 1_000;
const scheduleLookbackMs = 7 * 24 * 60 * 60 * 1_000;
const scheduleLookaheadMs = 45 * 24 * 60 * 60 * 1_000;

type SchedulerState = {
  running: boolean;
  started: boolean;
  attemptedTriggerKeys: Set<string>;
  retryOverdueAt?: Date;
  timer?: ReturnType<typeof setTimeout>;
};

export type FixtureOddsScheduleMatch = {
  id: bigint;
  leagueId: bigint | null;
  season: string | null;
  round: string | null;
  matchDate: Date | null;
  finished: boolean;
  oddsFetchedAt: Date | null;
};

export type FixtureOddsSyncTrigger = {
  key: string;
  kind: "ROUND_DAILY" | "ROUND_FINAL";
  dueAt: Date;
  matchIds: bigint[];
};

const globalForScheduler = globalThis as unknown as { fixtureOddsScheduler?: SchedulerState };

export function startFixtureOddsScheduler() {
  if (process.env.FIXTURE_ODDS_SYNC_ENABLED === "false") return;
  const state = globalForScheduler.fixtureOddsScheduler ?? { running: false, started: false, attemptedTriggerKeys: new Set<string>() };
  state.attemptedTriggerKeys ??= new Set<string>();
  if (state.started) return;
  state.started = true;
  globalForScheduler.fixtureOddsScheduler = state;
  void planNextSync(state);
}

async function planNextSync(state: SchedulerState) {
  try {
    const now = new Date();
    const matches = await loadScheduleMatches(now);
    const triggers = fixtureOddsSyncTriggers(matches);
    const pending = pendingFixtureOddsSyncTriggers(matches, triggers)
      .filter((trigger) => !state.attemptedTriggerKeys.has(trigger.key));
    const nextDueAt = nextFixtureOddsSyncAt(pending, now, state.retryOverdueAt);
    const delayMs = nextDueAt === null
      ? maximumPlanningSleepMs
      : Math.min(Math.max(nextDueAt.getTime() - now.getTime(), 0), maximumPlanningSleepMs);
    scheduleTimer(state, delayMs, pending.filter((trigger) => trigger.dueAt <= now).map((trigger) => trigger.key));
  } catch (error) {
    logger.error("Fixture odds schedule planning failed; existing snapshots were preserved.", { error });
    scheduleTimer(state, retryDelayMs, []);
  }
}

function scheduleTimer(state: SchedulerState, delayMs: number, overdueTriggerKeys: string[]) {
  state.timer = setTimeout(async () => {
    if (overdueTriggerKeys.length > 0) {
      const succeeded = await runSync(state, overdueTriggerKeys);
      if (succeeded) {
        for (const key of overdueTriggerKeys) state.attemptedTriggerKeys.add(key);
        state.retryOverdueAt = undefined;
      } else {
        state.retryOverdueAt = new Date(Date.now() + retryDelayMs);
      }
    }
    await planNextSync(state);
  }, delayMs);
  state.timer.unref?.();
  logger.info("Scheduled fixture odds synchronization check.", { delayMs, overdueTriggerKeys });
}

async function runSync(state: SchedulerState, triggerKeys: string[]) {
  if (state.running) return false;
  state.running = true;
  try {
    const result = await syncFonbetFixtureOdds(prisma);
    logger.info("Fixture odds synchronized.", { triggerKeys, ...result });
    return true;
  } catch (error) {
    logger.error("Fixture odds synchronization failed; existing snapshots were preserved.", { triggerKeys, error });
    return false;
  } finally {
    state.running = false;
  }
}

async function loadScheduleMatches(now: Date): Promise<FixtureOddsScheduleMatch[]> {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId: { in: fantasySquadLeagueFotMobIds.map(BigInt) },
      cancelled: false,
      matchDate: {
        gte: new Date(now.getTime() - scheduleLookbackMs),
        lte: new Date(now.getTime() + scheduleLookaheadMs)
      }
    },
    select: {
      id: true,
      leagueId: true,
      season: true,
      round: true,
      matchDate: true,
      finished: true,
      oddsSnapshots: {
        where: { provider: "FONBET" },
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { fetchedAt: true }
      }
    }
  });
  return matches.map((match) => ({
    ...match,
    oddsFetchedAt: match.oddsSnapshots[0]?.fetchedAt ?? null
  }));
}

export function fixtureOddsSyncTriggers(matches: FixtureOddsScheduleMatch[]): FixtureOddsSyncTrigger[] {
  const triggers: FixtureOddsSyncTrigger[] = [];
  const rounds = new Map<string, FixtureOddsScheduleMatch[]>();
  for (const match of matches) {
    if (match.leagueId === null || !match.matchDate) continue;
    const round = match.round?.trim();
    const key = round && match.season
      ? `${match.leagueId}:${match.season}:${round}`
      : `match:${match.id}`;
    const group = rounds.get(key) ?? [];
    group.push(match);
    rounds.set(key, group);
  }
  for (const [key, roundMatches] of rounds) {
    const futureMatches = roundMatches.filter((match) => !match.finished && match.matchDate !== null);
    if (futureMatches.length === 0) continue;
    const firstKickoff = Math.min(...roundMatches.map((match) => match.matchDate!.getTime()));
    for (let daysBefore = 30; daysBefore >= 1; daysBefore -= 1) {
      triggers.push({
        key: `round:${key}:${daysBefore}-days-before`,
        kind: "ROUND_DAILY",
        dueAt: new Date(firstKickoff - daysBefore * 24 * 60 * 60 * 1_000),
        matchIds: futureMatches.map((match) => match.id)
      });
    }
    triggers.push({
      key: `round:${key}:final-three-hours-before`,
      kind: "ROUND_FINAL",
      dueAt: new Date(firstKickoff - beforeRoundMs),
      matchIds: futureMatches.map((match) => match.id)
    });
  }
  return triggers.sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime() || left.key.localeCompare(right.key));
}

export function pendingFixtureOddsSyncTriggers(
  matches: FixtureOddsScheduleMatch[],
  triggers = fixtureOddsSyncTriggers(matches)
) {
  const fetchedAtByMatch = new Map(matches.map((match) => [String(match.id), match.oddsFetchedAt]));
  return triggers.filter((trigger) => trigger.matchIds.some((matchId) => {
    const fetchedAt = fetchedAtByMatch.get(String(matchId));
    return fetchedAt === null || fetchedAt === undefined || fetchedAt < trigger.dueAt;
  }));
}

export function nextFixtureOddsSyncAt(
  pending: FixtureOddsSyncTrigger[],
  now: Date,
  retryOverdueAt?: Date
) {
  if (pending.length === 0) return null;
  const overdue = pending.some((trigger) => trigger.dueAt <= now);
  const nextFuture = pending.find((trigger) => trigger.dueAt > now)?.dueAt ?? null;
  if (!overdue) return nextFuture;
  const overdueAt = retryOverdueAt && retryOverdueAt > now ? retryOverdueAt : now;
  return nextFuture && nextFuture < overdueAt ? nextFuture : overdueAt;
}
