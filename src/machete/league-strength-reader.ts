/** @spec spec://modules/machete/FEAT-015-league-strength#input */

import { Prisma, type PrismaClient } from "@prisma/client";

import { calculateLeagueStrength } from "./league-strength";

const MAX_TEAMS = 128;
const MAX_MATCHES = 4096;

type MatchRow = {
  id: bigint;
  homeId: bigint;
  awayId: bigint;
  homeGoals: number;
  awayGoals: number;
  homeXg: number | null;
  awayXg: number | null;
};

export async function loadLeagueStrength(prisma: PrismaClient, leagueId: bigint, season: string) {
  const members = await prisma.leagueSeasonTeam.findMany({
    where: { leagueId, season, active: true },
    take: MAX_TEAMS + 1,
    select: { team: { select: { id: true, name: true } } }
  });
  if (members.length > MAX_TEAMS) return null;

  const teamIds = members.map(({ team }) => team.id);
  const matches = teamIds.length >= 2 ? await prisma.$queryRaw<MatchRow[]>`
    SELECT m.id, m.home_team_id AS "homeId", m.away_team_id AS "awayId",
           m.home_score AS "homeGoals", m.away_score AS "awayGoals", h.xg AS "homeXg", a.xg AS "awayXg"
    FROM matches m
    LEFT JOIN match_team_stats h ON h.match_id = m.id AND h.team_id = m.home_team_id
    LEFT JOIN match_team_stats a ON a.match_id = m.id AND a.team_id = m.away_team_id
    WHERE m.league_id = ${leagueId} AND m.season = ${season} AND m.source = 'fotmob'
      AND m.finished AND NOT m.cancelled AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
      AND m.home_team_id IN (${Prisma.join(teamIds)}) AND m.away_team_id IN (${Prisma.join(teamIds)})
    ORDER BY m.id
    LIMIT ${MAX_MATCHES + 1}
  ` : [];
  if (matches.length > MAX_MATCHES) return null;

  return calculateLeagueStrength(
    members.map(({ team }) => ({ id: String(team.id), name: team.name })),
    matches.map((match) => ({
      ...match,
      id: String(match.id),
      homeId: String(match.homeId),
      awayId: String(match.awayId)
    }))
  );
}
