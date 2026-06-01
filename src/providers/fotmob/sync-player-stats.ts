import type { PrismaClient } from "@prisma/client";

import { aggregateMachetePlayerSnapshots } from "@/scoring/machete/aggregateMachetePlayerSnapshots";
import { getMacheteAggregateMatchDenominator } from "@/scoring/machete/aggregate-match-denominator";
import { fixtureSyncSeasons } from "@/scoring/machete/match-window";
import { shouldIgnoreProviderSeasonStats } from "@/scoring/machete/world-cup";

import { createFotMobClient } from "./client";
import { normalizeMacheteMatchStat, normalizeMachetePlayer } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";
import { syncMacheteFixtures } from "./sync-fixtures";
import { syncMacheteMatchShots } from "./sync-shots";
import type { FotMobPlayerMatchStat, FotMobTeam } from "./types";

type SyncPlayerStatsOptions = {
  syncFixtures?: boolean;
  providerTeams?: FotMobTeam[];
  providerTeamSets?: ProviderTeamSet[];
  includePreviousSeasons?: boolean;
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
    await syncMacheteFixtures(prisma, team.leagueId, { includePreviousSeasons: options.includePreviousSeasons });
  }

  const providerTeamSets = options.providerTeamSets ?? (
    options.providerTeams
      ? [{ season: team.league.season ?? null, teams: options.providerTeams }]
      : await getProviderTeamSets(client, team.league.providerLeagueId ?? team.leagueId, team.league.season, team.league.providerLeagueId, options.includePreviousSeasons)
  );
  const providerTeam = providerTeamSets.flatMap((set) => set.teams).find((item) => item.id === team.providerTeamId);
  if (!providerTeam) throw new Error("Provider team not found in mock FotMob dataset.");

  for (const player of dedupePlayers(providerTeamSets.flatMap((set) => set.teams.find((item) => item.id === team.providerTeamId)?.players ?? []))) {
    const { teamId: _teamId, ...playerUpdate } = normalizeMachetePlayer(player, team.id);
    await prisma.machetePlayer.upsert({
      where: {
        provider_providerPlayerId: {
          provider: "FOTMOB",
          providerPlayerId: player.id
        }
      },
      update: playerUpdate,
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
          round: null,
          aggregateSeason: providerTeamSet.season,
          homeScore: null,
          awayScore: null,
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
          round: null,
          aggregateSeason: providerTeamSet.season,
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
  let shotsCount = 0;
  for (const fixture of fixtures) {
    if (!fixture.providerFixtureId) continue;
    const details = await client.getFixtureDetails(fixture.providerFixtureId);
    try {
      const shotResult = await syncMacheteMatchShots(prisma, fixture, details);
      shotsCount += shotResult.shotsSynced;
    } catch (error) {
      console.warn(
        `[mixerr] Could not sync FotMob shots for fixture ${fixture.providerFixtureId}: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

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
    shotsCount,
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
  };
}

export async function syncMacheteLeaguePlayerStats(prisma: PrismaClient, leagueId: string, options: SyncPlayerStatsOptions = {}) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  if (options.syncFixtures ?? true) {
    await syncMacheteFixtures(prisma, leagueId, { includePreviousSeasons: options.includePreviousSeasons });
  }

  const providerTeamSets = options.providerTeamSets ?? (
    options.providerTeams
      ? [{ season: league.season ?? null, teams: options.providerTeams }]
      : await getProviderTeamSets(client, league.providerLeagueId ?? league.id, league.season, league.providerLeagueId, options.includePreviousSeasons)
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

async function getProviderTeamSets(
  client: ReturnType<typeof createFotMobClient>,
  leagueId: string,
  season: string | null,
  providerLeagueId?: string | null,
  includePreviousSeasons = true
) {
  const seasons = includePreviousSeasons === false ? [season ?? null] : fixtureSyncSeasons(season, providerLeagueId);
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
