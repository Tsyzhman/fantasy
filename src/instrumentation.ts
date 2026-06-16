export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMacheteDailyFotMobSyncScheduler } = await import("./server/machete-daily-sync");
  const { startIngestionWorkerLoop } = await import("./server/ingestion-worker-loop");
  const { startLeagueSeasonRetentionScheduler } = await import("./server/league-season-retention-scheduler");

  startMacheteDailyFotMobSyncScheduler();
  startLeagueSeasonRetentionScheduler();
  startIngestionWorkerLoop();
}
