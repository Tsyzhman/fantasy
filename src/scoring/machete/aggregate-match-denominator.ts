import type { PrismaClient } from "@prisma/client";

export async function getMacheteAggregateMatchDenominator(prisma: PrismaClient, leagueId: string, teamId: string) {
  const teamFixtures = {
    leagueId,
    status: { not: "SEASON_AGGREGATE" },
    OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
  };

  const finishedFixtures = await prisma.macheteFixture.count({
    where: {
      ...teamFixtures,
      status: "FINISHED"
    }
  });
  if (finishedFixtures > 0) return finishedFixtures;

  return prisma.macheteFixture.count({
    where: teamFixtures
  });
}

export async function getMacheteAggregateMatchDenominators(prisma: PrismaClient, leagueId: string, teamIds: string[]) {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueTeamIds.map(async (teamId) => [teamId, await getMacheteAggregateMatchDenominator(prisma, leagueId, teamId)] as const)
  );

  return new Map(entries);
}
