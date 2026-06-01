import type { PrismaClient } from "@prisma/client";

import { calculateAlternativeScore, calculateFantasyScore, calculateScoringScore, getActiveScoringModelForSource, type ActiveScoringModel } from "@/lib/scoring";
import { leagueSeeds } from "@/lib/leagues/seed-data";
import { compareMacheteLeagues, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { teamLogoUrlForSlug, validTeamLogoUrl } from "@/lib/teams/logo-assets";
import { normalizeName, slugify } from "@/lib/text";
import { matchWindowSeasonLabel, type MacheteMatchWindow } from "@/scoring/machete/match-window";

export type SharedLeagueSeasonOption = {
  leagueId: bigint;
  season: string;
  name: string;
  displayName: string;
  country: string | null;
  providerLeagueId: string;
  isCurrent: boolean;
  updatedAt: Date;
};

export type SharedTeamCompetitionOption = SharedLeagueSeasonOption & {
  key: string;
  matchesCount: number;
  latestMatchDate: Date | null;
};

export type SharedTeamOption = {
  id: bigint;
  name: string;
  country: string | null;
  rawRef: string | null;
  logoUrl: string | null;
};

export type SharedPlayerOption = {
  id: bigint;
  name: string;
  position: string | null;
  age: number | null;
  nationality: string | null;
};

export type SharedMachetePlayerRow = {
  id: string;
  name: string;
  teamName?: string | null;
  leagueName?: string | null;
  position: string | null;
  age: number | null;
  nationality: string | null;
  isStarter: boolean;
  matchesPlayed: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  keyPasses: number;
  tackles: number;
  averageRating: number | null;
  fantasyScore: number | null;
  scoringScore: number | null;
  alternativeScore: number | null;
  recentFp: number[];
};

export type SharedPlayerRowsScope = {
  leagueId: bigint;
  season: string;
  teamId?: bigint | null;
};

export type SharedMatchWindowSummary = {
  officialMatches: number;
  matchesWithPlayerStats: number;
};

type MatchPlayerStatRecord = Awaited<ReturnType<typeof loadStatsForMatchIds>>[number];
type SharedTeamMatchRef = {
  id: bigint;
  matchDate: Date | null;
};

export async function loadSharedLeagueOptions(prisma: PrismaClient): Promise<SharedLeagueSeasonOption[]> {
  const options = await loadSharedLeagueSeasonOptions(prisma);
  const latestByLeagueId = new Map<string, SharedLeagueSeasonOption>();
  for (const option of options) {
    const key = String(option.leagueId);
    const current = latestByLeagueId.get(key);
    if (!current || preferSharedLeagueSeason(option, current)) {
      latestByLeagueId.set(key, option);
    }
  }

  return [...latestByLeagueId.values()].sort((left, right) =>
    compareMacheteLeagues(leagueDisplayInput(left), leagueDisplayInput(right)) || seasonRank(right.season) - seasonRank(left.season)
  );
}

export async function loadSharedLeagueSeasonOptions(prisma: PrismaClient): Promise<SharedLeagueSeasonOption[]> {
  const rows = await prisma.leagueSeason.findMany({
    where: {
      teams: {
        some: {
          active: true
        }
      }
    },
    include: {
      league: true
    },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  });

  return rows
    .map((row) => {
      const providerLeagueId = String(row.leagueId);
      const name = row.name ?? row.league.name;
      const country = row.country ?? row.league.country;
      const displayName = macheteLeagueDisplayName({
        id: providerLeagueId,
        name,
        country,
        providerLeagueId
      });

      return {
        leagueId: row.leagueId,
        season: row.season,
        name,
        displayName,
        country,
        providerLeagueId,
        isCurrent: row.isCurrent,
        updatedAt: row.updatedAt
      };
    })
    .sort((left, right) =>
      compareMacheteLeagues(leagueDisplayInput(left), leagueDisplayInput(right)) || seasonRank(right.season) - seasonRank(left.season)
    );
}

export async function loadSharedLeagueSeason(prisma: PrismaClient, rawLeagueId: string | number | bigint, rawSeason?: string | null) {
  const leagueId = parseSharedBigInt(rawLeagueId);
  if (!leagueId) return null;
  const options = (await loadSharedLeagueSeasonOptions(prisma)).filter((option) => option.leagueId === leagueId);
  if (rawSeason) {
    const exactSeason = options.find((option) => option.season === rawSeason);
    if (exactSeason) return exactSeason;
  }
  return defaultSharedLeagueSeason(options);
}

export async function loadSharedTeamCompetitionOptions(prisma: PrismaClient, teamId: bigint): Promise<SharedTeamCompetitionOption[]> {
  const matches = await prisma.coreMatch.findMany({
    where: {
      finished: true,
      leagueId: { not: null },
      season: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    select: {
      leagueId: true,
      season: true,
      matchDate: true,
      league: {
        select: {
          name: true,
          country: true
        }
      }
    },
    orderBy: { matchDate: "desc" }
  });

  const grouped = new Map<
    string,
    {
      leagueId: bigint;
      season: string;
      matchesCount: number;
      latestMatchDate: Date | null;
      league: { name: string; country: string | null } | null;
    }
  >();

  for (const match of matches) {
    if (!match.leagueId || !match.season) continue;
    const key = sharedCompetitionKey(match.leagueId, match.season);
    const existing = grouped.get(key);
    if (existing) {
      existing.matchesCount += 1;
      if (dateMs(match.matchDate) > dateMs(existing.latestMatchDate)) existing.latestMatchDate = match.matchDate;
      continue;
    }

    grouped.set(key, {
      leagueId: match.leagueId,
      season: match.season,
      matchesCount: 1,
      latestMatchDate: match.matchDate,
      league: match.league
    });
  }

  if (grouped.size === 0) return [];

  const seasonRows = await prisma.leagueSeason.findMany({
    where: {
      OR: [...grouped.values()].map((group) => ({
        leagueId: group.leagueId,
        season: group.season
      }))
    },
    include: {
      league: true
    }
  });
  const seasonRowsByKey = new Map(seasonRows.map((row) => [sharedCompetitionKey(row.leagueId, row.season), row]));

  return [...grouped.values()]
    .map((group) => {
      const row = seasonRowsByKey.get(sharedCompetitionKey(group.leagueId, group.season));
      const providerLeagueId = String(group.leagueId);
      const name = row?.name ?? row?.league.name ?? group.league?.name ?? `League ${providerLeagueId}`;
      const country = row?.country ?? row?.league.country ?? group.league?.country ?? null;
      const displayName = macheteLeagueDisplayName({
        id: providerLeagueId,
        name,
        country,
        providerLeagueId
      });

      return {
        key: sharedCompetitionKey(group.leagueId, group.season),
        leagueId: group.leagueId,
        season: group.season,
        name,
        displayName,
        country,
        providerLeagueId,
        isCurrent: row?.isCurrent ?? false,
        updatedAt: row?.updatedAt ?? group.latestMatchDate ?? new Date(0),
        matchesCount: group.matchesCount,
        latestMatchDate: group.latestMatchDate
      };
    })
    .sort((left, right) => compareMacheteLeagues(leagueDisplayInput(left), leagueDisplayInput(right)) || seasonRank(right.season) - seasonRank(left.season));
}

export async function loadSharedLeagueTeams(prisma: PrismaClient, leagueId: bigint, season: string): Promise<SharedTeamOption[]> {
  const rows = await prisma.leagueSeasonTeam.findMany({
    where: {
      leagueId,
      season,
      active: true
    },
    include: {
      team: true
    },
    orderBy: {
      team: {
        name: "asc"
      }
    }
  });

  return rows.map((row) => ({
    id: row.team.id,
    name: row.team.name,
    country: row.team.country,
    rawRef: row.team.rawRef,
    logoUrl: resolveSharedTeamLogoUrl({
      providerLeagueId: String(leagueId),
      teamName: row.team.name,
      rawRef: row.team.rawRef,
      metadata: row.metadata
    })
  }));
}

export function resolveSharedTeamLogoUrl(input: {
  providerLeagueId: string;
  teamName: string;
  rawRef: string | null | undefined;
  metadata: unknown;
}) {
  const metadataLogoUrl = metadataText(input.metadata, "logo_url");
  const shortName = metadataText(input.metadata, "short_name");

  return (
    localSharedTeamLogoUrl(input.providerLeagueId, input.teamName, shortName, metadataLogoUrl) ??
    renderableTeamLogoUrl(metadataLogoUrl) ??
    fotMobTeamLogoUrl(input.rawRef)
  );
}

export async function loadSharedTeamPlayers(prisma: PrismaClient, leagueId: bigint, season: string, teamId: bigint): Promise<SharedPlayerOption[]> {
  const rows = await prisma.teamPlayerSeason.findMany({
    where: {
      leagueId,
      season,
      teamId,
      active: true
    },
    include: {
      player: true
    },
    orderBy: {
      player: {
        name: "asc"
      }
    }
  });

  return rows.map((row) => ({
    id: row.playerId,
    name: row.player.name,
    position: row.position,
    age: row.age,
    nationality: row.nationality ?? row.player.country
  }));
}

export async function loadSharedMachetePlayerRows(
  prisma: PrismaClient,
  input: {
    scopes: SharedPlayerRowsScope[];
    position?: string;
    minMinutes?: string;
    matchWindow: MacheteMatchWindow;
    combineTeamCompetitions?: boolean;
    scoringModel?: ActiveScoringModel;
  }
): Promise<SharedMachetePlayerRow[]> {
  const scopes = input.scopes.filter((scope) => scope.leagueId && scope.season);
  if (scopes.length === 0) return [];

  const rosterRows = await prisma.teamPlayerSeason.findMany({
    where: {
      active: true,
      OR: scopes.map((scope) => ({
        leagueId: scope.leagueId,
        season: scope.season,
        ...(scope.teamId ? { teamId: scope.teamId } : {})
      })),
      ...(input.position ? { position: { contains: input.position, mode: "insensitive" } } : {})
    },
    include: {
      player: true,
      team: true,
      seasonTeam: {
        include: {
          leagueSeason: {
            include: {
              league: true
            }
          }
        }
      }
    },
    orderBy: [{ team: { name: "asc" } }, { player: { name: "asc" } }]
  });

  if (rosterRows.length === 0) return [];

  const teamScopes = new Map<string, SharedPlayerRowsScope>();
  for (const scope of scopes) {
    if (!scope.teamId) continue;
    const key = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
    if (!teamScopes.has(key)) teamScopes.set(key, { leagueId: scope.leagueId, season: scope.season, teamId: scope.teamId });
  }

  for (const row of rosterRows) {
    const key = teamScopeKey(row.leagueId, row.season, row.teamId);
    if (!teamScopes.has(key)) teamScopes.set(key, { leagueId: row.leagueId, season: row.season, teamId: row.teamId });
  }

  const matchRefsByTeamScope = new Map<string, SharedTeamMatchRef[]>();
  await Promise.all(
    [...teamScopes.values()].map(async (scope) => {
      if (!scope.teamId) return;
      const key = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
      matchRefsByTeamScope.set(
        key,
        await loadSharedTeamMatchRefs(prisma, scope.leagueId, scope.season, scope.teamId, input.matchWindow, {
          deferLastLimit: Boolean(input.combineTeamCompetitions && input.matchWindow.kind === "last")
        })
      );
    })
  );

  const matchIdsByTeamScope = new Map([...matchRefsByTeamScope.entries()].map(([key, matches]) => [key, matches.map((match) => match.id)]));
  const matchDateById = new Map<string, Date | null>();
  for (const matches of matchRefsByTeamScope.values()) {
    for (const match of matches) matchDateById.set(String(match.id), match.matchDate);
  }
  const limitedMatchIdsByTeam = groupScopeMatchIdsByTeam(teamScopes.values(), matchRefsByTeamScope, input.matchWindow);
  const allMatchIds = uniqueBigints([...matchIdsByTeamScope.values()].flat());
  const scopedMatchIds = input.combineTeamCompetitions && input.matchWindow.kind === "last" ? uniqueBigints([...limitedMatchIdsByTeam.values()].flat()) : allMatchIds;
  const stats = await loadStatsForMatchIds(
    prisma,
    scopedMatchIds,
    uniqueBigints(rosterRows.map((row) => row.teamId)),
    uniqueBigints(rosterRows.map((row) => row.playerId))
  );
  const statsByTeamPlayer = groupStatsByTeamPlayer(stats);
  const scoringModel = input.scoringModel ?? (await getActiveScoringModelForSource("MACHETE"));
  const minimumMinutes = input.minMinutes ? Number(input.minMinutes) : null;

  if (input.combineTeamCompetitions) {
    const rosterRowsByTeamPlayer = new Map<string, typeof rosterRows>();
    for (const row of rosterRows) {
      const key = teamPlayerKey(row.teamId, row.playerId);
      const rows = rosterRowsByTeamPlayer.get(key) ?? [];
      rows.push(row);
      rosterRowsByTeamPlayer.set(key, rows);
    }

    return [...rosterRowsByTeamPlayer.values()]
      .map((rows) => {
        const first = rows[0];
        const allowedMatchIds = new Set((limitedMatchIdsByTeam.get(String(first.teamId)) ?? []).map(String));

        const playerStats = (statsByTeamPlayer.get(teamPlayerKey(first.teamId, first.playerId)) ?? []).filter((stat) => allowedMatchIds.has(String(stat.matchId)));
        const position = firstNonEmpty(rows.map((row) => row.position));
        const leagueNames = uniqueStrings(rows.map(leagueNameForRosterRow));
        const aggregate = aggregateSharedStats(playerStats, position, scoringModel, matchDateById);

        return {
          id: `combined:${first.teamId}:${first.playerId}:${rows.map((row) => `${row.leagueId}:${row.season}`).join("|")}`,
          name: first.player.name,
          teamName: first.team.name,
          leagueName: formatCombinedLeagueNames(leagueNames),
          position,
          age: rows.find((row) => row.age !== null)?.age ?? null,
          nationality: firstNonEmpty(rows.map((row) => row.nationality ?? row.player.country)),
          isStarter: rows.some((row) => row.isStarter),
          ...aggregate
        };
      })
      .filter((row) => (minimumMinutes !== null && Number.isFinite(minimumMinutes) ? row.minutesPlayed >= minimumMinutes : true));
  }

  return rosterRows
    .map((row) => {
      const teamKey = teamScopeKey(row.leagueId, row.season, row.teamId);
      const allowedMatchIds = new Set((matchIdsByTeamScope.get(teamKey) ?? []).map(String));
      const playerStats = (statsByTeamPlayer.get(teamPlayerKey(row.teamId, row.playerId)) ?? []).filter((stat) => allowedMatchIds.has(String(stat.matchId)));
      const aggregate = aggregateSharedStats(playerStats, row.position, scoringModel, matchDateById);
      const leagueName = leagueNameForRosterRow(row);

      return {
        id: `${row.leagueId}:${row.season}:${row.teamId}:${row.playerId}`,
        name: row.player.name,
        teamName: row.team.name,
        leagueName,
        position: row.position,
        age: row.age,
        nationality: row.nationality ?? row.player.country,
        isStarter: row.isStarter,
        ...aggregate
      };
    })
    .filter((row) => (minimumMinutes !== null && Number.isFinite(minimumMinutes) ? row.minutesPlayed >= minimumMinutes : true));
}

export function sortSharedMacheteRows<T extends SharedMachetePlayerRow>(rows: T[], sort: string) {
  return [...rows].sort((left, right) => compareSharedMacheteRows(left, right, sort));
}

export async function loadSharedTeamMatchIds(
  prisma: PrismaClient,
  leagueId: bigint,
  season: string,
  teamId: bigint,
  window: MacheteMatchWindow
) {
  const matches = await loadSharedTeamMatchRefs(prisma, leagueId, season, teamId, window);
  return matches.map((match) => match.id);
}

export async function loadSharedMatchWindowSummary(
  prisma: PrismaClient,
  scopes: SharedPlayerRowsScope[],
  window: MacheteMatchWindow,
  combineTeamCompetitions = false
): Promise<SharedMatchWindowSummary | null> {
  const teamScopes = new Map<string, SharedPlayerRowsScope>();
  for (const scope of scopes) {
    if (!scope.teamId) continue;
    const key = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
    teamScopes.set(key, scope);
  }
  if (teamScopes.size === 0) return null;

  const matchRefsByTeamScope = new Map<string, SharedTeamMatchRef[]>();
  await Promise.all(
    [...teamScopes.values()].map(async (scope) => {
      if (!scope.teamId) return;
      const key = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
      matchRefsByTeamScope.set(
        key,
        await loadSharedTeamMatchRefs(prisma, scope.leagueId, scope.season, scope.teamId, window, {
          deferLastLimit: combineTeamCompetitions && window.kind === "last"
        })
      );
    })
  );

  const matchIdsByTeam = groupScopeMatchIdsByTeam(teamScopes.values(), matchRefsByTeamScope, window);
  const officialMatchIds = uniqueBigints([...matchIdsByTeam.values()].flat());
  if (officialMatchIds.length === 0) return { officialMatches: 0, matchesWithPlayerStats: 0 };

  const teamIds = uniqueBigints([...teamScopes.values()].map((scope) => scope.teamId).filter((teamId): teamId is bigint => Boolean(teamId)));
  const statMatches = await prisma.matchPlayerStat.findMany({
    where: {
      matchId: { in: officialMatchIds },
      teamId: { in: teamIds }
    },
    select: {
      matchId: true
    },
    distinct: ["matchId"]
  });

  return {
    officialMatches: officialMatchIds.length,
    matchesWithPlayerStats: statMatches.length
  };
}

async function loadSharedTeamMatchRefs(
  prisma: PrismaClient,
  leagueId: bigint,
  season: string,
  teamId: bigint,
  window: MacheteMatchWindow,
  options: { deferLastLimit?: boolean } = {}
) {
  const seasonFilter = window.kind === "season" ? matchWindowSeasonLabel(season, window.offset, String(leagueId)) : season;
  const matches = await prisma.coreMatch.findMany({
    where: {
      finished: true,
      leagueId,
      ...(seasonFilter ? { season: seasonFilter } : {}),
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    orderBy: { matchDate: "desc" },
    take: window.kind === "last" && !options.deferLastLimit ? window.matches : undefined,
    select: { id: true, matchDate: true }
  });

  return matches;
}

export async function loadSharedTeamFixtures(prisma: PrismaClient, leagueId: bigint, season: string, teamId: bigint, limit = 8) {
  return prisma.coreMatch.findMany({
    where: {
      leagueId,
      season,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } }
    },
    orderBy: { matchDate: "desc" },
    take: limit
  });
}

export function parseSharedBigInt(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function sharedCompetitionKey(leagueId: string | number | bigint, season: string) {
  return `${leagueId}:${season}`;
}

export function parseSharedCompetitionKey(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) return null;
  const leagueId = parseSharedBigInt(raw.slice(0, separatorIndex));
  const season = raw.slice(separatorIndex + 1);
  if (!leagueId || !season) return null;
  return { leagueId, season };
}

export function seasonRank(season: string) {
  const parts = season.match(/\d{2,4}/g);
  if (!parts?.length) return Number.NEGATIVE_INFINITY;

  const startYear = Number(parts[0]);
  if (!Number.isFinite(startYear)) return Number.NEGATIVE_INFINITY;

  let endYear = startYear;
  if (parts[1]) {
    endYear = Number(parts[1]);
    if (parts[1].length === 2) {
      endYear = Math.floor(startYear / 100) * 100 + endYear;
      if (endYear < startYear) endYear += 100;
    }
  }

  return endYear * 10_000 + startYear;
}

function defaultSharedLeagueSeason(options: SharedLeagueSeasonOption[]) {
  return options.reduce<SharedLeagueSeasonOption | null>((current, option) => (!current || preferSharedLeagueSeason(option, current) ? option : current), null);
}

function preferSharedLeagueSeason(candidate: SharedLeagueSeasonOption, current: SharedLeagueSeasonOption) {
  if (candidate.isCurrent !== current.isCurrent) return candidate.isCurrent;

  const candidateRank = seasonRank(candidate.season);
  const currentRank = seasonRank(current.season);
  if (candidateRank !== currentRank) return candidateRank > currentRank;

  return dateMs(candidate.updatedAt) > dateMs(current.updatedAt);
}

async function loadStatsForMatchIds(prisma: PrismaClient, matchIds: bigint[], teamIds: bigint[] = [], playerIds: bigint[] = []) {
  if (matchIds.length === 0) return [];

  return prisma.matchPlayerStat.findMany({
    where: {
      matchId: { in: matchIds },
      ...(teamIds.length > 0 ? { teamId: { in: teamIds } } : {}),
      ...(playerIds.length > 0 ? { playerId: { in: playerIds } } : {})
    }
  });
}

function groupStatsByTeamPlayer(stats: MatchPlayerStatRecord[]) {
  const grouped = new Map<string, MatchPlayerStatRecord[]>();
  for (const stat of stats) {
    if (!stat.teamId) continue;
    const key = teamPlayerKey(stat.teamId, stat.playerId);
    const rows = grouped.get(key) ?? [];
    rows.push(stat);
    grouped.set(key, rows);
  }
  return grouped;
}

const RECENT_FP_WINDOW = 5;

function aggregateSharedStats(
  stats: MatchPlayerStatRecord[],
  position: string | null | undefined,
  model: ActiveScoringModel,
  matchDateById?: Map<string, Date | null>
) {
  const matchesPlayed = stats.length;
  const minutesPlayed = sum(stats.map((stat) => stat.minutes));
  const goals = sum(stats.map((stat) => stat.goals));
  const assists = sum(stats.map((stat) => stat.assists));
  const xg = sum(stats.map((stat) => stat.xg));
  const xa = sum(stats.map((stat) => stat.xa));
  const xgot = sum(stats.map((stat) => stat.xgot));
  const shots = sum(stats.map((stat) => stat.shots));
  const shotsOnTarget = sum(stats.map((stat) => stat.shotsOnTarget));
  const keyPasses = sum(stats.map((stat) => stat.keyPasses));
  const chancesCreated = sum(stats.map((stat) => stat.chancesCreated));
  const tackles = sum(stats.map((stat) => stat.tacklesWon));
  const interceptions = sum(stats.map((stat) => stat.interceptions));
  const clearances = sum(stats.map((stat) => stat.clearances));
  const saves = sum(stats.map((stat) => stat.saves));
  const goalsConceded = sum(stats.map((stat) => stat.goalsConceded));
  const yellowCards = sum(stats.map((stat) => stat.yellowCards));
  const redCards = sum(stats.map((stat) => stat.redCards));
  const cleanSheets = stats.filter((stat) => stat.cleanSheet === true).length;
  const recoveries = sum(stats.map((stat) => stat.recoveries));
  const ratings = stats.map((stat) => stat.rating).filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating));
  const averageRating = ratings.length ? round(sum(ratings) / ratings.length) : null;

  const rawMetrics = {
    matches_played: matchesPlayed,
    minutes_played: minutesPlayed,
    appearances_60: stats.filter((stat) => (stat.minutes ?? 0) >= 60).length,
    full_matches: stats.filter((stat) => (stat.minutes ?? 0) >= 90).length,
    goals,
    assists,
    xg,
    xa,
    xgot,
    shots,
    shots_on_target: shotsOnTarget,
    key_passes: keyPasses,
    chances_created: chancesCreated,
    tackles,
    tackles_won: tackles,
    interceptions,
    clearances,
    recoveries,
    possession_recoveries: recoveries,
    saves,
    goals_conceded: goalsConceded,
    conceded_goals: goalsConceded,
    clean_sheets: cleanSheets,
    clean_sheet: cleanSheets,
    yellow_cards: yellowCards,
    red_cards: redCards,
    average_rating: averageRating ?? 0
  };
  const positionGroup = machetePositionGroup(position);

  const recentFp = computeRecentFp(stats, positionGroup, model, matchDateById);

  return {
    matchesPlayed,
    minutesPlayed,
    goals,
    assists,
    shotsOnTarget,
    keyPasses,
    tackles,
    averageRating,
    fantasyScore: calculateFantasyScore(rawMetrics, positionGroup, model),
    scoringScore: calculateScoringScore(rawMetrics, positionGroup, model),
    alternativeScore: calculateAlternativeScore(rawMetrics, positionGroup, model),
    recentFp
  };
}

