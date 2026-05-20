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
};

export type SharedPlayerRowsScope = {
  leagueId: bigint;
  season: string;
  teamId?: bigint | null;
};

type MatchPlayerStatRecord = Awaited<ReturnType<typeof loadStatsForMatchIds>>[number];

export async function loadSharedLeagueOptions(prisma: PrismaClient): Promise<SharedLeagueSeasonOption[]> {
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

  const latestByLeagueId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = String(row.leagueId);
    const current = latestByLeagueId.get(key);
    if (!current || (row.isCurrent && !current.isCurrent) || (!current.isCurrent && !row.isCurrent && seasonRank(row.season) > seasonRank(current.season))) {
      latestByLeagueId.set(key, row);
    }
  }

  return [...latestByLeagueId.values()]
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

export async function loadSharedLeagueSeason(prisma: PrismaClient, rawLeagueId: string | number | bigint) {
  const leagueId = parseSharedBigInt(rawLeagueId);
  if (!leagueId) return null;
  const options = await loadSharedLeagueOptions(prisma);
  return options.find((option) => option.leagueId === leagueId) ?? null;
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
  for (const row of rosterRows) {
    const key = teamScopeKey(row.leagueId, row.season, row.teamId);
    if (!teamScopes.has(key)) teamScopes.set(key, { leagueId: row.leagueId, season: row.season, teamId: row.teamId });
  }

  const matchIdsByTeamScope = new Map<string, bigint[]>();
  await Promise.all(
    [...teamScopes.values()].map(async (scope) => {
      if (!scope.teamId) return;
      const key = teamScopeKey(scope.leagueId, scope.season, scope.teamId);
      matchIdsByTeamScope.set(key, await loadSharedTeamMatchIds(prisma, scope.leagueId, scope.season, scope.teamId, input.matchWindow));
    })
  );

  const allMatchIds = uniqueBigints([...matchIdsByTeamScope.values()].flat());
  const stats = await loadStatsForMatchIds(
    prisma,
    allMatchIds,
    uniqueBigints(rosterRows.map((row) => row.teamId)),
    uniqueBigints(rosterRows.map((row) => row.playerId))
  );
  const statsByTeamPlayer = groupStatsByTeamPlayer(stats);
  const scoringModel = await getActiveScoringModelForSource("MACHETE");
  const minimumMinutes = input.minMinutes ? Number(input.minMinutes) : null;

  return rosterRows
    .map((row) => {
      const teamKey = teamScopeKey(row.leagueId, row.season, row.teamId);
      const allowedMatchIds = new Set((matchIdsByTeamScope.get(teamKey) ?? []).map(String));
      const playerStats = (statsByTeamPlayer.get(teamPlayerKey(row.teamId, row.playerId)) ?? []).filter((stat) => allowedMatchIds.has(String(stat.matchId)));
      const aggregate = aggregateSharedStats(playerStats, row.position, scoringModel);
      const leagueSeason = row.seasonTeam.leagueSeason;
      const providerLeagueId = String(row.leagueId);
      const leagueName = macheteLeagueDisplayName({
        id: providerLeagueId,
        name: leagueSeason.name ?? leagueSeason.league.name,
        country: leagueSeason.country ?? leagueSeason.league.country,
        providerLeagueId
      });

      return {
        id: `${row.leagueId}:${row.season}:${row.teamId}:${row.playerId}`,
        name: row.player.name,
        teamName: row.team.name,
        leagueName,
        position: row.position,
        age: row.age,
        nationality: row.nationality ?? row.player.country,
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
  const seasonFilter = window.kind === "season" ? matchWindowSeasonLabel(season, window.offset, String(leagueId)) : window.kind === "last" ? season : null;
  const matches = await prisma.coreMatch.findMany({
    where: {
      finished: true,
      leagueId,
      ...(seasonFilter ? { season: seasonFilter } : {}),
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    orderBy: { matchDate: "desc" },
    take: window.kind === "last" ? window.matches : undefined,
    select: { id: true }
  });

  return matches.map((match) => match.id);
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

function aggregateSharedStats(stats: MatchPlayerStatRecord[], position: string | null | undefined, model: ActiveScoringModel) {
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
  const recoveries = sum(stats.map((stat) => readPayloadNumber(stat.statsPayload, ["recoveries", "possessionRecoveries", "possession_recoveries"])));
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
    alternativeScore: calculateAlternativeScore(rawMetrics, positionGroup, model)
  };
}

function compareSharedMacheteRows(left: SharedMachetePlayerRow, right: SharedMachetePlayerRow, sort: string) {
  if (sort === "playerName") return left.name.localeCompare(right.name);
  if (sort === "minutesPlayed") return right.minutesPlayed - left.minutesPlayed;
  if (sort === "scoringScore") return (right.scoringScore ?? -Infinity) - (left.scoringScore ?? -Infinity);
  if (sort === "alternativeScore") return (right.alternativeScore ?? -Infinity) - (left.alternativeScore ?? -Infinity);
  return (right.fantasyScore ?? -Infinity) - (left.fantasyScore ?? -Infinity);
}

function leagueDisplayInput(league: SharedLeagueSeasonOption) {
  return {
    id: league.providerLeagueId,
    name: league.name,
    country: league.country,
    providerLeagueId: league.providerLeagueId
  };
}

function teamScopeKey(leagueId: bigint, season: string, teamId: bigint) {
  return `${leagueId}:${season}:${teamId}`;
}

function teamPlayerKey(teamId: bigint, playerId: bigint) {
  return `${teamId}:${playerId}`;
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

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function readPayloadNumber(payload: unknown, keys: string[]) {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  for (const key of keys) {
    const direct = numericOrNull(record[key]);
    if (direct !== null) return direct;
  }

  return readNestedPayloadNumber(record.stats, new Set(keys.map(normalizePayloadKey)));
}

function readNestedPayloadNumber(value: unknown, normalizedKeys: Set<string>, depth = 0): number | null {
  if (depth > 6) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readNestedPayloadNumber(item, normalizedKeys, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }

  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (Object.keys(record).length === 0) return null;

  for (const [key, nestedValue] of Object.entries(record)) {
    if (payloadKeyMatches(key, normalizedKeys)) {
      const parsed = payloadNumberValue(nestedValue);
      if (parsed !== null) return parsed;
    }
  }

  for (const key of ["stats", "groups", "items", "children", "sections"]) {
    const nested = readNestedPayloadNumber(record[key], normalizedKeys, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

function payloadKeyMatches(key: string, normalizedKeys: Set<string>) {
  const normalized = normalizePayloadKey(key);
  for (const candidate of normalizedKeys) {
    if (normalized === candidate) return true;
    if (candidate.length >= 8 && normalized.includes(candidate)) return true;
  }
  return false;
}

function payloadNumberValue(value: unknown): number | null {
  const direct = numericOrNull(value);
  if (direct !== null) return direct;
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const stat = record.stat && typeof record.stat === "object" && !Array.isArray(record.stat) ? (record.stat as Record<string, unknown>) : {};
  return numericOrNull(record.value) ?? numericOrNull(record.displayValue) ?? numericOrNull(record.total) ?? numericOrNull(stat.value) ?? numericOrNull(stat.displayValue) ?? numericOrNull(stat.total);
}

function normalizePayloadKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
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
