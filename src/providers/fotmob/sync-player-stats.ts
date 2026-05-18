import type { Prisma, PrismaClient } from "@prisma/client";

import { aggregateMachetePlayerSnapshots } from "@/scoring/machete/aggregateMachetePlayerSnapshots";

import { createFotMobClient } from "./client";
import { normalizeMacheteMatchStat, normalizeMachetePlayer } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";
import { syncMacheteFixtures } from "./sync-fixtures";
import type { FotMobTeam } from "./types";

type SyncPlayerStatsOptions = {
  syncFixtures?: boolean;
  providerTeams?: FotMobTeam[];
};

export async function syncMacheteTeamPlayerStats(prisma: PrismaClient, teamId: string, options: SyncPlayerStatsOptions = {}) {
  const team = await prisma.macheteTeam.findUnique({
    where: { id: teamId },
    include: { league: true }
  });
  if (!team) throw new Error("Machete team not found.");
  if (!team.providerTeamId) throw new Error("Machete team has no FotMob team ID.");

  const client = createFotMobClient();
  if (options.syncFixtures ?? true) {
    await syncMacheteFixtures(prisma, team.leagueId);
  }

  const providerTeams = options.providerTeams ?? await client.getTeams(team.league.providerLeagueId ?? team.leagueId, team.league.season ?? undefined);
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

  const aggregateStats = providerTeam.players.filter((player) => player.seasonStat);
  if (aggregateStats.length > 0) {
    const aggregateMatches = await prisma.macheteFixture.count({
      where: {
        leagueId: team.leagueId,
        status: "FINISHED",
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }]
      }
    });
    const aggregateMatchesDenominator = Math.max(aggregateMatches, 1);

    await storeMacheteRawPayload(prisma, {
      entityType: "TEAM_SEASON_AGGREGATE",
      providerEntityId: team.providerTeamId,
      endpoint: "getTeams",
      payload: providerTeam
    });

    const syntheticProviderFixtureId = [
      "fotmob-season-aggregate",
      team.league.providerLeagueId ?? team.leagueId,
      team.providerTeamId,
      team.league.season ?? "current"
    ].join(":");

    const aggregateFixture = await prisma.macheteFixture.upsert({
      where: {
        provider_providerFixtureId: {
          provider: "FOTMOB",
          providerFixtureId: syntheticProviderFixtureId
        }
      },
      update: {
        leagueId: team.leagueId,
        homeTeamId: team.id,
        awayTeamId: null,
        kickoffAt: null,
        status: "SEASON_AGGREGATE",
        homeScore: null,
        awayScore: null,
        raw: {
          source: "FotMob /data/teams squad",
          providerTeamId: team.providerTeamId,
          season: team.league.season
        } satisfies Prisma.InputJsonValue,
        lastSyncedAt: new Date()
      },
      create: {
        leagueId: team.leagueId,
        provider: "FOTMOB",
        providerFixtureId: syntheticProviderFixtureId,
        homeTeamId: team.id,
        awayTeamId: null,
        kickoffAt: null,
        status: "SEASON_AGGREGATE",
        raw: {
          source: "FotMob /data/teams squad",
          providerTeamId: team.providerTeamId,
          season: team.league.season
        } satisfies Prisma.InputJsonValue,
        lastSyncedAt: new Date()
      }
    });

    let statsCount = 0;
    for (const player of aggregateStats) {
      if (!player.seasonStat) continue;
      const machetePlayer = await prisma.machetePlayer.findUnique({
        where: {
          provider_providerPlayerId: {
            provider: "FOTMOB",
            providerPlayerId: player.id
          }
        }
      });
      if (!machetePlayer) continue;

      const stat = {
        ...player.seasonStat,
        fixtureId: syntheticProviderFixtureId,
        aggregateMatches: aggregateMatchesDenominator
      };
      await prisma.machetePlayerMatchStat.upsert({
        where: {
          fixtureId_playerId: {
            fixtureId: aggregateFixture.id,
            playerId: machetePlayer.id
          }
        },
        update: normalizeMacheteMatchStat(stat, aggregateFixture.id, machetePlayer.id, team.id),
        create: normalizeMacheteMatchStat(stat, aggregateFixture.id, machetePlayer.id, team.id)
      });
      statsCount += 1;
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

export async function syncMacheteLeaguePlayerStats(prisma: PrismaClient, leagueId: string, options: SyncPlayerStatsOptions = {}) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  if (options.syncFixtures ?? true) {
    await syncMacheteFixtures(prisma, leagueId);
  }

  const providerTeams = options.providerTeams ?? await client.getTeams(league.providerLeagueId ?? league.id, league.season ?? undefined);
  const teams = await prisma.macheteTeam.findMany({
    where: { leagueId },
    orderBy: { name: "asc" }
  });

  let statsCount = 0;
  let snapshotsCount = 0;
  for (const team of teams) {
    const result = await syncMacheteTeamPlayerStats(prisma, team.id, {
      ...options,
      syncFixtures: false,
      providerTeams
    });
    statsCount += result.statsCount;
    snapshotsCount += result.snapshotsCount;
  }

  return { statsCount, snapshotsCount };
}