function computeRecentFp(
  stats: MatchPlayerStatRecord[],
  positionGroup: string | null,
  model: ActiveScoringModel,
  matchDateById?: Map<string, Date | null>
): number[] {
  if (stats.length === 0) return [];

  const ordered = matchDateById
    ? [...stats].sort((left, right) => dateMs(matchDateById.get(String(left.matchId)) ?? null) - dateMs(matchDateById.get(String(right.matchId)) ?? null))
    : stats;
  const recent = ordered.slice(-RECENT_FP_WINDOW);

  return recent
    .map((stat) => {
      const rawMetrics = perMatchRawMetrics(stat);
      const value = calculateScoringScore(rawMetrics, positionGroup, model);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);
}

function perMatchRawMetrics(stat: MatchPlayerStatRecord) {
  const minutes = stat.minutes ?? 0;
  const recoveries = stat.recoveries ?? 0;
  const cleanSheet = stat.cleanSheet === true ? 1 : 0;

  return {
    matches_played: 1,
    minutes_played: minutes,
    appearances_60: minutes >= 60 ? 1 : 0,
    full_matches: minutes >= 90 ? 1 : 0,
    goals: stat.goals ?? 0,
    assists: stat.assists ?? 0,
    xg: stat.xg ?? 0,
    xa: stat.xa ?? 0,
    xgot: stat.xgot ?? 0,
    shots: stat.shots ?? 0,
    shots_on_target: stat.shotsOnTarget ?? 0,
    key_passes: stat.keyPasses ?? 0,
    chances_created: stat.chancesCreated ?? 0,
    tackles: stat.tacklesWon ?? 0,
    tackles_won: stat.tacklesWon ?? 0,
    interceptions: stat.interceptions ?? 0,
    clearances: stat.clearances ?? 0,
    recoveries,
    possession_recoveries: recoveries,
    saves: stat.saves ?? 0,
    goals_conceded: stat.goalsConceded ?? 0,
    conceded_goals: stat.goalsConceded ?? 0,
    clean_sheets: cleanSheet,
    clean_sheet: cleanSheet,
    yellow_cards: stat.yellowCards ?? 0,
    red_cards: stat.redCards ?? 0,
    average_rating: typeof stat.rating === "number" && Number.isFinite(stat.rating) ? stat.rating : 0
  };
}

const sharedMacheteSortColumns = {
  playerName: { field: "name", defaultDirection: "asc" },
  name: { field: "name", defaultDirection: "asc" },
  teamName: { field: "teamName", defaultDirection: "asc" },
  leagueName: { field: "leagueName", defaultDirection: "asc" },
  position: { field: "position", defaultDirection: "asc" },
  isStarter: { field: "isStarter", defaultDirection: "desc" },
  nationality: { field: "nationality", defaultDirection: "asc" },
  age: { field: "age", defaultDirection: "desc" },
  matchesPlayed: { field: "matchesPlayed", defaultDirection: "desc" },
  minutesPlayed: { field: "minutesPlayed", defaultDirection: "desc" },
  goals: { field: "goals", defaultDirection: "desc" },
  assists: { field: "assists", defaultDirection: "desc" },
  shotsOnTarget: { field: "shotsOnTarget", defaultDirection: "desc" },
  keyPasses: { field: "keyPasses", defaultDirection: "desc" },
  tackles: { field: "tackles", defaultDirection: "desc" },
  averageRating: { field: "averageRating", defaultDirection: "desc" },
  fantasyScore: { field: "fantasyScore", defaultDirection: "desc" },
  scoringScore: { field: "scoringScore", defaultDirection: "desc" },
  alternativeScore: { field: "alternativeScore", defaultDirection: "desc" }
} as const;

function compareSharedMacheteRows(left: SharedMachetePlayerRow, right: SharedMachetePlayerRow, sort: string) {
  const [rawKey, rawDirection] = sort.split(":");
  const key = rawKey in sharedMacheteSortColumns ? (rawKey as keyof typeof sharedMacheteSortColumns) : "fantasyScore";
  const column = sharedMacheteSortColumns[key];
  const direction = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : column.defaultDirection;
  const result = compareSharedMacheteValues(left[column.field], right[column.field], direction);
  return result || left.name.localeCompare(right.name);
}

function compareSharedMacheteValues(left: string | number | boolean | null | undefined, right: string | number | boolean | null | undefined, direction: "asc" | "desc") {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : typeof left === "boolean" && typeof right === "boolean"
        ? Number(left) - Number(right)
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });

  return direction === "asc" ? result : -result;
}

