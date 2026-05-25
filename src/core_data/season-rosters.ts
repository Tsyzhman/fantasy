import type { PrismaClient } from "@prisma/client";

import type { FotMobClient } from "./fotmob_client";
import { targetLeagueForCanonicalId } from "./league-aliases";
import { configForLeague, type LeagueIngestionConfig } from "./league-season-policy";
import { sourceIdToBigInt, type PlayerData, type TeamData } from "./models";
import { CoreMatchRepository, CorePlayerRepository, CoreSeasonRosterRepository, CoreTeamRepository } from "./repositories";

import type { FotMobPlayer, FotMobTeam } from "@/providers/fotmob/types";

export type SeasonRosterSyncResult = {
  leagueId: bigint;
  season: string;
  teams: number;
  players: number;
};

export async function resolveProviderCurrentSeason(client: FotMobClient, config: LeagueIngestionConfig, fallbackSeason: string) {
  try {
    const league = await client.getLeague(String(config.league_id));
    return normalizeSeasonLabel(league.season) ?? fallbackSeason;
  } catch (error) {
    console.warn(
      `[core_data] Could not resolve current FotMob season for league ${config.league_id}: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return fallbackSeason;
  }
}

export async function sync_league_season_rosters(
  prisma: PrismaClient,
  client: FotMobClient,
  input: {
    leagueId: number;
    canonicalLeagueId?: number | null;
    season: string;
    isCurrent?: boolean;
    deactivateMissing?: boolean;
  }
): Promise<SeasonRosterSyncResult> {
  const sourceLeagueId = input.leagueId;
  const canonicalLeagueId = input.canonicalLeagueId ?? input.leagueId;
  const leagueId = sourceIdToBigInt(canonicalLeagueId, "league");
  if (!leagueId) throw new Error("leagueId is required for roster sync.");

  const config = configForLeague(canonicalLeagueId) ?? configForLeague(sourceLeagueId);
  const targetLeague = targetLeagueForCanonicalId(canonicalLeagueId);
  const league = await client.getLeague(String(sourceLeagueId), input.season);
  const season = normalizeSeasonLabel(league.season) ?? input.season;
  const teams = await client.getTeams(String(sourceLeagueId), season);
  if (teams.length === 0) {
    throw new Error(`FotMob returned no teams for league ${sourceLeagueId} season ${season}.`);
  }

  const matchRepository = new CoreMatchRepository(prisma);
  const teamRepository = new CoreTeamRepository(prisma);
  const playerRepository = new CorePlayerRepository(prisma);
  const rosterRepository = new CoreSeasonRosterRepository(prisma);

  await matchRepository.upsertLeague({
    id: leagueId,
    name: targetLeague?.name ?? config?.name ?? league.name,
    country: targetLeague?.country ?? league.country ?? null,
    rawRef: String(canonicalLeagueId)
  });

  await rosterRepository.upsertLeagueSeason({
    leagueId,
    season,
    calendarType: config?.calendar_type ?? null,
    isCurrent: input.isCurrent ?? true,
    providerSeason: league.season ?? season,
    name: targetLeague?.name ?? config?.name ?? league.name,
    country: targetLeague?.country ?? league.country ?? null,
    metadata: {
      logo_url: league.logoUrl ?? null,
      source_league_id: sourceLeagueId,
      source_league_name: league.name
    }
  });

  const coreTeams = teams.map(teamData).filter((team): team is TeamData => team !== null);
  await teamRepository.upsertMany(coreTeams);

  const seasonTeams = coreTeams.map((team) => ({
    leagueId,
    season,
    teamId: team.id,
    active: true,
    metadata: teamMetadata(teams, team)
  }));
  await rosterRepository.upsertSeasonTeams(seasonTeams);
  if (input.deactivateMissing ?? true) {
    await rosterRepository.deactivateMissingSeasonTeams(
      leagueId,
      season,
      seasonTeams.map((team) => team.teamId)
    );
  }

  let playerCount = 0;
  for (const team of teams) {
    const teamId = sourceIdToBigInt(team.id, "team");
    if (!teamId) continue;

    const players = team.players.map(playerData).filter((player): player is PlayerData => player !== null);
    await playerRepository.upsertMany(players);
    playerCount += players.length;

    const rosterRows = team.players
      .map((player) => {
        const playerId = sourceIdToBigInt(player.id, "player");
        if (!playerId) return null;
        return {
          leagueId,
          season,
          teamId,
          playerId,
          active: true,
          position: player.position ?? null,
          shirtNumber: player.shirtNumber ?? null,
          nationality: player.nationality ?? null,
          age: player.age ?? null,
          photoUrl: player.photoUrl ?? null,
          rosterPayload: player.raw ?? null
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await rosterRepository.upsertTeamPlayers(rosterRows);
    if (input.deactivateMissing ?? true) {
      await rosterRepository.deactivateMissingTeamPlayers(
        leagueId,
        season,
        teamId,
        rosterRows.map((row) => row.playerId)
      );
    }
  }

  return {
    leagueId,
    season,
    teams: coreTeams.length,
    players: playerCount
  };
}

export function normalizeSeasonLabel(season: string | null | undefined) {
  if (!season) return null;
  const normalized = season.trim();
  const split = normalized.match(/^(\d{4})\/(\d{2})$/);
  if (!split) return normalized;
  return `${split[1]}/20${split[2]}`;
}

function teamData(team: FotMobTeam): TeamData | null {
  const id = sourceIdToBigInt(team.id, "team");
  if (!id) return null;
  return {
    id,
    name: team.name,
    country: team.country ?? null,
    ccode: null,
    rawRef: team.id
  };
}

function playerData(player: FotMobPlayer): PlayerData | null {
  const id = sourceIdToBigInt(player.id, "player");
  if (!id) return null;
  return {
    id,
    name: player.name,
    country: player.nationality ?? null,
    birthDate: null,
    rawRef: player.id
  };
}

function teamMetadata(teams: FotMobTeam[], team: TeamData) {
  const sourceTeam = teams.find((candidate) => sourceIdToBigInt(candidate.id, "team") === team.id);
  return {
    short_name: sourceTeam?.shortName ?? null,
    logo_url: sourceTeam?.logoUrl ?? null
  };
}
