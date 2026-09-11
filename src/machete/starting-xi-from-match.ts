import { Prisma, type PrismaClient } from "@prisma/client";
import type { StartingXiTeamsChangedListener } from "./fantasy-player-pool-refresh-queue";
import { hasUpcomingSorareLineup } from "./sorareinside-protection";

const MAX_STARTERS = 11;

export type StartingXiTeamApplyReason =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "NO_STARTERS"
  | "TOO_MANY_STARTERS"
  | "OLDER_MATCH"
  | "UPCOMING_PREDICTION"
  | "SEASON_TEAM_NOT_FOUND";

export type StartingXiTeamApplyResult = {
  teamId: bigint;
  startersFound: number;
  startersApplied: number;
  flagsCleared: number;
  reason: StartingXiTeamApplyReason;
};

export type StartingXiMatchApplyResult = {
  matchId: bigint;
  eligible: boolean;
  reason: "MATCH_NOT_FOUND" | "MATCH_NOT_COMPLETED" | "MATCH_SCOPE_INCOMPLETE" | "PROCESSED";
  teams: StartingXiTeamApplyResult[];
};

type StarterRow = {
  playerId: bigint;
  position: string | null;
  shirtNumber: number | null;
};

export async function applyStartingXiFromCompletedMatch(
  prisma: PrismaClient,
  input: {
    matchId: bigint;
    appliedAt?: Date;
    onTeamsChanged?: StartingXiTeamsChangedListener;
  }
): Promise<StartingXiMatchApplyResult> {
  const match = await prisma.coreMatch.findUnique({
    where: { id: input.matchId },
    select: {
      id: true,
      leagueId: true,
      season: true,
      homeTeamId: true,
      awayTeamId: true,
      matchDate: true,
      finished: true,
      cancelled: true,
      playerStats: {
        where: { started: true },
        select: { playerId: true, teamId: true, position: true, shirtNumber: true }
      }
    }
  });
  if (!match) return { matchId: input.matchId, eligible: false, reason: "MATCH_NOT_FOUND", teams: [] };
  if (!match.finished || match.cancelled) {
    return { matchId: match.id, eligible: false, reason: "MATCH_NOT_COMPLETED", teams: [] };
  }
  if (!match.leagueId || !match.season || !match.homeTeamId || !match.awayTeamId || !match.matchDate) {
    return { matchId: match.id, eligible: false, reason: "MATCH_SCOPE_INCOMPLETE", teams: [] };
  }

  const teamIds = [match.homeTeamId, match.awayTeamId];
  const teams: StartingXiTeamApplyResult[] = [];
  for (const teamId of teamIds) {
    const starters = uniqueStarters(match.playerStats
      .filter((row) => row.teamId === teamId)
      .map((row) => ({ playerId: row.playerId, position: row.position, shirtNumber: row.shirtNumber })));
    const lineupBlockReason = startingXiLineupBlockReason(starters);
    if (lineupBlockReason) {
      teams.push({
        teamId,
        startersFound: starters.length,
        startersApplied: 0,
        flagsCleared: 0,
        reason: lineupBlockReason
      });
      continue;
    }
    teams.push(await applyTeamStartingXi(prisma, {
      leagueId: match.leagueId,
      season: match.season,
      teamId,
      matchId: match.id,
      matchDate: match.matchDate,
      starters,
      appliedAt: input.appliedAt ?? new Date(),
      onTeamsChanged: input.onTeamsChanged
    }));
  }

  return { matchId: match.id, eligible: true, reason: "PROCESSED", teams };
}

