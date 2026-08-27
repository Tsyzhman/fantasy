export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
  const { startFplPriceSyncScheduler } = await import("./server/fpl-price-sync-scheduler");
  const { startProbableLineupScheduler } = await import("./server/probable-lineup-scheduler");

  startMacheteDailyFotMobSyncScheduler();
  startLeagueSeasonRetentionScheduler();
  startDataQualityAuditScheduler();
  startSportsRuFantasySyncScheduler();
  startSportsRuSquadSnapshotScheduler();
  startFixtureOddsScheduler();
  startSquadPlanningSnapshotScheduler();
  startFoontasyForecastScheduler();
  startFantasyModelForecastScheduler();
  startFplPriceSyncScheduler();
  startProbableLineupScheduler();
  startIngestionWorkerLoop();
}
