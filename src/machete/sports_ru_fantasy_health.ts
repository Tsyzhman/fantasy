import type { SportsRuFantasyPriceHealthThresholds, SportsRuFantasySyncScope } from "./sports_ru_fantasy_config";

export type SportsRuFantasyPriceHealthInput = {
  scope: SportsRuFantasySyncScope;
  lastSyncedAt: Date | null;
  priceCount: number;
  mappedCount: number;
  excludedCount?: number;
};

export function evaluateSportsRuFantasyPriceHealth(
  input: SportsRuFantasyPriceHealthInput,
  thresholds: SportsRuFantasyPriceHealthThresholds,
  now = new Date()
) {
  const exactAgeHours = input.lastSyncedAt ? (now.getTime() - input.lastSyncedAt.getTime()) / 3_600_000 : null;
  const ageHours = exactAgeHours === null ? null : round(exactAgeHours);
  const excludedCount = input.excludedCount ?? 0;
  const eligibleCount = input.priceCount - excludedCount;
  const validExclusions = Number.isInteger(excludedCount) && excludedCount >= 0 && eligibleCount >= input.mappedCount;
  const mappedPercent = eligibleCount > 0 ? round((input.mappedCount / eligibleCount) * 100) : 0;
  const healthy =
    validExclusions && exactAgeHours !== null &&
    exactAgeHours >= 0 &&
    exactAgeHours <= thresholds.maximumAgeHours &&
    input.priceCount >= thresholds.minimumPlayers &&
    mappedPercent >= thresholds.minimumMappedPercent;

  return {
    leagueId: String(input.scope.leagueId),
    season: input.scope.season,
    tournamentHru: input.scope.tournamentHru,
    healthy,
    lastSyncedAt: input.lastSyncedAt,
    ageHours,
    priceCount: input.priceCount,
    mappedCount: input.mappedCount,
    excludedCount,
    eligibleCount,
    mappedPercent
  };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