function leagueDisplayInput(league: SharedLeagueSeasonOption) {
  return {
    id: league.providerLeagueId,
    name: league.name,
    country: league.country,
    providerLeagueId: league.providerLeagueId
  };
}

function leagueNameForRosterRow(row: {
  leagueId: bigint;
  seasonTeam: {
    leagueSeason: {
      name: string | null;
      country: string | null;
      league: {
        name: string;
        country: string | null;
      };
    };
  };
}) {
  const leagueSeason = row.seasonTeam.leagueSeason;
  const providerLeagueId = String(row.leagueId);
  return macheteLeagueDisplayName({
    id: providerLeagueId,
    name: leagueSeason.name ?? leagueSeason.league.name,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId
  });
}

function dateMs(value: Date | null) {
  return value?.getTime() ?? 0;
}

function teamScopeKey(leagueId: bigint, season: string, teamId: bigint) {
  return `${leagueId}:${season}:${teamId}`;
}

function teamPlayerKey(teamId: bigint, playerId: bigint) {
  return `${teamId}:${playerId}`;
}

function groupScopeMatchIdsByTeam(scopes: Iterable<SharedPlayerRowsScope>, matchRefsByTeamScope: Map<string, SharedTeamMatchRef[]>, window: MacheteMatchWindow) {
  const grouped = new Map<string, bigint[]>();
  const refsByTeam = new Map<string, SharedTeamMatchRef[]>();

  for (const scope of scopes) {
    if (!scope.teamId) continue;
    const teamKey = String(scope.teamId);
    const scopeKey = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
    refsByTeam.set(teamKey, [...(refsByTeam.get(teamKey) ?? []), ...(matchRefsByTeamScope.get(scopeKey) ?? [])]);
  }

  for (const [teamKey, refs] of refsByTeam) {
    const sorted = uniqueMatchRefs(refs).sort((left, right) => dateMs(right.matchDate) - dateMs(left.matchDate));
    const limited = window.kind === "last" ? sorted.slice(0, window.matches) : sorted;
    grouped.set(teamKey, limited.map((match) => match.id));
  }

  return grouped;
}

