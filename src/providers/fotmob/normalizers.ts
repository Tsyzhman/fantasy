import { leagueSeeds } from "@/lib/leagues/seed-data";
import { teamLogoUrlForSlug } from "@/lib/teams/logo-assets";
import { normalizeName, slugify } from "@/lib/text";

import type { FotMobFixture, FotMobPlayer, FotMobPlayerMatchStat, FotMobTeam } from "./types";

export function normalizeMacheteTeam(team: FotMobTeam, leagueId: string, providerLeagueId?: string | null) {
  return {
    leagueId,
    provider: "FOTMOB",
    providerTeamId: team.id,
    name: team.name,
    shortName: team.shortName ?? null,
    country: team.country ?? null,
    logoUrl: localFotMobTeamLogoUrl(team, providerLeagueId) ?? team.logoUrl ?? null,
    status: "SYNCED",
    lastSyncedAt: new Date()
  };
}

export function normalizeMachetePlayer(player: FotMobPlayer, teamId?: string) {
  return {
    teamId,
    provider: "FOTMOB",
    providerPlayerId: player.id,
    name: player.name,
    position: player.position ?? null,
    age: player.age ?? null,
    nationality: player.nationality ?? null,
    height: player.height ?? null,
    foot: player.foot ?? null,
    photoUrl: player.photoUrl ?? null,
    status: "ACTIVE",
    lastSyncedAt: new Date()
  };
}

export function normalizeMacheteFixture(fixture: FotMobFixture, leagueId: string, teamIdsByProviderId: Map<string, string>) {
  return {
    leagueId,
    provider: "FOTMOB",
    providerFixtureId: fixture.id,
    homeTeamId: teamIdsByProviderId.get(fixture.homeTeamId) ?? null,
    awayTeamId: teamIdsByProviderId.get(fixture.awayTeamId) ?? null,
    kickoffAt: fixture.kickoffAt ? new Date(fixture.kickoffAt) : null,
    status: fixture.status,
    round: fixture.round ?? null,
    aggregateSeason: null,
    homeScore: fixture.homeScore ?? null,
    awayScore: fixture.awayScore ?? null,
    lastSyncedAt: new Date()
  };
}

export function normalizeMacheteMatchStat(stat: FotMobPlayerMatchStat, fixtureId: string, playerId: string, teamId?: string) {
  return {
    fixtureId,
    playerId,
    teamId: teamId ?? null,
    minutes: stat.minutes,
    rating: stat.rating,
    goals: stat.goals,
    assists: stat.assists,
    shots: stat.shots,
    shotsOnTarget: stat.shotsOnTarget,
    keyPasses: stat.keyPasses,
    tackles: stat.tackles,
    interceptions: stat.interceptions,
    saves: stat.saves,
    yellowCards: stat.yellowCards,
    redCards: stat.redCards,
    aggregateMatches: stat.aggregateMatches ?? null
  };
}

function localFotMobTeamLogoUrl(team: FotMobTeam, providerLeagueId?: string | null) {
  const leagueSeed = leagueSeeds.find((league) => league.fotMobLeagueId === providerLeagueId);
  if (!leagueSeed) return team.logoUrl?.startsWith("/") ? team.logoUrl : null;

  const normalizedTeamNames = [team.name, team.shortName].filter((value): value is string => Boolean(value)).map(normalizeName);
  const seedTeam = leagueSeed.teams.find((candidate) => {
    const candidateNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeName);
    return normalizedTeamNames.some((name) => candidateNames.includes(name));
  });

  const logoCandidates = [
    seedTeam?.name,
    ...(seedTeam?.aliases ?? []),
    team.name,
    team.shortName
  ].filter((value): value is string => Boolean(value));

  for (const candidate of logoCandidates) {
    const logoUrl = teamLogoUrlForSlug(leagueSeed.id, slugify(candidate));
    if (logoUrl) return logoUrl;
  }

  return null;
}
