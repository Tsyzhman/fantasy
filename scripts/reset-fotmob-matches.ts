// Wipe FotMob-sourced match data so the next sync re-pulls everything clean.
//
// Deletes (in dependency-safe order):
//   - MachetePlayerSnapshot
//   - MachetePlayerMatchStat
//   - MacheteFixture            (incl. synthetic SEASON_AGGREGATE rows)
//   - MacheteRawPayload         (cached FotMob payloads)
//   - MacheteSyncJob            (sync job history)
//   - CoreMatch                 (cascades to MatchTeamStat, MatchPlayerStat,
//                                MatchShot, MatchEvent, RawMatchPayload,
//                                FantasyPoint, FantasyPointBreakdown)
//   - IngestionCheckpoint, IngestionJob, IngestionRun
//   - ShotmapComparisonsCache   (derived from MatchShot)
//
// Keeps:
//   - MacheteLeague / MacheteTeam / MachetePlayer (refreshed by sync upsert)
//   - CoreLeague / CoreTeam / CorePlayer / Season aggregates
//   - User data (squads, models, shortlists, sessions)
//   - Manual imports (Wyscout, Baltika)
//
// Also clears lastSyncedAt on MacheteLeague / MacheteTeam so the ingestion
// scheduler treats them as fresh again.
//
// Usage:
//   docker compose exec ingestion-worker npm run fotmob:reset -- --yes
//   docker compose exec ingestion-worker npm run fotmob:reset -- --yes --only-machete

import { PrismaClient } from "@prisma/client";

const args = new Set(process.argv.slice(2));

async function main() {
  if (!args.has("--yes")) {
    console.error("Refusing to wipe match data without --yes.");
    console.error("Usage: npm run fotmob:reset -- --yes [--only-machete]");
    process.exitCode = 1;
    return;
  }

  const onlyMachete = args.has("--only-machete");
  const prisma = new PrismaClient();

  try {
    console.info("[reset] Counting current rows...");
    const before = await counts(prisma);
    logCounts("before", before);

    await prisma.$transaction(async (tx) => {
      console.info("[reset] Deleting MachetePlayerSnapshot...");
      await tx.machetePlayerSnapshot.deleteMany({});

      console.info("[reset] Deleting MachetePlayerMatchStat...");
      await tx.machetePlayerMatchStat.deleteMany({});

      console.info("[reset] Deleting MacheteFixture...");
      await tx.macheteFixture.deleteMany({});

      console.info("[reset] Deleting MacheteRawPayload...");
      await tx.macheteRawPayload.deleteMany({});

      console.info("[reset] Deleting MacheteSyncJob...");
      await tx.macheteSyncJob.deleteMany({});

      if (!onlyMachete) {
        console.info("[reset] Deleting CoreMatch (cascades to stats/shots/events/fantasy points/raw payloads)...");
        await tx.coreMatch.deleteMany({});

        console.info("[reset] Deleting IngestionCheckpoint...");
        await tx.ingestionCheckpoint.deleteMany({});

        console.info("[reset] Deleting IngestionJob...");
        await tx.ingestionJob.deleteMany({});

        console.info("[reset] Deleting IngestionRun...");
        await tx.ingestionRun.deleteMany({});

        console.info("[reset] Deleting ShotmapComparisonsCache...");
        await tx.shotmapComparisonsCache.deleteMany({});
      }

      console.info("[reset] Clearing lastSyncedAt on MacheteLeague/MacheteTeam...");
      await tx.macheteLeague.updateMany({ data: { status: "NEW", lastSyncedAt: null } });
      await tx.macheteTeam.updateMany({ data: { status: "NEW", lastSyncedAt: null } });
    });

    console.info("[reset] Counting again...");
    const after = await counts(prisma);
    logCounts("after", after);
    console.info("[reset] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

async function counts(prisma: PrismaClient) {
  return {
    machetePlayerSnapshot: await prisma.machetePlayerSnapshot.count(),
    machetePlayerMatchStat: await prisma.machetePlayerMatchStat.count(),
    macheteFixture: await prisma.macheteFixture.count(),
    macheteRawPayload: await prisma.macheteRawPayload.count(),
    macheteSyncJob: await prisma.macheteSyncJob.count(),
    coreMatch: await prisma.coreMatch.count(),
    matchPlayerStat: await prisma.matchPlayerStat.count(),
    matchTeamStat: await prisma.matchTeamStat.count(),
    matchShot: await prisma.matchShot.count(),
    matchEvent: await prisma.matchEvent.count(),
    rawMatchPayload: await prisma.rawMatchPayload.count(),
    fantasyPoint: await prisma.fantasyPoint.count(),
    fantasyPointBreakdown: await prisma.fantasyPointBreakdown.count(),
    ingestionRun: await prisma.ingestionRun.count(),
    ingestionJob: await prisma.ingestionJob.count(),
    ingestionCheckpoint: await prisma.ingestionCheckpoint.count()
  };
}

function logCounts(label: string, c: Record<string, number>) {
  console.info(`[reset] Row counts (${label}):`);
  for (const [name, count] of Object.entries(c)) {
    console.info(`  ${name.padEnd(28)} ${count}`);
  }
}

void main().catch((error) => {
  console.error("[reset] Failed:", error);
  process.exitCode = 1;
});
