import { macheteLeagueCatalog } from "@/lib/leagues/machete-catalog";

import { createIngestionScope, type CalendarType, type IngestionScope } from "./ingestion-scope";

export const AUTUMN_SPRING_START_SEASON = "2023/2024";
export const SPRING_AUTUMN_START_SEASON = "2023";

export type LeagueIngestionConfig = Readonly<{
  league_id: number;
  name: string;
  calendar_type: CalendarType;
  initial_start_season: string;
  enabled: boolean;
  explicit_seasons?: readonly string[];
  max_matches?: number;
  max_date_span_days?: number;
}>;

const springAutumnLeagueIds = new Set([
  59, 67, 112, 130, 131, 144, 161, 199, 246, 268, 273, 274, 299, 339, 441, 8972, 9296, 9441, 10199, 10282
]);

const tournamentLeagueIds = new Set([
  42, 44, 45, 50, 73, 74, 77, 132, 133, 134, 137, 138, 139, 141, 149, 186, 193, 209, 235, 491, 9067, 9305, 9441, 9806,
  9942, 10007, 10074, 10195, 10199, 10216
]);

const tournamentSeasons = new Map<number, readonly string[]>([
  [77, ["2026"]],
  [50, ["2024"]],
  [44, ["2024"]],
  [42, [AUTUMN_SPRING_START_SEASON]],
  [73, [AUTUMN_SPRING_START_SEASON]],
  [10216, [AUTUMN_SPRING_START_SEASON]],
  [74, ["2023"]],
  [45, [SPRING_AUTUMN_START_SEASON]],
  [299, [SPRING_AUTUMN_START_SEASON]],
  [491, [SPRING_AUTUMN_START_SEASON]]
]);

const tournamentMaxMatches = new Map<number, number>([
  [77, 120],
  [50, 80],
  [44, 80],
  [42, 260],
  [73, 260],
  [10216, 260],
  [45, 260],
  [299, 260]
]);

export const leagueIngestionConfig: readonly LeagueIngestionConfig[] = macheteLeagueCatalog.map((league) => {
  const leagueId = Number(league.fotMobLeagueId);
  const calendarType = tournamentLeagueIds.has(leagueId) ? "tournament" : springAutumnLeagueIds.has(leagueId) ? "spring_autumn" : "autumn_spring";
  const explicitSeasons = calendarType === "tournament" ? tournamentSeasons.get(leagueId) ?? [AUTUMN_SPRING_START_SEASON] : undefined;
  const initialStartSeason =
    calendarType === "autumn_spring"
      ? AUTUMN_SPRING_START_SEASON
      : calendarType === "spring_autumn"
        ? SPRING_AUTUMN_START_SEASON
        : explicitSeasons?.[0] ?? AUTUMN_SPRING_START_SEASON;

  return {
    league_id: leagueId,
    name: league.name,
    calendar_type: calendarType,
    initial_start_season: initialStartSeason,
    enabled: true,
    explicit_seasons: explicitSeasons,
    max_matches: tournamentMaxMatches.get(leagueId) ?? 700,
    max_date_span_days: calendarType === "spring_autumn" ? 400 : calendarType === "tournament" ? 450 : 450
  } satisfies LeagueIngestionConfig;
});

export function enabledLeagueIngestionConfigs() {
  return leagueIngestionConfig.filter((league) => league.enabled);
}

export function scopesForInitialBackfill(configs: readonly LeagueIngestionConfig[] = enabledLeagueIngestionConfigs(), referenceDate = new Date()): IngestionScope[] {
  return configs.flatMap((config) =>
    seasonsForInitialBackfill(config, referenceDate).map((season) =>
      createIngestionScope({
        league_id: config.league_id,
        season,
        include_finished: true,
        include_live: false,
        include_upcoming: false,
        max_matches: config.max_matches,
        force_refresh: false,
        force_reparse: false
      })
    )
  );
}

export function scopesForIncrementalUpdate(configs: readonly LeagueIngestionConfig[] = enabledLeagueIngestionConfigs(), referenceDate = new Date()): IngestionScope[] {
  return configs.flatMap((config) => {
    const seasons = config.calendar_type === "tournament" ? seasonsForInitialBackfill(config, referenceDate) : [seasonForIncrementalUpdate(config, referenceDate)];
    return seasons.map((season) =>
      createIngestionScope({
        league_id: config.league_id,
        season,
        include_finished: true,
        include_live: true,
        include_upcoming: false,
        max_matches: config.max_matches,
        force_refresh: false,
        force_reparse: false
      })
    );
  });
}

export function seasonsForInitialBackfill(config: LeagueIngestionConfig, referenceDate = new Date()): readonly string[] {
  if (config.calendar_type === "autumn_spring") {
    return autumnSpringSeasonRange(AUTUMN_SPRING_START_SEASON, seasonForIncrementalUpdate(config, referenceDate));
  }
  if (config.calendar_type === "spring_autumn") {
    return calendarYearSeasonRange(SPRING_AUTUMN_START_SEASON, seasonForIncrementalUpdate(config, referenceDate));
  }
  return config.explicit_seasons ?? [config.initial_start_season];
}

export function seasonForIncrementalUpdate(config: LeagueIngestionConfig, referenceDate = new Date()) {
  if (config.calendar_type === "tournament") return config.explicit_seasons?.[0] ?? config.initial_start_season;

  const year = referenceDate.getUTCFullYear();
  if (config.calendar_type === "spring_autumn") return String(year);

  const month = referenceDate.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

export function configForLeague(leagueId: number) {
  return leagueIngestionConfig.find((config) => config.league_id === leagueId);
}

function autumnSpringSeasonRange(startSeason: string, endSeason: string) {
  const startYear = seasonStartYear(startSeason);
  const endYear = seasonStartYear(endSeason);
  if (startYear === null || endYear === null || endYear < startYear) return [startSeason];

  const seasons: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    seasons.push(`${year}/${year + 1}`);
  }
  return seasons;
}

function calendarYearSeasonRange(startSeason: string, endSeason: string) {
  const startYear = seasonStartYear(startSeason);
  const endYear = seasonStartYear(endSeason);
  if (startYear === null || endYear === null || endYear < startYear) return [startSeason];

  const seasons: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    seasons.push(String(year));
  }
  return seasons;
}

function seasonStartYear(season: string) {
  const match = season.match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}
