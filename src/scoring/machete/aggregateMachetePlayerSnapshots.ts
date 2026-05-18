import type { Prisma, PrismaClient } from "@prisma/client";

import { calculateMacheteFantasyScore } from "./calculateMacheteFantasyScore";

type AggregateOptions = {
  leagueId: string;
  teamId?: string;
};

export async function aggregateMachetePlayerSnapshots(prisma: PrismaClient, options: AggregateOptions) {
  const players = await prisma.machetePlayer.findMany({
    where: {
      teamId: options.teamId ?? undefined,
      team: {
        leagueId: options.leagueId
      }
    },
    include: {
      matchStats: true
    },
    orderBy: { name: "asc" }
  });

  const snapshots = [];

  for (const player of players) {
    const stats = player.matchStats;
    const matchesPlayed = stats.length;
    const minutesPlayed = sum(stats.map((stat) => stat.minutes));
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

    const fantasyScore = calculateMacheteFantasyScore({
      minutes: minutesPlayed,
      goals,
      assists,
      shotsOnTarget,
      keyPasses,
      tackles,
      interceptions,
      saves,
      averageRating,
      yellowCards,
      redCards
    });

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
        valueScore: minutesPlayed > 0 ? Number((fantasyScore / (minutesPlayed / 90)).toFixed(2)) : null,
        rawMetrics: {
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
          averageRating
        } as Prisma.InputJsonValue
      }
    });
    snapshots.push(snapshot);
  }

  return snapshots;
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}