function uniqueMatchRefs(values: SharedTeamMatchRef[]) {
  const seen = new Set<string>();
  const result: SharedTeamMatchRef[] = [];
  for (const value of values) {
    const key = String(value.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function localSharedTeamLogoUrl(providerLeagueId: string, teamName: string, shortName: string | null, metadataLogoUrl: string | null) {
  const preferredLogoUrl = validTeamLogoUrl(metadataLogoUrl);
  if (preferredLogoUrl) return preferredLogoUrl;

  const leagueSeed = leagueSeeds.find((league) => league.fotMobLeagueId === providerLeagueId);
  if (!leagueSeed) return null;

  const normalizedTeamNames = [teamName, shortName].filter((value): value is string => Boolean(value)).map(normalizeName);
  const seedTeam = leagueSeed.teams.find((candidate) => {
    const candidateNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeName);
    return normalizedTeamNames.some((name) => candidateNames.includes(name));
  });

  const logoCandidates = [
    seedTeam?.name,
    ...(seedTeam?.aliases ?? []),
    teamName,
    shortName
  ].filter((value): value is string => Boolean(value));

  for (const candidate of logoCandidates) {
    const logoUrl = teamLogoUrlForSlug(leagueSeed.id, slugify(candidate));
    if (logoUrl) return logoUrl;
  }

  return null;
}

function renderableTeamLogoUrl(value: string | null) {
  if (!value) return null;
  const logoUrl = value.trim();
  if (!logoUrl) return null;
  if (logoUrl.startsWith("/")) return validTeamLogoUrl(logoUrl);
  if (logoUrl.startsWith("https://images.fotmob.com/")) return logoUrl;
  return null;
}

function fotMobTeamLogoUrl(rawRef: string | null | undefined) {
  const teamId = rawRef?.trim();
  if (!teamId || !/^\d+$/.test(teamId)) return null;
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png`;
}

function metadataText(metadata: unknown, key: string) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueBigints(values: bigint[]) {
  const seen = new Set<string>();
  const result: bigint[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function firstNonEmpty(values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? null;
}

function formatCombinedLeagueNames(names: string[]) {
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} +${names.length - 2}`;
}

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
