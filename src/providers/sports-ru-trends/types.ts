/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 */
export const SPORTS_TRENDS_PARSER_VERSION = "sports-trends-v1";

export type SportsTrendCategory = "BUYS" | "SELLS" | "OWNERSHIP" | "CAPTAINS" | "OWNERSHIP_DELTA_PP";

export type SportsTrendMetricKind =
  | "reported_count"
  | "reported_popularity_change"
  | "ownership_percent"
  | "ownership_delta_pp";

export type SportsTrendUnit = "players" | "percent" | "pp";

export type SportsTrendPopulationScope = "ALL_MANAGERS" | "TOP_1000_MANAGERS";

export interface SportsTrendArticleEntry {
  rank: number;
  name: string;
  team: string | null;
  position: string | null;
  value: number | null;
  valueText: string | null;
}

export interface SportsTrendArticleSection {
  category: SportsTrendCategory;
  metricKind: SportsTrendMetricKind;
  unit: SportsTrendUnit;
  populationScope: SportsTrendPopulationScope;
  heading: string;
  position: string | null;
  entries: SportsTrendArticleEntry[];
  availableCount: number;
  duplicates: number;
}

export interface SportsTrendArticle {
  canonicalUrl: string;
  title: string;
  publishedAt: string | null;
  roundLabel: string | null;
  tournamentHint: string | null;
  sections: SportsTrendArticleSection[];
}

export const SPORTS_TRENDS_MAX_ENTRIES = 15;
