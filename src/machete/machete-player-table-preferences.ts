import { isRetiredFantasyForecastKey } from "./retired-fantasy-forecasts";

export const machetePlayerTableSettingsSource = "machete-table-settings" as const;
export const machetePlayerTableFiltersSource = "machete-table-filters" as const;
export const maximumMachetePlayerFilterPresets = 20;

export type MachetePlayerTableValueFilter = {
  min: string;
  max: string;
  query: string;
};

export type MachetePlayerTableSettings = {
  version: 3;
  columns: string[];
  widths: Record<string, number>;
  horizon: 3 | 5 | 10;
};

export type MachetePlayerFilterPresetValue = {
  version: 1;
  filters: Record<string, MachetePlayerTableValueFilter>;
};

const staticColumnKeys = new Set([
  "player", "team", "position", "price", "fantasyScore", "scoringScore", "alternativeScore",
  "expectedMinutes", "startProbability", "forecastConfidence", "minutesDeviation", "matchesPlayed",
  "minutesPlayed", "goals", "assists", "shotsOnTarget", "keyPasses", "tackles", "averageRating",
  "age", "nationality", "leagueName", "form", "predictedFp", "forecastHorizonFp",
  "predictedFpPerPrice", "foontasy", "foontasyPerPrice", "alternativePredictedFp",
  "alternativePredictedFpPerPrice", "alternativeForecastHorizon",
  "fixtures"
]);
const rawColumnPattern = /^raw:[a-z0-9_.-]{1,120}$/i;
const maximumColumns = 120;
const minimumWidth = 44;
const maximumWidth = 640;
const forecastColumnKeys = [
  "predictedFp",
  "predictedFpPerPrice",
  "forecastHorizonFp",
  "foontasy",
  "foontasyPerPrice",
  "alternativePredictedFp",
  "alternativePredictedFpPerPrice",
  "alternativeForecastHorizon",
  "fixtures"
];

export function parseMachetePlayerTableSettings(value: unknown): MachetePlayerTableSettings | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) || !Array.isArray(value.columns) || !isRecord(value.widths)) return null;
  if (value.columns.length > maximumColumns) return null;

  const columns: string[] = [];
  for (const key of value.columns) {
    if (isRetiredFantasyForecastKey(key)) continue;
    if (!isColumnKey(key)) return null;
    if (!columns.includes(key)) columns.push(key);
  }

  const widthEntries = Object.entries(value.widths);
  if (widthEntries.length > maximumColumns) return null;
  const widths: Record<string, number> = {};
  for (const [key, width] of widthEntries) {
    if (isRetiredFantasyForecastKey(key)) continue;
    if (!isColumnKey(key) || typeof width !== "number" || !Number.isFinite(width)) return null;
    widths[key] = Math.round(Math.min(maximumWidth, Math.max(minimumWidth, width)));
  }

  const migratedColumns = value.version === 1
    ? [...forecastColumnKeys, ...columns.filter((key) => !forecastColumnKeys.includes(key))]
    : columns;
  const horizon = value.horizon === 3 || value.horizon === 10 ? value.horizon : 5;
  return { version: 3, columns: migratedColumns, widths, horizon };
}

export function parseMachetePlayerFilterPresetValue(value: unknown): MachetePlayerFilterPresetValue | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.filters)) return null;
  const entries = Object.entries(value.filters);
  if (entries.length > maximumColumns) return null;
  const filters: Record<string, MachetePlayerTableValueFilter> = {};
  for (const [key, rawFilter] of entries) {
    if (isRetiredFantasyForecastKey(key)) continue;
    if (!isColumnKey(key) || !isRecord(rawFilter)) return null;
    const min = boundedString(rawFilter.min, 40);
    const max = boundedString(rawFilter.max, 40);
    const query = boundedString(rawFilter.query, 120);
    if (min === null || max === null || query === null) return null;
    filters[key] = { min, max, query };
  }
  return { version: 1, filters };
}

function isColumnKey(value: unknown): value is string {
  return typeof value === "string" && (staticColumnKeys.has(value) || rawColumnPattern.test(value));
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
