import { Prisma, type PrismaClient } from "@prisma/client";

import type { CalendarType } from "./ingestion-scope";
import { configForLeague } from "./league-season-policy";
import { FOTMOB_SOURCE } from "./models";

export const LEAGUE_SEASON_RETENTION_YEARS = 2;
export const LEAGUE_SEASON_RETENTION_TIME_ZONE = "Europe/Moscow";

export type RetentionCalendarType = Extract<CalendarType, "autumn_spring" | "spring_autumn">;

export type LeagueSeasonRetentionRow = {
  leagueId: bigint;
  season: string;
  calendarType: string | null;
  name?: string | null;
  country?: string | null;
};

export type ExpiredLeagueSeason = {
  leagueId: bigint;
  season: string;
  calendarType: RetentionCalendarType;
  startYear: number;
  cutoffStartYear: number;
  name: string | null;
  country: string | null;
};

export type LeagueSeasonRetentionOptions = {
  now?: Date;
  dryRun?: boolean;
  retentionYears?: number;
  timeZone?: string;
  calendarTypes?: readonly RetentionCalendarType[];
};

export type LeagueSeasonRetentionResult = {
  dryRun: boolean;
  skipped: boolean;
  reason: string | null;
  referenceDate: string;
  timeZone: string;
  retentionYears: number;
  activeCalendarTypes: RetentionCalendarType[];
  cutoffStartYear: number;
  candidates: Array<{
    leagueId: string;
    season: string;
    calendarType: RetentionCalendarType;
    startYear: number;
    cutoffStartYear: number;
    name: string | null;
    country: string | null;
  }>;
  counts: Record<string, number>;
  deleted: Record<string, number>;
};

type Target = Pick<ExpiredLeagueSeason, "leagueId" | "season">;
type SeasonScopedTable = {
  key: string;
  table: string;
};

const DIRECT_DELETE_TABLES: readonly SeasonScopedTable[] = [
  { key: "userFantasySquads", table: "user_fantasy_squads" },
  { key: "fantasyPlayerPrices", table: "fantasy_player_prices" },
  { key: "fantasyContests", table: "sports_ru_fantasy_contests" },
  { key: "ingestionCheckpoints", table: "ingestion_checkpoints" },
  { key: "coreMatches", table: "matches" },
  { key: "leagueSeasons", table: "league_seasons" }
];

const CASCADE_COUNT_TABLES: readonly SeasonScopedTable[] = [
  { key: "leagueSeasonTeams", table: "league_season_teams" },
  { key: "teamPlayerSeasons", table: "team_player_seasons" }
];

const TRUSTED_SEASON_SCOPED_TABLES = new Set([...DIRECT_DELETE_TABLES, ...CASCADE_COUNT_TABLES].map((table) => table.table));

export async function pruneOldLeagueSeasons(
  prisma: PrismaClient,
  options: LeagueSeasonRetentionOptions = {}
): Promise<LeagueSeasonRetentionResult> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? LEAGUE_SEASON_RETENTION_TIME_ZONE;
  const retentionYears = options.retentionYears ?? LEAGUE_SEASON_RETENTION_YEARS;
  const activeCalendarTypes = [...(options.calendarTypes ?? retentionCalendarTypesForDate(now, timeZone))];
  const cutoffStartYear = retentionCutoffStartYear(now, retentionYears, timeZone);
  const dryRun = options.dryRun ?? false;

  if (activeCalendarTypes.length === 0) {
    return {
      dryRun,
      skipped: true,
      reason: "not_a_retention_date",
      referenceDate: formatZonedDate(now, timeZone),
      timeZone,
      retentionYears,
      activeCalendarTypes,
      cutoffStartYear,
      candidates: [],
      counts: {},
      deleted: {}
    };
  }

  const leagueSeasons = await prisma.leagueSeason.findMany({
    where: { source: FOTMOB_SOURCE },
    select: {
      leagueId: true,
      season: true,
      calendarType: true,
      name: true,
      country: true
    }
  });
  const candidates = selectExpiredLeagueSeasons(leagueSeasons, {
    now,
    retentionYears,
    timeZone,
    calendarTypes: activeCalendarTypes
  });
  const targets = candidates.map(({ leagueId, season }) => ({ leagueId, season }));
  const counts = await countRetentionRows(prisma, targets);

  if (dryRun || targets.length === 0) {
    return {
      dryRun,
      skipped: targets.length === 0,
      reason: targets.length === 0 ? "no_expired_league_seasons" : null,
      referenceDate: formatZonedDate(now, timeZone),
      timeZone,
      retentionYears,
      activeCalendarTypes,
      cutoffStartYear,
      candidates: serializeCandidates(candidates),
      counts,
      deleted: {}
    };
  }

  const deleted: Record<string, number> = {};
  for (const table of DIRECT_DELETE_TABLES) {
    deleted[table.key] = await deleteRowsForTargets(prisma, table.table, targets);
  }

  deleted.shotmapComparisonsCache = await deleteShotmapComparisonsCache(prisma);

  return {
    dryRun,
    skipped: false,
    reason: null,
    referenceDate: formatZonedDate(now, timeZone),
    timeZone,
    retentionYears,
    activeCalendarTypes,
    cutoffStartYear,
    candidates: serializeCandidates(candidates),
    counts,
    deleted
  };
}

