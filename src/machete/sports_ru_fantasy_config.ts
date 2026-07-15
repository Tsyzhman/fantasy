export type SportsRuFantasySyncScope = {
  leagueId: bigint;
  season: string;
  tournamentHru: string;
};

export type SportsRuFantasyPriceHealthThresholds = {
  maximumAgeHours: number;
  minimumPlayers: number;
  minimumMappedPercent: number;
};

export function parseSportsRuFantasySyncScopes(value: string): SportsRuFantasySyncScope[] {
  if (!value.trim()) return [];
  return value
    .split(/[;,]/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .map((scope) => {
      const match = /^(\d+):([^:]+):([a-z0-9-]+)$/i.exec(scope);
      if (!match) throw new Error(`Invalid Sports.ru fantasy sync scope: ${scope}. Expected <league-id>:<season>:<tournament-hru>.`);
      return { leagueId: BigInt(match[1]), season: match[2].trim(), tournamentHru: match[3].trim() };
    });
}

export function sportsRuFantasyPriceHealthThresholds(
  environment: Record<string, string | undefined> = process.env
): SportsRuFantasyPriceHealthThresholds {
  return {
    maximumAgeHours: positiveNumber(environment.SPORTS_RU_FANTASY_MAXIMUM_AGE_HOURS, 7),
    minimumPlayers: positiveInteger(environment.SPORTS_RU_FANTASY_MINIMUM_PLAYERS, 100),
    minimumMappedPercent: nonNegativePercent(environment.SPORTS_RU_FANTASY_MINIMUM_MAPPED_PERCENT, 98)
  };
}

export function sportsRuFantasySyncIntervalMilliseconds(value: string | undefined, fallbackHours = 6) {
  const configured = Number(value ?? fallbackHours);
  const hours = Number.isFinite(configured) && configured >= 1 && configured <= 24 ? configured : fallbackHours;
  return hours * 60 * 60 * 1000;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativePercent(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
}
