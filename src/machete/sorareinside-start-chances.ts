/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#starting-chances */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { NextTeamGame } from "../providers/sorareinside/client";
import type { SharedPlayerRowsScope } from "./shared_read_model";
import type { FantasyPlannerPlayer } from "./squad_logic";

export type SorareStartChance = { percent: number; kickoff: string; opponent: string; clubStarter?: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readSorareStartChances(lineup: unknown, now = new Date()) {
  const result = new Map<string, SorareStartChance>();
  const forecast = record(lineup);
  if (forecast?.source !== "SORAREINSIDE" || typeof forecast.sourceFixtureId !== "string" || !forecast.sourceFixtureId ||
      typeof forecast.sourceKickoff !== "string" || !(Date.parse(forecast.sourceKickoff) > now.getTime()) ||
      typeof forecast.opponentName !== "string" || !forecast.opponentName) return result;
  for (const [id, percent] of Object.entries(record(forecast.startPercentByPlayerId) ?? {})) {
    if (/^\d+$/.test(id) && typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      result.set(id, { percent, kickoff: forecast.sourceKickoff, opponent: forecast.opponentName });
    }
  }
  return result;
}

// Overlay the latest published percentages after reading the cached model/snapshot.
export async function loadSorareStartChances(db: PrismaClient, scopes: readonly SharedPlayerRowsScope[]) {
  const result = new Map<string, SorareStartChance>();
  if (!scopes.length) return result;
  const conditions = scopes.map(({ leagueId, season, teamId }) => Prisma.sql`(club.league_id = ${leagueId} AND club.season = ${season}
    ${teamId == null ? Prisma.empty : Prisma.sql`AND club.team_id = ${teamId}`})`);
  const rows = await db.$queryRaw<{ leagueId: bigint; season: string; teamId: bigint; lineup: Prisma.JsonValue; roster: Record<string, boolean> | null }[]>`
    SELECT league_id AS "leagueId", season, team_id AS "teamId", (metadata -> 'probableLineup') - 'players' AS lineup,
      (SELECT jsonb_object_agg(member.player_id::text, member.is_starter) FROM team_player_seasons member
       WHERE (member.league_id, member.season, member.team_id) = (club.league_id, club.season, club.team_id) AND member.active) AS roster
    FROM league_season_teams club
    WHERE active AND metadata #>> '{probableLineup,source}' = 'SORAREINSIDE'
      AND metadata #> '{probableLineup,startPercentByPlayerId}' IS NOT NULL
      AND (${Prisma.join(conditions, " OR ")})`;
  const now = new Date();
  for (const row of rows) {
    for (const [playerId, chance] of readSorareStartChances(row.lineup, now)) {
      const clubStarter = row.roster?.[playerId];
      if (typeof clubStarter === "boolean") {
        result.set(`${row.leagueId}:${row.season}:${row.teamId}:${playerId}`, { ...chance, clubStarter });
      }
    }
  }
  return result;
}

export async function withSquadSorareStartChances(db: PrismaClient, scope: SharedPlayerRowsScope, players: FantasyPlannerPlayer[]) {
  const teams = new Set(players.flatMap(p => !p.isProviderPlaceholder && p.teamId && /^\d+$/.test(p.teamId) ? [p.teamId] : []));
  const chances = await loadSorareStartChances(db, [...teams].map(id => ({ ...scope, teamId: BigInt(id) })));
  return players.map(player => {
    const chance = !player.isProviderPlaceholder ? chances.get(`${scope.leagueId}:${scope.season}:${player.teamId}:${player.playerId}`) : null;
    return chance || player.sorareStartChance ? { ...player, sorareStartChance: chance ?? null } : player;
  });
}

export async function withdrawSorareStartChances(
  db: PrismaClient, scope: { leagueId: bigint; season: string; teamId: bigint }, metadata: unknown, stillPublished?: NextTeamGame
) {
  const previous = record(record(metadata)?.probableLineup);
  if (previous?.source !== "SORAREINSIDE" || !record(previous.startPercentByPlayerId)) return;
  if (stillPublished && previous.sourceFixtureId === stillPublished.game.id && previous.sourceKickoff === stillPublished.game.kickoff &&
      previous.sourceLineupId === stillPublished.lineupId) return;
  // Compare the captured publication and remove only its odds, preserving concurrent edits and XI flags.
  await db.$executeRaw`UPDATE league_season_teams SET metadata = metadata #- '{probableLineup,startPercentByPlayerId}'
    WHERE league_id = ${scope.leagueId} AND season = ${scope.season} AND team_id = ${scope.teamId}
      AND metadata -> 'probableLineup' = ${JSON.stringify(previous)}::jsonb`;
}
