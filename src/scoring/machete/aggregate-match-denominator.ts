import type { PrismaClient } from "@prisma/client";

import { fixtureInSeason } from "./match-window";

export async function getMacheteAggregateMatchDenominator(prisma: PrismaClient, leagueId: string, teamId: string, season?: string | null) {
  const teamFixtures = {
    leagueId,
    status: { not: "SEASON_AGGREGATE" },
    OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
  };

  const finishedFixtures = await prisma.macheteFixture.findMany({
    where: {
      ...teamFixtures,
      status: "FINISHED"
    },
    select: { kickoffAt: true }
  });
  const finishedCount = finishedFixtures.filter((fixture) => fixtureInSeason(fixture, season)).length;
  if (finishedCount > 0) return finishedCount;

  const fixtures = await prisma.macheteFixture.findMany({
    where: teamFixtures,
    select: { kickoffAt: true }
  });
  return fixtures.filter((fixture) => fixtureInSeason(fixture, season)).length;
}

export async function getMacheteAggregateMatchDenominators(prisma: PrismaClient, leagueId: string, teamIds: string[], season?: string | null) {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueTeamIds.map(async (teamId) => [teamId, await getMacheteAggregateMatchDenominator(prisma, leagueId, teamId, season)] as const)
  );

  return new Map(entries);
}
