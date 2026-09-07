import { schedulerRuntimePlan } from "./server/scheduler-runtime-role";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
    startIngestionWorkerLoop();
  }

  if (plan.fpl) {
    const { startFplPriceSyncScheduler } = await import("./server/fpl-price-sync-scheduler");
    startFplPriceSyncScheduler();
  }

  if (plan.probableLineups) {
    const { startProbableLineupScheduler } = await import("./server/probable-lineup-scheduler");
    startProbableLineupScheduler();
  }
}
