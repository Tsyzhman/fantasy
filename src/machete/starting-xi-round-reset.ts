import { Prisma, type PrismaClient } from "@prisma/client";

export type StartingXiRoundResetResult = {
  reset: boolean;
  round: string | null;
  playersReset: number;
  teamsChanged: number;
  reason: "NO_COMPLETED_MATCH_STATS" | "ROUND_ALREADY_RESET" | "RESET";
};

export async function resetStartingXiForLatestCompletedRound(
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; resetAt?: Date }
): Promise<StartingXiRoundResetResult> {
  const latestMatch = await prisma.coreMatch.findFirst({
    where: {
      leagueId: input.leagueId,
      season: input.season,
      finished: true,
      cancelled: false,
      round: { not: null },
      playerStats: { some: {} }
    },
    orderBy: [{ matchDate: "desc" }, { updatedAt: "desc" }],
    select: { round: true }
  });
  const round = latestMatch?.round?.trim() || null;
  if (!round) return { reset: false, round: null, playersReset: 0, teamsChanged: 0, reason: "NO_COMPLETED_MATCH_STATS" };

  return prisma.$transaction(async (tx) => {
    const lockKey = `starting-xi-round-reset:${input.leagueId}:${input.season}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const season = await tx.leagueSeason.findUnique({
      where: { leagueId_season: { leagueId: input.leagueId, season: input.season } },
      select: { startingXiResetRound: true }
    });
    if (!shouldResetStartingXiRound(season?.startingXiResetRound ?? null, round)) {
      return { reset: false, round, playersReset: 0, teamsChanged: 0, reason: "ROUND_ALREADY_RESET" };
    }

    const changedTeams = await tx.teamPlayerSeason.findMany({
      where: { leagueId: input.leagueId, season: input.season, active: true, isStarter: true },
      distinct: ["teamId"],
      select: { teamId: true }
    });
    const resetAt = input.resetAt ?? new Date();
    const update = await tx.teamPlayerSeason.updateMany({
      where: { leagueId: input.leagueId, season: input.season, active: true, isStarter: true },
      data: { isStarter: false }
    });
    if (changedTeams.length > 0) {
      await tx.leagueSeasonTeam.updateMany({
        where: { leagueId: input.leagueId, season: input.season, teamId: { in: changedTeams.map((row) => row.teamId) } },
        data: { startingXiChangedAt: resetAt }
      });
    }
    await tx.leagueSeason.update({
      where: { leagueId_season: { leagueId: input.leagueId, season: input.season } },
      data: { startingXiResetRound: round, startingXiResetAt: resetAt }
    });

    return {
      reset: true,
      round,
      playersReset: update.count,
      teamsChanged: changedTeams.length,
      reason: "RESET"
    };
  });
}

export function shouldResetStartingXiRound(previousRound: string | null, latestRound: string) {
  if (!previousRound) return true;
  if (previousRound === latestRound) return false;
  const previousNumber = roundNumber(previousRound);
  const latestNumber = roundNumber(latestRound);
  if (previousNumber !== null && latestNumber !== null) return latestNumber > previousNumber;
  return true;
}

function roundNumber(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}
