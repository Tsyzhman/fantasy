/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime */
import { prisma } from "../lib/db";
import { createLogger } from "../lib/logger";
import { SorareInsideClient } from "../providers/sorareinside/client";
import { runSorareInsideSync, safeError } from "../machete/sorareinside-sync";

const logger = createLogger("sorareinside:scheduler");

export interface SorareInsideRefreshResult {
  status: string;
  startedAt: string;
  finishedAt?: string;
  totals: Record<string, number>;
  byScope: Record<string, Record<string, number>>;
  rssMiB?: number;
}

/**
 * Share a pending refresh and retain one bounded summary without player payloads.
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/machete/INFRA-004-sorareinside-starters#errors
 */
export function createSorareInsideRefreshRunner(run: () => Promise<SorareInsideRefreshResult>) {
  let pending: Promise<SorareInsideRefreshResult> | undefined;
  let last: SorareInsideRefreshResult | undefined;
  const satisfies = (result: SorareInsideRefreshResult, threshold: Date) =>
    (result.status === "SUCCEEDED" || result.status === "PARTIAL") && Date.parse(result.startedAt) >= threshold.getTime();
  return async (notBefore?: Date): Promise<SorareInsideRefreshResult> => {
    while (pending) {
      const result = await pending;
      if (!notBefore || satisfies(result, notBefore)) return result;
    }
    if (notBefore && last && satisfies(last, notBefore)) return last;
    const task = run();
    pending = task;
    try {
      const result = await task;
      if (result.status === "SUCCEEDED" || result.status === "PARTIAL") last = result;
      return result;
    } finally {
      if (pending === task) pending = undefined;
    }
  };
}

type State = {
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  client?: SorareInsideClient;
  refresh?: ReturnType<typeof createSorareInsideRefreshRunner>;
};
const globalState = globalThis as unknown as { sorareInsideScheduler?: State };
const schedulerState = () => globalState.sorareInsideScheduler ?? (globalState.sorareInsideScheduler = { started: false });

export function nextSorareInsideSyncAt(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(5, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime
 */
export async function runSorareInsideSyncNow(options: { notBefore?: Date } = {}): Promise<SorareInsideRefreshResult | null> {
  if (process.env.SORAREINSIDE_SYNC_ENABLED !== "true") return null;
  const email = process.env.SORAREINSIDE_EMAIL;
  const password = process.env.SORAREINSIDE_PASSWORD;
  if (!email || !password) return null;
  const state = schedulerState();
  state.client ??= new SorareInsideClient({ email, password });
  state.refresh ??= createSorareInsideRefreshRunner(async () => {
    const result = await runSorareInsideSync(prisma, state.client!, true);
    logger.info("SorareInside sync finished", {
      status: result.status, totals: result.totals, startedAt: result.startedAt,
      finishedAt: result.finishedAt, rssMiB: result.rssMiB
    });
    const byScope: Record<string, Record<string, number>> = {};
    for (const team of result.teams) {
      const totals = byScope[`${team.leagueId}:${team.season}`] ??= {};
      totals[team.status] = (totals[team.status] ?? 0) + 1;
      if (!["APPLIED", "UNCHANGED"].includes(team.status)) {
        logger.warn("SorareInside team preserved", { ...team, players: team.players?.filter((player) => !player.playerId) });
      }
    }
    return { status: result.status, totals: result.totals, byScope, startedAt: result.startedAt,
      finishedAt: result.finishedAt, rssMiB: result.rssMiB };
  });
  return state.refresh(options.notBefore);
}

export function startSorareInsideScheduler() {
  if (process.env.SORAREINSIDE_SYNC_ENABLED !== "true") return;
  const state = schedulerState();
  if (state.started) return;
  if (!process.env.SORAREINSIDE_EMAIL || !process.env.SORAREINSIDE_PASSWORD) {
    logger.error("SorareInside credentials are missing");
    return;
  }
  state.started = true;
  const schedule = () => {
    const next = nextSorareInsideSyncAt(new Date());
    state.timer = setTimeout(() => { void run().finally(schedule); }, next.getTime() - Date.now());
    state.timer.unref?.();
    logger.info("Next SorareInside sync scheduled", { runAt: next.toISOString() });
  };
  const run = async () => {
    try { await runSorareInsideSyncNow(); }
    catch (error) { logger.error("SorareInside sync failed; prior flags preserved for unapplied teams", { error: safeError(error) }); }
  };
  void run().finally(schedule);
}
