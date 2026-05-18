import type { Prisma, PrismaClient } from "@prisma/client";

import { aggregateMachetePlayerSnapshots } from "@/scoring/machete/aggregateMachetePlayerSnapshots";

import { runMacheteEntityMatching } from "./entity-matcher";
import { syncMacheteFixtures } from "./sync-fixtures";
import { syncMacheteLeagueMetadata } from "./sync-league";
import { syncMacheteLeaguePlayerStats, syncMacheteTeamPlayerStats } from "./sync-player-stats";
import { syncMacheteTeams } from "./sync-teams";

export type MacheteJobType =
  | "SYNC_LEAGUE_METADATA"
  | "SYNC_TEAMS"
  | "SYNC_FIXTURES"
  | "SYNC_TEAM"
  | "SYNC_PLAYER_STATS"
  | "SYNC_LEAGUE_FULL"
  | "SYNC_ALL_LEAGUES"
  | "RUN_ENTITY_MATCHING"
  | "CALCULATE_FANTASY_SCORES";

type RunJobInput = {
  type: MacheteJobType;
  leagueId?: string;
  teamId?: string;
};

export async function runMacheteJob(prisma: PrismaClient, input: RunJobInput) {
  const job = await prisma.macheteSyncJob.create({
    data: {
      provider: "FOTMOB",
      type: input.type,
      leagueId: input.leagueId,
      teamId: input.teamId,
      status: "RUNNING",
      startedAt: new Date()
    }
  });

  try {
    const result = await executeJob(prisma, input);
    const completedJob = await prisma.macheteSyncJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        result: result as Prisma.InputJsonValue
      }
    });

    return { job: completedJob, result };
  } catch (error) {
    const failedJob = await prisma.macheteSyncJob.update({
      where: { id: job.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown Machete sync error"
      }
    });
    return { job: failedJob, error: failedJob.errorMessage };
  }
}

async function executeJob(prisma: PrismaClient, input: RunJobInput) {
  if (input.type === "SYNC_TEAM") {
    if (!input.teamId) throw new Error("teamId is required.");
    return syncMacheteTeamPlayerStats(prisma, input.teamId);
  }

  if (input.type === "SYNC_ALL_LEAGUES") {
    return syncAllMacheteLeagues(prisma);
  }

  if (!input.leagueId) throw new Error("leagueId is required.");

  if (input.type === "SYNC_LEAGUE_METADATA") {
    const league = await syncMacheteLeagueMetadata(prisma, input.leagueId);
    return { leagueId: league.id, status: league.status };
  }
  if (input.type === "SYNC_TEAMS") {
    const teams = await syncMacheteTeams(prisma, input.leagueId);
    return { teamsSynced: teams.length };
  }
  if (input.type === "SYNC_FIXTURES") {
    const fixtures = await syncMacheteFixtures(prisma, input.leagueId);
    return { fixturesSynced: fixtures.length };
  }
  if (input.type === "SYNC_PLAYER_STATS") {
    return syncMacheteLeaguePlayerStats(prisma, input.leagueId);
  }
  if (input.type === "SYNC_LEAGUE_FULL") {
    return syncMacheteLeagueFull(prisma, input.leagueId);
  }
  if (input.type === "RUN_ENTITY_MATCHING") {
    return runMacheteEntityMatching(prisma, input.leagueId);
  }
  if (input.type === "CALCULATE_FANTASY_SCORES") {
    await prisma.machetePlayerSnapshot.deleteMany({ where: { leagueId: input.leagueId } });
    const snapshots = await aggregateMachetePlayerSnapshots(prisma, { leagueId: input.leagueId });
    return { snapshotsCalculated: snapshots.length };
  }

  throw new Error(`Unsupported Machete job type: ${input.type}`);
}

async function syncMacheteLeagueFull(prisma: PrismaClient, leagueId: string) {
  const metadata = await syncMacheteLeagueMetadata(prisma, leagueId);
  const teams = await syncMacheteTeams(prisma, leagueId);
  const fixtures = await syncMacheteFixtures(prisma, leagueId);
  const playerStats = await syncMacheteLeaguePlayerStats(prisma, leagueId, { syncFixtures: false });

  return {
    leagueId: metadata.id,
    leagueName: metadata.name,
    teamsSynced: teams.length,
    fixturesSynced: fixtures.length,
    ...playerStats
  };
}

async function syncAllMacheteLeagues(prisma: PrismaClient) {
  const leagues = await prisma.macheteLeague.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      providerLeagueId: true
    }
  });
  const orderedLeagues = [...leagues].sort((a, b) => leagueSyncRank(a.providerLeagueId) - leagueSyncRank(b.providerLeagueId));

  const results = [];
  for (const league of orderedLeagues) {
    const result = await syncMacheteLeagueFull(prisma, league.id);
    results.push(result);
  }

  return {
    leaguesSynced: results.length,
    results
  };
}

function leagueSyncRank(providerLeagueId: string | null) {
  const order = ["48", "47", "54", "53", "55", "61", "57", "71", "63", "77"];
  const index = providerLeagueId ? order.indexOf(providerLeagueId) : -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
