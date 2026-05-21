// Wipe FotMob-sourced match data so the next sync re-pulls everything clean.
//
// Truncates (with CASCADE so FKs handle themselves):
//   - matches          (CoreMatch, cascades to raw_match_payloads,
//                       match_team_stats, match_player_stats, match_shots,
//                       match_events, fantasy_points, fantasy_point_breakdown)
//   - ingestion_runs / ingestion_jobs / ingestion_checkpoints
//   - shotmap_comparisons_cache
//   - MachetePlayerSnapshot / MachetePlayerMatchStat / MacheteFixture
//   - MacheteRawPayload / MacheteSyncJob
//
// Keeps:
//   - MacheteLeague / MacheteTeam / MachetePlayer (refreshed by sync upsert)
//   - CoreLeague / CoreTeam / CorePlayer / season aggregates
//   - User data (squads, models, shortlists, sessions)
//   - Manual imports (Wyscout, Baltika)
//
// Also clears lastSyncedAt on MacheteLeague / MacheteTeam so the ingestion
// scheduler treats them as fresh again.
//
// TRUNCATE is used instead of deleteMany because Postgres can drop millions
// of cascading FK rows in milliseconds via TRUNCATE, whereas deleteMany has
// to walk every row + every FK index and easily blows the 5s Prisma
// interactive-transaction timeout.
//
// Usage:
//   docker compose exec ingestion-worker npm run fotmob:reset -- --yes
//   docker compose exec ingestion-worker npm run fotmob:reset -- --yes --only-machete

import { PrismaClient } from "@prisma/client";

const args = new Set(process.argv.slice(2));

const MACHETE_TABLES = [
  '"MachetePlayerSnapshot"',
  '"MachetePlayerMatchStat"',
  '"MacheteFixture"',
  '"MacheteRawPayload"',
  '"MacheteSyncJob"'
];

const CORE_TABLES = [
  "matches", // cascades to raw_match_payloads, match_*_stats, match_shots,
             // match_events, fantasy_points, fantasy_point_breakdown
  "ingestion_runs",
  "ingestion_jobs",
  "ingestion_checkpoints",
  "shotmap_comparisons_cache"
];

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
    logCounts("before", await counts(prisma));

    const tables = onlyMachete ? MACHETE_TABLES : [...MACHETE_TABLES, ...CORE_TABLES];
    const truncate = `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`;
    console.info(`[reset] ${truncate}`);
    await prisma.$executeRawUnsafe(truncate);

    console.info("[reset] Clearing lastSyncedAt on MacheteLeague/MacheteTeam...");
    await prisma.macheteLeague.updateMany({ data: { status: "NEW", lastSyncedAt: null } });
    await prisma.macheteTeam.updateMany({ data: { status: "NEW", lastSyncedAt: null } });

    console.info("[reset] Counting again...");
    logCounts("after", await counts(prisma));
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
