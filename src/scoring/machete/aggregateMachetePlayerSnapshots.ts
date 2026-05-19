import type { Prisma, PrismaClient } from "@prisma/client";

import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  getActiveScoringModelForSource
} from "@/lib/scoring";

type AggregateOptions = {
  leagueId: string;
  teamId?: string;
};

export async function aggregateMachetePlayerSnapshots(prisma: PrismaClient, options: AggregateOptions) {
  const model = await getActiveScoringModelForSource("MACHETE");
  const players = await prisma.machetePlayer.findMany({
    where: {
      teamId: options.teamId ?? undefined,
      team: {
        leagueId: options.leagueId
      }
    },
    include: {
      matchStats: {
        include: {
          fixture: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  const snapshots = [];
  const playerIds = players.map((player) => player.id);

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

  for (const player of players) {
    const stats = player.matchStats;
    const matchStats = stats.filter((stat) => stat.fixture.status !== "SEASON_AGGREGATE");
    const aggregateMatches = firstPositiveNumber(stats.map((stat) => readRawNumber(stat.raw, "aggregateMatches")));
    const matchesPlayed = aggregateMatches ?? stats.length;
    const minutesPlayed = sum(stats.map((stat) => stat.minutes));
    const sixtyMinuteAppearances = matchStats.length
      ? matchStats.filter((stat) => (stat.minutes ?? 0) >= 60).length
      : null;
    const fullMatches = matchStats.length
      ? matchStats.filter((stat) => (stat.minutes ?? 0) >= 90).length
      : null;
    const goals = sum(stats.map((stat) => stat.goals));
    const assists = sum(stats.map((stat) => stat.assists));
    const shotsOnTarget = sum(stats.map((stat) => stat.shotsOnTarget));
    const keyPasses = sum(stats.map((stat) => stat.keyPasses));
    const tackles = sum(stats.map((stat) => stat.tackles));
    const interceptions = sum(stats.map((stat) => stat.interceptions));
    const saves = sum(stats.map((stat) => stat.saves));
    const yellowCards = sum(stats.map((stat) => stat.yellowCards));
    const redCards = sum(stats.map((stat) => stat.redCards));
    const ratings = stats.map((stat) => stat.rating).filter((rating): rating is number => rating !== null);
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
      average_rating: averageRating
    };
    const positionGroup = machetePositionGroup(player.position);
    const fantasyScore = calculateFantasyScore(rawMetrics, positionGroup, model);
    const scoringScore = calculateScoringScore(rawMetrics, positionGroup, model);
    const alternativeScore = calculateAlternativeScore(rawMetrics, positionGroup, model);

    const snapshot = await prisma.machetePlayerSnapshot.create({
      data: {
        playerId: player.id,
        leagueId: options.leagueId,
        teamId: player.teamId,
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
        rawMetrics: rawMetrics as Prisma.InputJsonValue
      }
    });
    snapshots.push(snapshot);
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

function readRawNumber(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
