export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureDatabaseSchema } = await import("./lib/db");
  const { startMacheteDailyFotMobSyncScheduler } = await import("./server/machete-daily-sync");
  const { startIngestionWorkerLoop } = await import("./server/ingestion-worker-loop");
  const { startLeagueSeasonRetentionScheduler } = await import("./server/league-season-retention-scheduler");

  await ensureDatabaseSchema();
  startMacheteDailyFotMobSyncScheduler();
  startLeagueSeasonRetentionScheduler();
  startIngestionWorkerLoop();
}
