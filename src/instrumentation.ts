import { schedulerRuntimePlan } from "./server/scheduler-runtime-role";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const plan = schedulerRuntimePlan();

  if (plan.worker) {
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
