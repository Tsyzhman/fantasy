import type { PrismaClient } from "@prisma/client";

import { macheteCatalogByFotMobId } from "@/lib/leagues/machete-catalog";
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
  projectionScopes: SharedPlayerRowsScope[];
  matchWindow: MacheteMatchWindow;
  availableSeasons: string[];
  includePlayerHistory: boolean;
};

type FantasyHistoryMatch = {
  leagueId: bigint | null;
  season: string | null;
  matchDate: Date | null;
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  league: { name: string; country: string | null } | null;
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
    return {
      rosterScopes,
      historyScopes: rosterScopes,
      projectionScopes: rosterScopes,
      matchWindow,
      availableSeasons: [],
      includePlayerHistory: settings.scope === "ALL_PLAYER_MATCHES"
    };
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
      matchDate: true,
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
  const projectionScopes = resolveFantasyProjectionScopes(league, rosterScopes, matches);
  return {
    rosterScopes,
    historyScopes,
    projectionScopes,
    matchWindow,
    availableSeasons,
    includePlayerHistory: settings.scope === "ALL_PLAYER_MATCHES"
  };
}

/**
 * Forecast minutes are intentionally independent from the history filters in the UI.
 * A domestic fantasy competition uses only itself. UCL and UEL additionally use the
 * current primary domestic league actually played by each club.
 */
export function resolveFantasyProjectionScopes(
  selectedLeague: Pick<SharedLeagueSeasonOption, "leagueId" | "name">,
  rosterScopes: SharedPlayerRowsScope[],
  matches: FantasyHistoryMatch[]
) {
  if (!isChampionsOrEuropaLeague(selectedLeague.leagueId, selectedLeague.name)) return rosterScopes;

  const rosterTeamIds = new Set(rosterScopes.flatMap((scope) => scope.teamId ? [String(scope.teamId)] : []));
  const domesticByTeamCompetition = new Map<string, {
    scope: SharedPlayerRowsScope;
    latestMatchAt: number;
    matches: number;
  }>();

  for (const match of matches) {
    if (!match.leagueId || !match.season || !isDomesticLeagueCompetition(match)) continue;
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId || !rosterTeamIds.has(String(teamId))) continue;
      const key = `${teamId}:${match.leagueId}`;
      const matchAt = match.matchDate?.getTime() ?? Number.NEGATIVE_INFINITY;
      const current = domesticByTeamCompetition.get(key);
      domesticByTeamCompetition.set(key, {
        scope: !current || matchAt > current.latestMatchAt
          ? { leagueId: match.leagueId, season: match.season, teamId }
          : current.scope,
        latestMatchAt: Math.max(current?.latestMatchAt ?? Number.NEGATIVE_INFINITY, matchAt),
        matches: (current?.matches ?? 0) + 1
      });
    }
  }

  const domesticScopeByTeam = new Map<string, SharedPlayerRowsScope>();
  for (const teamId of rosterTeamIds) {
    const candidates = [...domesticByTeamCompetition.values()]
      .filter((candidate) => String(candidate.scope.teamId) === teamId);
    const latestMatchAt = Math.max(...candidates.map((candidate) => candidate.latestMatchAt), Number.NEGATIVE_INFINITY);
    const currentCandidates = Number.isFinite(latestMatchAt)
      ? candidates.filter((candidate) => latestMatchAt - candidate.latestMatchAt <= PRIMARY_COMPETITION_RECENCY_MS)
      : candidates;
    const selected = currentCandidates
      .sort((left, right) =>
        right.matches - left.matches ||
        right.latestMatchAt - left.latestMatchAt ||
        compareLeagueIds(left.scope.leagueId, right.scope.leagueId)
      )[0];
    if (selected) domesticScopeByTeam.set(teamId, selected.scope);
  }

  return uniqueProjectionScopes([...rosterScopes, ...domesticScopeByTeam.values()]);
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

function isChampionsOrEuropaLeague(leagueId: bigint, name: string) {
  return leagueId === 42n || leagueId === 73n || isUefaClubCompetition(name);
}

function isDomesticLeagueCompetition(match: FantasyHistoryMatch) {
  if (!match.leagueId) return false;
  const catalog = macheteCatalogByFotMobId(String(match.leagueId));
  const country = normalizeCountry(catalog?.country ?? match.league?.country);
  const name = normalizeCompetitionName(catalog?.name ?? match.league?.name);
  if (country === "international") return false;
  if (/(?:champions|europa|conference) league|libertadores|sudamericana|world cup|nations league|qualification|friendly/.test(name)) {
    return false;
  }
  return !/(?:^|\s)(?:cup|copa|coppa|coupe|cupa|taca|kupa(?:si)?|kup|pokal(?:en)?|beker|puchar|pohar|supercopa|super cup|shield|trophy|kubok|кубок|κυπελλο)(?:\s|$)/.test(name);
}

function normalizeCompetitionName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim()
    .toLocaleLowerCase();
}

function uniqueProjectionScopes(scopes: SharedPlayerRowsScope[]) {
  return [...new Map(scopes.map((scope) => [`${scope.leagueId}:${scope.season}:${scope.teamId ?? "all"}`, scope])).values()];
}

function compareLeagueIds(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const PRIMARY_COMPETITION_RECENCY_MS = 45 * 24 * 60 * 60 * 1_000;

function normalizeCountry(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || null;
}