export async function applyStartingXiFromCompletedMatches(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    onTeamsChanged?: StartingXiTeamsChangedListener;
  }
) {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId: input.leagueId,
      season: input.season,
      finished: true,
      cancelled: false,
      matchDate: { not: null },
      playerStats: { some: { started: true } }
    },
    orderBy: [{ matchDate: "asc" }, { id: "asc" }],
    select: { id: true }
  });
  const totals = { matches: matches.length, teamsApplied: 0, noStarterTeams: 0, oversizedTeams: 0, skippedTeams: 0 };
  for (const match of matches) {
    const result = await applyStartingXiFromCompletedMatch(prisma, {
      matchId: match.id,
      onTeamsChanged: input.onTeamsChanged
    });
    for (const team of result.teams) {
      if (team.reason === "APPLIED") totals.teamsApplied += 1;
      else if (team.reason === "NO_STARTERS") totals.noStarterTeams += 1;
      else if (team.reason === "TOO_MANY_STARTERS") totals.oversizedTeams += 1;
      else totals.skippedTeams += 1;
    }
  }
  return totals;
}

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
async function applyTeamStartingXi(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    teamId: bigint;
    matchId: bigint;
    matchDate: Date;
    starters: StarterRow[];
    appliedAt: Date;
    onTeamsChanged?: StartingXiTeamsChangedListener;
  }
): Promise<StartingXiTeamApplyResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const lockKey = `starting-xi:${input.leagueId}:${input.season}:${input.teamId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const seasonTeam = await tx.leagueSeasonTeam.findUnique({
      where: {
        leagueId_season_teamId: {
          leagueId: input.leagueId,
          season: input.season,
          teamId: input.teamId
        }
      },
      select: {
        active: true,
        metadata: true,
        startingXiSourceMatchId: true,
        startingXiSourceMatchDate: true
      }
    });
    if (!seasonTeam?.active) return { result: emptyTeamResult(input, "SEASON_TEAM_NOT_FOUND"), changedTeamIds: [] as bigint[] };
    if (hasUpcomingSorareLineup(seasonTeam.metadata, input.appliedAt)) return { result: emptyTeamResult(input, "UPCOMING_PREDICTION"), changedTeamIds: [] as bigint[] };

    const decision = startingXiMatchOrderDecision({
      previousMatchId: seasonTeam.startingXiSourceMatchId,
      previousMatchDate: seasonTeam.startingXiSourceMatchDate,
      nextMatchId: input.matchId,
      nextMatchDate: input.matchDate
    });
    if (decision !== "APPLY") {
      return {
        result: emptyTeamResult(input, decision === "ALREADY_APPLIED" ? "ALREADY_APPLIED" : "OLDER_MATCH"),
        changedTeamIds: [] as bigint[]
      };
    }

    const starterIds = input.starters.map((starter) => starter.playerId);
    const otherFlaggedTeams = await tx.teamPlayerSeason.findMany({
      where: {
        leagueId: input.leagueId,
        season: input.season,
        teamId: { not: input.teamId },
        playerId: { in: starterIds },
        isStarter: true
      },
      distinct: ["teamId"],
      select: { teamId: true }
    });
    const [clearedCurrentTeam, clearedOtherTeams] = await Promise.all([
      tx.teamPlayerSeason.updateMany({
        where: { leagueId: input.leagueId, season: input.season, teamId: input.teamId, isStarter: true },
        data: { isStarter: false }
      }),
      tx.teamPlayerSeason.updateMany({
        where: {
          leagueId: input.leagueId,
          season: input.season,
          teamId: { not: input.teamId },
          playerId: { in: starterIds },
          isStarter: true
        },
        data: { isStarter: false }
      })
    ]);

    for (const starter of input.starters) {
      await tx.teamPlayerSeason.upsert({
        where: {
          leagueId_season_teamId_playerId: {
            leagueId: input.leagueId,
            season: input.season,
            teamId: input.teamId,
            playerId: starter.playerId
          }
        },
        create: {
          leagueId: input.leagueId,
          season: input.season,
          teamId: input.teamId,
          playerId: starter.playerId,
          source: "fotmob",
          active: true,
          isStarter: true,
          position: starter.position,
          shirtNumber: starter.shirtNumber,
          lastSeenAt: input.appliedAt
        },
        update: {
          source: "fotmob",
          active: true,
          isStarter: true,
          ...(starter.position ? { position: starter.position } : {}),
          ...(starter.shirtNumber !== null ? { shirtNumber: starter.shirtNumber } : {}),
          lastSeenAt: input.appliedAt
        }
      });
    }

    await tx.leagueSeasonTeam.update({
      where: {
        leagueId_season_teamId: {
          leagueId: input.leagueId,
          season: input.season,
          teamId: input.teamId
        }
      },
      data: {
        startingXiChangedAt: input.appliedAt,
        startingXiSourceMatchId: input.matchId,
        startingXiSourceMatchDate: input.matchDate
      }
    });
    if (otherFlaggedTeams.length > 0) {
      await tx.leagueSeasonTeam.updateMany({
        where: {
          leagueId: input.leagueId,
          season: input.season,
          teamId: { in: otherFlaggedTeams.map((team) => team.teamId) }
        },
        data: { startingXiChangedAt: input.appliedAt }
      });
    }

    const changedTeamIds = [input.teamId, ...otherFlaggedTeams.map((team) => team.teamId)];
    await input.onTeamsChanged?.({ leagueId: input.leagueId, season: input.season, teamIds: changedTeamIds }, tx);
    return {
      result: {
        teamId: input.teamId,
        startersFound: input.starters.length,
        startersApplied: input.starters.length,
        flagsCleared: clearedCurrentTeam.count + clearedOtherTeams.count,
        reason: "APPLIED" as const
      },
      changedTeamIds
    };
  });
  return outcome.result;
}

export function startingXiMatchOrderDecision(input: {
  previousMatchId: bigint | null;
  previousMatchDate: Date | null;
  nextMatchId: bigint;
  nextMatchDate: Date;
}): "APPLY" | "ALREADY_APPLIED" | "OLDER_MATCH" {
  if (input.previousMatchId === input.nextMatchId) return "ALREADY_APPLIED";
  if (!input.previousMatchDate) return "APPLY";
  const dateOrder = input.nextMatchDate.getTime() - input.previousMatchDate.getTime();
  if (dateOrder < 0) return "OLDER_MATCH";
  if (dateOrder > 0) return "APPLY";
  return input.nextMatchId > (input.previousMatchId ?? -1n) ? "APPLY" : "OLDER_MATCH";
}

export function startingXiLineupBlockReason(
  starters: ReadonlyArray<Pick<StarterRow, "playerId">>
): Extract<StartingXiTeamApplyReason, "NO_STARTERS" | "TOO_MANY_STARTERS"> | null {
  const uniqueStarterCount = new Set(starters.map((starter) => starter.playerId)).size;
  if (uniqueStarterCount === 0) return "NO_STARTERS";
  if (uniqueStarterCount > MAX_STARTERS) return "TOO_MANY_STARTERS";
  return null;
}

function uniqueStarters(rows: StarterRow[]) {
  return [...new Map(rows.map((row) => [row.playerId, row])).values()];
}

function emptyTeamResult(
  input: { teamId: bigint; starters: StarterRow[] },
  reason: Exclude<StartingXiTeamApplyReason, "APPLIED" | "NO_STARTERS" | "TOO_MANY_STARTERS">
): StartingXiTeamApplyResult {
  return {
    teamId: input.teamId,
    startersFound: input.starters.length,
    startersApplied: 0,
    flagsCleared: 0,
    reason
  };
}
