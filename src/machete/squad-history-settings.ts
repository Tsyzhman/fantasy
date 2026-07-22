export const fantasyHistoryScopes = ["ALL_LOADED", "ALL_PLAYER_MATCHES", "SAME_COUNTRY_CLUB", "SELECTED_COMPETITION", "SELECTED_PLUS_UEFA"] as const;
export type FantasyHistoryScope = (typeof fantasyHistoryScopes)[number];

export const fantasyHistoryWindows = ["LAST_5", "SELECTED_SEASONS", "ALL_LOADED"] as const;
export type FantasyHistoryWindow = (typeof fantasyHistoryWindows)[number];

export type FantasyHistorySettings = {
  scope: FantasyHistoryScope;
  window: FantasyHistoryWindow;
  selectedSeasons: string[];
};

export const defaultFantasyHistorySettings: FantasyHistorySettings = {
  scope: "ALL_LOADED",
  window: "LAST_5",
  selectedSeasons: []
};

type HistorySettingsInput = {
  historyScope?: unknown;
  historyWindow?: unknown;
  historySeason?: unknown;
};

export function parseFantasyHistorySettings(input: HistorySettingsInput): FantasyHistorySettings {
  const rawScope = firstString(input.historyScope);
  const rawWindow = firstString(input.historyWindow);
  const scope = fantasyHistoryScopes.includes(rawScope as FantasyHistoryScope)
    ? rawScope as FantasyHistoryScope
    : defaultFantasyHistorySettings.scope;
  const requestedWindow = fantasyHistoryWindows.includes(rawWindow as FantasyHistoryWindow)
    ? rawWindow as FantasyHistoryWindow
    : defaultFantasyHistorySettings.window;
  const selectedSeasons = uniqueStrings(stringValues(input.historySeason).filter(validSeasonLabel)).sort(compareFantasySeasonLabels);
  const window = requestedWindow === "SELECTED_SEASONS" && selectedSeasons.length === 0 ? "LAST_5" : requestedWindow;
  return { scope, window, selectedSeasons: window === "SELECTED_SEASONS" ? selectedSeasons : [] };
}

export function fantasyHistorySettingsKey(settings: FantasyHistorySettings) {
  return `${settings.scope}:${settings.window}:${settings.selectedSeasons.join("|") || "-"}`;
}

export function applyFantasyHistorySearchParams(params: URLSearchParams, settings: FantasyHistorySettings) {
  params.set("historyScope", settings.scope);
  params.set("historyWindow", settings.window);
  params.delete("historySeason");
  for (const season of settings.selectedSeasons) params.append("historySeason", season);
  return params;
}

export function compareFantasySeasonLabels(left: string, right: string) {
  return seasonRank(right) - seasonRank(left) || right.localeCompare(left);
}

function seasonRank(season: string) {
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

function firstString(value: unknown) {
  return stringValues(value)[0] ?? "";
}

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return typeof value === "string" ? [value.trim()] : [];
}

function validSeasonLabel(value: string) {
  return value.length > 0 && value.length <= 32 && /^[\p{L}\p{N}][\p{L}\p{N} ./_-]*$/u.test(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
