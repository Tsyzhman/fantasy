import type { PrismaClient } from "@prisma/client";

import type { SharedLeagueSeasonOption, SharedPlayerRowsScope } from "@/machete/shared_read_model";
import type { MacheteMatchWindow } from "@/scoring/machete/match-window";
import {
  compareFantasySeasonLabels,
  type FantasyHistoryScope,
  type FantasyHistorySettings
} from "@/machete/squad-history-settings";

export * from "@/machete/squad-history-settings";

export type ResolvedFantasyHistory = {
  rosterScopes: SharedPlayerRowsScope[];
  historyScopes: SharedPlayerRowsScope[];
  matchWindow: MacheteMatchWindow;
  availableSeasons: string[];
  includePlayerHistory: boolean;
};

export async function resolveFantasyHistory(
  prisma: PrismaClient,
  league: SharedLeagueSeasonOption,
  settings: FantasyHistorySettings
): Promise<ResolvedFantasyHistory> {
  const rosterTeams = await prisma.leagueSeasonTeam.findMany({
    where: { leagueId: league.leagueId, season: league.season, active: true },
    select: { teamId: true, team: { select: { country: true } } }
  });
  const rosterScopes = rosterTeams.map((row) => ({ leagueId: league.leagueId, season: league.season, teamId: row.teamId }));
  const matchWindow: MacheteMatchWindow = settings.window === "LAST_5" ? { kind: "last", matches: 5 } : { kind: "all" };
  if (rosterTeams.length === 0) {
    return { rosterScopes, historyScopes: rosterScopes, matchWindow, availableSeasons: [], includePlayerHistory: settings.scope === "ALL_PLAYER_MATCHES" };
  }

  const teamIds = rosterTeams.map((row) => row.teamId);
  const teamCountryById = new Map(rosterTeams.map((row) => [String(row.teamId), normalizeCountry(row.team.country ?? league.country)]));
  const matches = await prisma.coreMatch.findMany({
    where: {
      finished: true,
      leagueId: { not: null },
      season: { not: null },
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }]
    },
    select: {
      leagueId: true,
      season: true,
      homeTeamId: true,
      awayTeamId: true,
      league: { select: { name: true, country: true } }
    }
  });

  const candidates = new Map<string, SharedPlayerRowsScope>();
  const loadedSeasons = new Set<string>();
  for (const match of matches) {
    if (!match.leagueId || !match.season) continue;
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId || !teamCountryById.has(String(teamId))) continue;
      loadedSeasons.add(match.season);
      if (!historyCompetitionMatches(settings.scope, league.leagueId, teamCountryById.get(String(teamId)) ?? null, match)) continue;
      const key = `${match.leagueId}:${match.season}:${teamId}`;
      candidates.set(key, { leagueId: match.leagueId, season: match.season, teamId });
    }
  }

  const availableSeasons = [...loadedSeasons].sort(compareFantasySeasonLabels);
  const selectedSeasonSet = new Set(settings.selectedSeasons);
  const historyScopes = [...candidates.values()].filter((scope) =>
    settings.window !== "SELECTED_SEASONS" || selectedSeasonSet.has(scope.season)
  );
  return {
    rosterScopes,
    historyScopes,
    matchWindow,
    availableSeasons,
    includePlayerHistory: settings.scope === "ALL_PLAYER_MATCHES"
  };
}

function historyCompetitionMatches(
  scope: FantasyHistoryScope,
  selectedLeagueId: bigint,
  teamCountry: string | null,
  match: { leagueId: bigint | null; league: { name: string; country: string | null } | null }
) {
  if (!match.leagueId) return false;
  if (scope === "ALL_LOADED" || scope === "ALL_PLAYER_MATCHES") return true;
  if (scope === "SELECTED_COMPETITION") return match.leagueId === selectedLeagueId;
  if (scope === "SELECTED_PLUS_UEFA") return match.leagueId === selectedLeagueId || isUefaClubCompetition(match.league?.name);
  const competitionCountry = normalizeCountry(match.league?.country);
  return Boolean(teamCountry && competitionCountry && teamCountry === competitionCountry);
}

function isUefaClubCompetition(name: string | null | undefined) {
  return /(?:uefa\s+)?(?:champions|europa) league/i.test(name ?? "");
}

function normalizeCountry(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || null;
}
