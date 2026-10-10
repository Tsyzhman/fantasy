import { schedulerRuntimePlan } from "./server/scheduler-runtime-role";
import type { Instrumentation } from "next";
import { createHash } from "node:crypto";

/** @spec spec://common/INFRA-006-continuous-deployment#observability */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const detail = error && typeof error === "object" ? error as { digest?: string; code?: string; name?: string } : {};
  console.error(JSON.stringify({ scope: "request-error", timestamp: new Date().toISOString(), pid: process.pid,
    commit: process.env.APP_RELEASE_COMMIT, requestId: request.headers["x-request-id"], method: request.method,
    route: context.routePath, routeType: context.routeType, errorName: detail.name, code: detail.code, digest: detail.digest,
    errorFingerprint: createHash("sha256").update(message).digest("hex").slice(0, 16) }));
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startRuntimeDiagnostics } = await import("./server/runtime-diagnostics");
  startRuntimeDiagnostics();

  if (process.env.FANTASY_MODEL_FORECAST_CHILD === "true") {
    let exitCode = 1;
    try {
      const { runFantasyModelForecastSyncNow } = await import("./server/fantasy-model-forecast-scheduler");
      exitCode = await runFantasyModelForecastSyncNow() ? 0 : 1;
    } catch (error) {
      console.error("Isolated fantasy model forecast recalculation crashed.", error);
    } finally {
      const { prisma } = await import("./lib/db");
      await prisma.$disconnect().catch((error) => console.error("Could not disconnect isolated forecast database client.", error));
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    process.exit(exitCode);
  }

  const plan = schedulerRuntimePlan();

  if (plan.worker) {
    const { startSessionRetention } = await import("./server/session-retention");
    startSessionRetention();
    // @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime
    const { startSorareInsideScheduler } = await import("./server/sorareinside-scheduler");
    startSorareInsideScheduler();
    const { startKhlCatalogScheduler } = await import("./server/khl/catalog-scheduler");
    startKhlCatalogScheduler();
    // @spec spec://modules/betting/FEAT-001-virtual-league#runtime
    const { startBettingLeague } = await import("./betting/sync");
    startBettingLeague();
    const { startMacheteDailyFotMobSyncScheduler } = await import("./server/machete-daily-sync");
    const { startIngestionWorkerLoop } = await import("./server/ingestion-worker-loop");
    const { startLeagueSeasonRetentionScheduler } = await import("./server/league-season-retention-scheduler");
    const { startDataQualityAuditScheduler } = await import("./server/data-quality-audit-scheduler");
    const { startSportsRuFantasySyncScheduler } = await import("./server/sports-ru-fantasy-sync-scheduler");
    const { startSportsRuSquadSnapshotScheduler } = await import("./server/sports-ru-squad-snapshot-scheduler");
    const { startFixtureOddsScheduler } = await import("./server/fixture-odds-scheduler");
    const { startSquadPlanningSnapshotScheduler } = await import("./server/squad-planning-snapshot-scheduler");
    const { startFoontasyForecastScheduler } = await import("./server/foontasy-forecast-scheduler");
    const { startFantasyModelForecastScheduler } = await import("./server/fantasy-model-forecast-scheduler");
    const { startFantasyPlayerPoolSnapshotScheduler } = await import("./server/fantasy-player-pool-snapshot-scheduler");
    // @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
    const { startSportsTrendsScheduler } = await import("./server/sports-trends/scheduler");
    // @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
    const { startDeadlineReportScheduler } = await import("./server/deadline-reports/scheduler");
    // @spec spec://modules/telegram/FEAT-007-deadline-assistant#actors
    const { startTelegramPollingScheduler } = await import("./server/telegram/polling");

    startMacheteDailyFotMobSyncScheduler();
    startLeagueSeasonRetentionScheduler();
    startDataQualityAuditScheduler();
    startSportsRuFantasySyncScheduler();
    startSportsRuSquadSnapshotScheduler();
    startFixtureOddsScheduler();
    startSquadPlanningSnapshotScheduler();
    startFoontasyForecastScheduler();
    startFantasyModelForecastScheduler();
    startFantasyPlayerPoolSnapshotScheduler();
    startSportsTrendsScheduler();
    startDeadlineReportScheduler();
    startTelegramPollingScheduler();
    startIngestionWorkerLoop();
  }

  // @spec spec://common/INFRA-006-continuous-deployment#runtime
  if (plan.fpl || plan.probableLineups) {
    const { startWebSchedulersWhenActivated } = await import("./server/web-scheduler-activation");
    startWebSchedulersWhenActivated(async () => {
      console.info("Web schedules activated.", { commit: process.env.APP_RELEASE_COMMIT, fpl: plan.fpl, probableLineups: plan.probableLineups });
      if (plan.fpl) {
        const { startFplPriceSyncScheduler } = await import("./server/fpl-price-sync-scheduler");
        startFplPriceSyncScheduler();
      }
      if (plan.probableLineups) {
        const { startProbableLineupScheduler } = await import("./server/probable-lineup-scheduler");
        startProbableLineupScheduler();
      }
    }, { onError: (error) => console.error("Web scheduler activation failed.", error) });
  }
}
