import { isSquadTableFilterKey, type SquadTableValueFilter } from "@/machete/squad-table-columns";
import { isRetiredFantasyForecastKey } from "@/machete/retired-fantasy-forecasts";

export const maximumSquadFilterPresets = 20;

export type SquadFilterPresetFilters = {
  version: 1;
  query: string;
  teamName: string | null;
  position: "ALL" | "GK" | "DEF" | "MID" | "FWD";
  minimumPrice: number | null;
  maximumPrice: number | null;
  horizon: 3 | 5;
  onlyAffordable: boolean;
  historyScope: "ALL_LOADED" | "ALL_PLAYER_MATCHES";
  advancedFilters: Record<string, SquadTableValueFilter>;
};

export type SquadFilterPreset = {
  id: string;
  name: string;
  filters: SquadFilterPresetFilters;
  createdAt: string;
  updatedAt: string;
};

const positions = new Set(["ALL", "GK", "DEF", "MID", "FWD"]);

export function parseSquadFilterPresetFilters(value: unknown): SquadFilterPresetFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const position = typeof record.position === "string" && positions.has(record.position) ? record.position : null;
  const horizon = record.horizon === 3 || record.horizon === 5 ? record.horizon : null;
  const historyScope = record.historyScope === "ALL_PLAYER_MATCHES" ? "ALL_PLAYER_MATCHES" : record.historyScope === "ALL_LOADED" ? "ALL_LOADED" : null;
  if (!position || !horizon || !historyScope || typeof record.onlyAffordable !== "boolean") return null;

  const query = boundedString(record.query, 120);
  const teamName = record.teamName === null ? null : boundedString(record.teamName, 120);
  const minimumPrice = optionalPrice(record.minimumPrice);
  const maximumPrice = optionalPrice(record.maximumPrice);
  const advancedFilters = parseAdvancedFilters(record.advancedFilters);
  if (query === null || teamName === null && record.teamName !== null || minimumPrice === undefined || maximumPrice === undefined || !advancedFilters) return null;
  if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) return null;

  return {
    version: 1,
    query,
    teamName,
    position: position as SquadFilterPresetFilters["position"],
    minimumPrice,
    maximumPrice,
    horizon,
    onlyAffordable: record.onlyAffordable,
    historyScope,
    advancedFilters
  };
}

function parseAdvancedFilters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 100) return null;
  const result: Record<string, SquadTableValueFilter> = {};
  for (const [key, rawFilter] of entries) {
    if (isRetiredFantasyForecastKey(key)) continue;
    if (!isSquadTableFilterKey(key) || key === "action" || !rawFilter || typeof rawFilter !== "object" || Array.isArray(rawFilter)) return null;
    const filter = rawFilter as Record<string, unknown>;
    const minimum = boundedString(filter.minimum, 40);
    const maximum = boundedString(filter.maximum, 40);
    const query = boundedString(filter.query, 120);
    if (minimum === null || maximum === null || query === null) return null;
    result[key] = { minimum, maximum, query };
  }
  return result;
}

function boundedString(value: unknown, maximumLength: number) {
  return typeof value === "string" && value.length <= maximumLength ? value : null;
}

function optionalPrice(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000 ? value : undefined;
}
