export const defaultSquadTableColumns = [
  "rotationRisk",
  "nextFp",
  "nextFpPerPrice",
  "horizonFp",
  "foontasy",
  "foontasyPerPrice",
  "modelHorizon",
  "alternative",
  "alternativePerPrice",
  "alternativeHorizon",
  "fixtures"
] as const;

export type SquadTableValueFilter = {
  minimum: string;
  maximum: string;
  query: string;
};

export const emptySquadTableValueFilter: SquadTableValueFilter = {
  minimum: "",
  maximum: "",
  query: ""
};

export function squadTableValueMatchesFilter(
  value: string | number | null | undefined,
  filter: SquadTableValueFilter,
  numeric: boolean
) {
  if (numeric) {
    const minimum = parseOptionalNumber(filter.minimum);
    const maximum = parseOptionalNumber(filter.maximum);
    if (minimum === null && maximum === null) return true;
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    return (minimum === null || value >= minimum) && (maximum === null || value <= maximum);
  }

  const query = filter.query.trim().toLocaleLowerCase();
  if (!query) return true;
  return String(value ?? "").toLocaleLowerCase().includes(query);
}

export function squadTableValueFilterIsActive(filter: SquadTableValueFilter, numeric: boolean) {
  return numeric
    ? filter.minimum.trim() !== "" || filter.maximum.trim() !== ""
    : filter.query.trim() !== "";
}

export const staticSquadTableColumnKeys = new Set([
  ...defaultSquadTableColumns,
  "age",
  "nationality",
  "rosterStarter",
  "expectedMinutes",
  "startProbability",
  "sixtyProbability",
  "fullMatchProbability",
  "forecastConfidence",
  "valueScore",
  "recentFp",
  "projectedGoals",
  "projectedAssists",
  "projectedRecoveries",
  "projectedSaves",
  "projectedCleanSheets",
  "projectedGoalsConceded",
  "projectedYellowCards",
  "projectedRedCards",
  "baltikaXg",
  "baltikaXa",
  "baltikaMatches"
]);

const dynamicStatColumnPattern = /^stat:[a-z0-9_]{1,80}$/;
const maximumColumns = 100;
const resizableFixedColumnKeys = new Set(["player", "team", "position", "price", "action"]);
const minimumColumnWidth = 40;
const maximumColumnWidth = 640;
const squadTableColumnsPreferenceVersion = 2;

export function parseSquadTableColumns(value: unknown): string[] {
  const preference = storedSquadTableColumnsPreference(value);
  if (!preference) return [...defaultSquadTableColumns];
  return parseSquadTableColumnList(preference.columns);
}

export function squadTableColumnsPreference(value: unknown) {
  return {
    version: squadTableColumnsPreferenceVersion,
    columns: parseSquadTableColumnList(value)
  };
}

function parseSquadTableColumnList(value: unknown): string[] {
  if (!Array.isArray(value)) return [...defaultSquadTableColumns];
  const columns: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = legacySquadTableColumnKey(item);
    if (!staticSquadTableColumnKeys.has(key) && !dynamicStatColumnPattern.test(key)) continue;
    if (!columns.includes(key)) columns.push(key);
    if (columns.length >= maximumColumns) break;
  }
  return columns;
}

function storedSquadTableColumnsPreference(value: unknown) {
  if (Array.isArray(value)) return { columns: value };
  if (!value || typeof value !== "object") return null;
  const preference = value as { version?: unknown; columns?: unknown };
  if (preference.version !== squadTableColumnsPreferenceVersion || !Array.isArray(preference.columns)) return null;
  return { columns: preference.columns };
}

export function isSquadTableColumnsInput(value: unknown) {
  return Array.isArray(value) && value.length <= maximumColumns && value.every(
    (item) => typeof item === "string" && (staticSquadTableColumnKeys.has(legacySquadTableColumnKey(item)) || dynamicStatColumnPattern.test(item))
  );
}

export function isSquadTableColumnKey(value: unknown): value is string {
  return typeof value === "string" && (staticSquadTableColumnKeys.has(value) || dynamicStatColumnPattern.test(value));
}

export function isSquadTableFilterKey(value: unknown): value is string {
  return typeof value === "string" && (resizableFixedColumnKeys.has(value) || isSquadTableColumnKey(value));
}

export function moveSquadTableColumn(columns: string[], key: string, direction: -1 | 1) {
  const currentIndex = columns.indexOf(key);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= columns.length) return columns;

  const reordered = [...columns];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  return reordered;
}

export function parseSquadTableColumnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const widths: Record<string, number> = {};
  for (const [key, rawWidth] of Object.entries(value)) {
    if (!isResizableColumnKey(key) || typeof rawWidth !== "number" || !Number.isFinite(rawWidth)) continue;
    widths[legacySquadTableColumnKey(key)] = Math.round(Math.min(maximumColumnWidth, Math.max(minimumColumnWidth, rawWidth)));
    if (Object.keys(widths).length >= maximumColumns + resizableFixedColumnKeys.size) break;
  }
  return widths;
}

export function isSquadTableColumnWidthsInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= maximumColumns + resizableFixedColumnKeys.size && entries.every(
    ([key, width]) => isResizableColumnKey(key) && typeof width === "number" && Number.isFinite(width)
  );
}

function isResizableColumnKey(key: string) {
  const normalized = legacySquadTableColumnKey(key);
  return resizableFixedColumnKeys.has(normalized) || staticSquadTableColumnKeys.has(normalized) || dynamicStatColumnPattern.test(normalized);
}

function legacySquadTableColumnKey(key: string) {
  return key === "modelT3" || key === "modelT5" ? "modelHorizon" : key;
}

function parseOptionalNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
