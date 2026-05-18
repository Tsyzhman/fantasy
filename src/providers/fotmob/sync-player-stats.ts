import type { PrismaClient } from "@prisma/client";

import { aggregateMachetePlayerSnapshots } from "@/scoring/machete/aggregateMachetePlayerSnapshots";

import { createFotMobClient } from "./client";
import { normalizeMacheteMatchStat, normalizeMachetePlayer } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";
import { syncMacheteFixtures } from "./sync-fixtures";

export async function syncMacheteTeamPlayerStats(prisma: PrismaClient, teamId: string) {
  const team = await prisma.macheteTeam.findUnique({
    where: { id: teamId },
    include: { league: true }
  });
  if (!team) throw new Error("Machete team not found.");
  if (!team.providerTeamId) throw new Error("Machete team has no FotMob team ID.");

  const client = createFotMobClient();
  await syncMacheteFixtures(prisma, team.leagueId);

  const providerTeams = await client.getTeams(team.league.providerLeagueId ?? team.leagueId, team.league.season ?? undefined);
  const providerTeam = providerTeams.find((item) => item.id === team.providerTeamId);
  if (!providerTeam) throw new Error("Provider team not found in mock FotMob dataset.");

  for (const player of providerTeam.players) {
    await prisma.machetePlayer.upsert({
      where: {
        provider_providerPlayerId: {
          provider: "FOTMOB",
          providerPlayerId: player.id
        }
      },
      update: normalizeMachetePlayer(player, team.id),
      create: normalizeMachetePlayer(player, team.id)
    });
  }

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId: team.leagueId,
      OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }]
    }
  });

  let statsCount = 0;
  for (const fixture of fixtures) {
    if (!fixture.providerFixtureId) continue;
    const details = await client.getFixtureDetails(fixture.providerFixtureId);
    await storeMacheteRawPayload(prisma, {
      entityType: "FIXTURE_DETAILS",
      providerEntityId: fixture.providerFixtureId,
      endpoint: "getFixtureDetails",
      payload: details
    });

    for (const stat of details.playerStats.filter((item) => item.teamId === team.providerTeamId)) {
      const player = await prisma.machetePlayer.findUnique({
        where: {
          provider_providerPlayerId: {
            provider: "FOTMOB",
            providerPlayerId: stat.playerId
          }
        }
      });
      if (!player) continue;

      await prisma.machetePlayerMatchStat.upsert({
        where: {
          fixtureId_playerId: {
            fixtureId: fixture.id,
            playerId: player.id
          }
        },
        update: normalizeMacheteMatchStat(stat, fixture.id, player.id, team.id),
        create: normalizeMacheteMatchStat(stat, fixture.id, player.id, team.id)
      });
      statsCount += 1;
    }
  }

  await prisma.machetePlayerSnapshot.deleteMany({
    where: {
      leagueId: team.leagueId,
      teamId: team.id
    }
  });
  const snapshots = await aggregateMachetePlayerSnapshots(prisma, { leagueId: team.leagueId, teamId: team.id });

  await prisma.macheteTeam.update({
    where: { id: team.id },
    data: {
      status: "SYNCED",
      lastSyncedAt: new Date()
    }
  });

  return {
    statsCount,
    snapshotsCount: snapshots.length
  };
}

export async function syncMacheteLeaguePlayerStats(prisma: PrismaClient, leagueId: string) {
  const teams = await prisma.macheteTeam.findMany({
    where: { leagueId },
    orderBy: { name: "asc" }
  });

  let statsCount = 0;
  let snapshotsCount = 0;
  for (const team of teams) {
    const result = await syncMacheteTeamPlayerStats(prisma, team.id);
    statsCount += result.statsCount;
    snapshotsCount += result.snapshotsCount;
  }

  return { statsCount, snapshotsCount };
}
