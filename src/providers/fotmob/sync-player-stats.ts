import type { Prisma, PrismaClient } from "@prisma/client";

import { aggregateMachetePlayerSnapshots } from "@/scoring/machete/aggregateMachetePlayerSnapshots";
import { getMacheteAggregateMatchDenominator } from "@/scoring/machete/aggregate-match-denominator";
import { fixtureSyncSeasons } from "@/scoring/machete/match-window";
import { shouldIgnoreProviderSeasonStats } from "@/scoring/machete/world-cup";

import { createFotMobClient } from "./client";
import { normalizeMacheteMatchStat, normalizeMachetePlayer } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";
import { syncMacheteFixtures } from "./sync-fixtures";
import type { FotMobPlayerMatchStat, FotMobTeam } from "./types";

type SyncPlayerStatsOptions = {
  syncFixtures?: boolean;
  providerTeams?: FotMobTeam[];
  providerTeamSets?: ProviderTeamSet[];
};

type ProviderTeamSet = {
  season: string | null;
  teams: FotMobTeam[];
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

  const providerTeamSets = options.providerTeamSets ?? (
    options.providerTeams
      ? [{ season: team.league.season ?? null, teams: options.providerTeams }]
      : await getProviderTeamSets(client, team.league.providerLeagueId ?? team.leagueId, team.league.season, team.league.providerLeagueId)
  );
  const providerTeam = providerTeamSets.flatMap((set) => set.teams).find((item) => item.id === team.providerTeamId);
  if (!providerTeam) throw new Error("Provider team not found in mock FotMob dataset.");

  for (const player of dedupePlayers(providerTeamSets.flatMap((set) => set.teams.find((item) => item.id === team.providerTeamId)?.players ?? []))) {
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

  const aggregateStats = providerTeamSets.flatMap((set) =>
    (set.teams.find((item) => item.id === team.providerTeamId)?.players ?? [])
      .filter((player) => player.seasonStat)
      .map((player) => ({ player, season: set.season }))
  );
  if (aggregateStats.length > 0) {
    let statsCount = 0;
    for (const providerTeamSet of providerTeamSets) {
      const seasonProviderTeam = providerTeamSet.teams.find((item) => item.id === team.providerTeamId);
      if (!seasonProviderTeam) continue;
      const ignoreProviderSeasonStats = shouldIgnoreProviderSeasonStats(team.league.providerLeagueId, providerTeamSet.season);
      const aggregateMatches = await getMacheteAggregateMatchDenominator(prisma, team.leagueId, team.id, providerTeamSet.season);
      const aggregateMatchesDenominator = Math.max(aggregateMatches, 1);

      await storeMacheteRawPayload(prisma, {
        entityType: "TEAM_SEASON_AGGREGATE",
        providerEntityId: [team.providerTeamId, providerTeamSet.season ?? "current"].join(":"),
        endpoint: "getTeams",
        payload: seasonProviderTeam
      });

      const syntheticProviderFixtureId = [
        "fotmob-season-aggregate",
        team.league.providerLeagueId ?? team.leagueId,
        team.providerTeamId,
        providerTeamSet.season ?? "current"
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
            season: providerTeamSet.season
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
            season: providerTeamSet.season
          } satisfies Prisma.InputJsonValue,
          lastSyncedAt: new Date()
        }
      });

      for (const player of seasonProviderTeam.players.filter((item) => item.seasonStat)) {
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
        ...sanitizeProviderSeasonStat(player.seasonStat, ignoreProviderSeasonStats),
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
      status: { not: "SEASON_AGGREGATE" },
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

function sanitizeProviderSeasonStat(
  stat: Omit<FotMobPlayerMatchStat, "fixtureId">,
  ignoreProviderSeasonStats: boolean
): Omit<FotMobPlayerMatchStat, "fixtureId"> {
  if (!ignoreProviderSeasonStats) return stat;

  return {
    ...stat,
    minutes: null,
    rating: null,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    tackles: 0,
    interceptions: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    raw: {
      providerSeasonStatsIgnored: true
    } satisfies Prisma.InputJsonValue
  };
}

export async function syncMacheteLeaguePlayerStats(prisma: PrismaClient, leagueId: string, options: SyncPlayerStatsOptions = {}) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  if (options.syncFixtures ?? true) {
    await syncMacheteFixtures(prisma, leagueId);
  }

  const providerTeamSets = options.providerTeamSets ?? (
    options.providerTeams
      ? [{ season: league.season ?? null, teams: options.providerTeams }]
      : await getProviderTeamSets(client, league.providerLeagueId ?? league.id, league.season, league.providerLeagueId)
  );
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
      providerTeamSets
    });
    statsCount += result.statsCount;
    snapshotsCount += result.snapshotsCount;
  }

  return { statsCount, snapshotsCount };
}

async function getProviderTeamSets(client: ReturnType<typeof createFotMobClient>, leagueId: string, season: string | null, providerLeagueId?: string | null) {
  const seasons = fixtureSyncSeasons(season, providerLeagueId);
  return Promise.all(
    seasons.map(async (seasonLabel) => ({
      season: seasonLabel,
      teams: await client.getTeams(leagueId, seasonLabel ?? undefined)
    }))
  );
}

function dedupePlayers(players: FotMobTeam["players"]) {
  const seen = new Set<string>();
  const unique: FotMobTeam["players"] = [];
  for (const player of players) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    unique.push(player);
  }
  return unique;
}
