import type { PrismaClient } from "@prisma/client";

import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  getActiveScoringModelForSource
} from "@/lib/scoring";
import { getMacheteAggregateMatchDenominators } from "./aggregate-match-denominator";
import { fixtureInSeason } from "./match-window";
import { shouldIgnoreProviderSeasonStats } from "./world-cup";

type AggregateOptions = {
  leagueId: string;
  teamId?: string;
};

export async function aggregateMachetePlayerSnapshots(prisma: PrismaClient, options: AggregateOptions) {
  const model = await getActiveScoringModelForSource("MACHETE");
  const teams = await prisma.macheteTeam.findMany({
    where: {
      leagueId: options.leagueId,
      id: options.teamId ?? undefined
    },
    include: {
      league: {
        select: {
          providerLeagueId: true,
          season: true
        }
      }
    }
  });
  const teamIds = teams.map((team) => team.id);
  const players = await prisma.machetePlayer.findMany({
    where: teamIds.length
      ? {
          OR: [
            { teamId: { in: teamIds } },
            {
              matchStats: {
                some: {
                  teamId: { in: teamIds }
                }
              }
            }
          ]
        }
      : { id: "__no_teams__" },
    include: {
      matchStats: {
        where: {
          teamId: { in: teamIds }
        },
        include: {
          fixture: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  const snapshots = [];
  const playerIds = players.map((player) => player.id);
  const leagueSeason = teams[0]?.league.season ?? null;
  const teamDenominators = await getMacheteAggregateMatchDenominators(
    prisma,
    options.leagueId,
    teamIds,
    leagueSeason
  );

  if (playerIds.length > 0) {
    await prisma.machetePlayerSnapshot.deleteMany({
      where: {
        playerId: { in: playerIds },
        leagueId: options.leagueId,
        teamId: options.teamId ?? undefined,
        periodFrom: null,
        periodTo: null
      }
    });
  }

  for (const team of teams) {
    for (const player of players) {
    const currentSeason = team.league.season ?? null;
    const stats = player.matchStats.filter((stat) => stat.teamId === team.id && fixtureMatchesSeason(stat.fixture, currentSeason));
    if (stats.length === 0 && player.teamId !== team.id) continue;
    const matchStats = stats.filter((stat) => stat.fixture.status !== "SEASON_AGGREGATE");
    const ignoreProviderSeasonStats = shouldIgnoreProviderSeasonStats(team.league.providerLeagueId, team.league.season);
    const statsForTotals = ignoreProviderSeasonStats ? matchStats : stats;
    const aggregateMatches = ignoreProviderSeasonStats ? null : firstPositiveNumber(stats.map((stat) => stat.aggregateMatches));
    const fixtureDenominator = !ignoreProviderSeasonStats ? teamDenominators.get(team.id) ?? 0 : 0;
    const matchesPlayed = ignoreProviderSeasonStats ? matchStats.length : Math.max(aggregateMatches ?? 0, fixtureDenominator, stats.length);
    const minutesPlayed = sum(statsForTotals.map((stat) => stat.minutes));
    const sixtyMinuteAppearances = matchStats.length
      ? matchStats.filter((stat) => (stat.minutes ?? 0) >= 60).length
      : null;
    const fullMatches = matchStats.length
      ? matchStats.filter((stat) => (stat.minutes ?? 0) >= 90).length
      : null;
    const goals = sum(statsForTotals.map((stat) => stat.goals));
    const assists = sum(statsForTotals.map((stat) => stat.assists));
    const shotsOnTarget = sum(statsForTotals.map((stat) => stat.shotsOnTarget));
    const keyPasses = sum(statsForTotals.map((stat) => stat.keyPasses));
    const tackles = sum(statsForTotals.map((stat) => stat.tackles));
    const interceptions = sum(statsForTotals.map((stat) => stat.interceptions));
    const saves = sum(statsForTotals.map((stat) => stat.saves));
    const yellowCards = sum(statsForTotals.map((stat) => stat.yellowCards));
    const redCards = sum(statsForTotals.map((stat) => stat.redCards));
    const ratings = statsForTotals.map((stat) => stat.rating).filter((rating): rating is number => rating !== null);
    const averageRating = ratings.length ? Number((sum(ratings) / ratings.length).toFixed(2)) : null;
    const expectedMinutes = minutesPlayed <= 0 && matchesPlayed > 0 && averageRating !== null ? 75 : null;

    const rawMetrics = {
      matches_played: matchesPlayed,
      minutes_played: minutesPlayed,
      ...(sixtyMinuteAppearances !== null ? { appearances_60: sixtyMinuteAppearances } : {}),
      ...(fullMatches !== null ? { full_matches: fullMatches } : {}),
      ...(expectedMinutes !== null ? { expected_minutes: expectedMinutes } : {}),
      goals,
      assists,
      shots_on_target: shotsOnTarget,
      key_passes: keyPasses,
      tackles,
      interceptions,
      saves,
      yellow_cards: yellowCards,
      red_cards: redCards,
      average_rating: averageRating,
      ...(ignoreProviderSeasonStats ? { provider_season_stats_ignored: 1 } : {})
    };
    const positionGroup = machetePositionGroup(player.position);
    const fantasyScore = calculateFantasyScore(rawMetrics, positionGroup, model);
    const scoringScore = calculateScoringScore(rawMetrics, positionGroup, model);
    const alternativeScore = calculateAlternativeScore(rawMetrics, positionGroup, model);

    const snapshot = await prisma.machetePlayerSnapshot.create({
      data: {
        playerId: player.id,
        leagueId: options.leagueId,
        teamId: team.id,
        position: player.position,
        matchesPlayed,
        minutesPlayed,
        goals,
        assists,
        shotsOnTarget,
        keyPasses,
        tackles,
        interceptions,
        saves,
        yellowCards,
        redCards,
        averageRating,
        fantasyScore,
        scoringScore,
        alternativeScore,
        valueScore: minutesPlayed > 0 ? Number((fantasyScore / (minutesPlayed / 90)).toFixed(2)) : null,
        appearances60: sixtyMinuteAppearances ?? 0,
        fullMatches: fullMatches ?? 0,
        expectedMinutes,
        providerSeasonStatsIgnored: ignoreProviderSeasonStats
      }
    });
    snapshots.push(snapshot);
  }
  }

  return snapshots;
}

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function firstPositiveNumber(values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null && value > 0) return value;
  }
  return null;
}

function fixtureMatchesSeason(fixture: { status: string | null; kickoffAt: Date | null; aggregateSeason: string | null }, season: string | null) {
  if (fixture.status !== "SEASON_AGGREGATE") return fixtureInSeason(fixture, season);
  return fixture.aggregateSeason === null || fixture.aggregateSeason === season;
}