export function selectExpiredLeagueSeasons(
  rows: readonly LeagueSeasonRetentionRow[],
  options: Required<Pick<LeagueSeasonRetentionOptions, "now" | "retentionYears" | "timeZone" | "calendarTypes">>
): ExpiredLeagueSeason[] {
  const activeCalendarTypes = new Set(options.calendarTypes);
  const cutoffStartYear = retentionCutoffStartYear(options.now, options.retentionYears, options.timeZone);
  const referenceYear = zonedDateParts(options.now, options.timeZone).year;

  return rows
    .flatMap((row): ExpiredLeagueSeason[] => {
      const calendarType = retentionCalendarTypeForRow(row);
      if (!calendarType || !activeCalendarTypes.has(calendarType)) return [];

      const startYear = seasonStartYear(row.season, referenceYear);
      if (startYear === null || startYear >= cutoffStartYear) return [];

      return [
        {
          leagueId: row.leagueId,
          season: row.season,
          calendarType,
          startYear,
          cutoffStartYear,
          name: row.name ?? null,
          country: row.country ?? null
        }
      ];
    })
    .sort((first, second) => {
      const leagueSort = Number(first.leagueId - second.leagueId);
      if (leagueSort !== 0) return leagueSort;
      return first.startYear - second.startYear || first.season.localeCompare(second.season);
    });
}

export function retentionCalendarTypesForDate(date: Date, timeZone = LEAGUE_SEASON_RETENTION_TIME_ZONE): RetentionCalendarType[] {
  const parts = zonedDateParts(date, timeZone);
  if (parts.day !== 1) return [];
  if (parts.month === 1) return ["spring_autumn"];
  if (parts.month === 7) return ["autumn_spring"];
  return [];
}

export function retentionCutoffStartYear(date: Date, retentionYears = LEAGUE_SEASON_RETENTION_YEARS, timeZone = LEAGUE_SEASON_RETENTION_TIME_ZONE) {
  return zonedDateParts(date, timeZone).year - Math.max(1, retentionYears) + 1;
}

function retentionCalendarTypeForRow(row: LeagueSeasonRetentionRow): RetentionCalendarType | null {
  if (row.calendarType === "autumn_spring" || row.calendarType === "spring_autumn") return row.calendarType;
  if (row.calendarType === "tournament") return null;

  const leagueId = Number(row.leagueId);
  const configuredCalendarType = Number.isFinite(leagueId) ? configForLeague(leagueId)?.calendar_type : null;
  if (configuredCalendarType === "autumn_spring" || configuredCalendarType === "spring_autumn") return configuredCalendarType;
  if (configuredCalendarType === "tournament") return null;

  return inferCalendarTypeFromSeason(row.season);
}

function inferCalendarTypeFromSeason(season: string): RetentionCalendarType | null {
  if (/^\d{2,4}\s*\/\s*\d{2,4}$/.test(season)) return "autumn_spring";
  if (/^\d{4}$/.test(season)) return "spring_autumn";
  return null;
}

function seasonStartYear(season: string, referenceYear: number) {
  const match = season.match(/\d{2,4}/);
  if (!match) return null;

  const rawYear = Number(match[0]);
  if (!Number.isFinite(rawYear)) return null;

  if (match[0].length === 4) return rawYear;
  return expandTwoDigitYear(rawYear, referenceYear);
}

function expandTwoDigitYear(twoDigitYear: number, referenceYear: number) {
  const century = Math.floor(referenceYear / 100) * 100;
  const candidate = century + twoDigitYear;
  if (candidate > referenceYear + 20) return candidate - 100;
  if (candidate < referenceYear - 80) return candidate + 100;
  return candidate;
}

async function countRetentionRows(prisma: PrismaClient, targets: readonly Target[]) {
  if (targets.length === 0) return {};

  const counts: Record<string, number> = {};
  for (const table of [...CASCADE_COUNT_TABLES, ...DIRECT_DELETE_TABLES]) {
    counts[table.key] = await countRowsForTargets(prisma, table.table, targets);
  }
  counts.shotmapComparisonsCache = await prisma.shotmapComparisonsCache.count();
  return counts;
}

async function countRowsForTargets(prisma: PrismaClient, table: string, targets: readonly Target[]) {
  assertTrustedSeasonScopedTable(table);
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM ${Prisma.raw(table)} AS item
      JOIN ${targetValuesSql(targets)} AS target(league_id, season)
        ON item.league_id = target.league_id
       AND item.season = target.season
    `
  );

  return countValueToNumber(rows[0]?.count ?? 0);
}

async function deleteRowsForTargets(prisma: PrismaClient, table: string, targets: readonly Target[]) {
  assertTrustedSeasonScopedTable(table);
  return prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM ${Prisma.raw(table)} AS item
      USING ${targetValuesSql(targets)} AS target(league_id, season)
      WHERE item.league_id = target.league_id
        AND item.season = target.season
    `
  );
}

async function deleteShotmapComparisonsCache(prisma: PrismaClient) {
  const deleted = await prisma.shotmapComparisonsCache.deleteMany({});
  return deleted.count;
}

function targetValuesSql(targets: readonly Target[]) {
  return Prisma.sql`(VALUES ${Prisma.join(targets.map((target) => Prisma.sql`(${target.leagueId}::bigint, ${target.season}::text)`))})`;
}

function assertTrustedSeasonScopedTable(table: string) {
  if (!TRUSTED_SEASON_SCOPED_TABLES.has(table)) throw new Error(`Unexpected season-scoped table: ${table}`);
}

function serializeCandidates(candidates: readonly ExpiredLeagueSeason[]) {
  return candidates.map((candidate) => ({
    leagueId: String(candidate.leagueId),
    season: candidate.season,
    calendarType: candidate.calendarType,
    startYear: candidate.startYear,
    cutoffStartYear: candidate.cutoffStartYear,
    name: candidate.name,
    country: candidate.country
  }));
}

function countValueToNumber(value: bigint | number | string) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return value;
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function formatZonedDate(date: Date, timeZone: string) {
  const parts = zonedDateParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
