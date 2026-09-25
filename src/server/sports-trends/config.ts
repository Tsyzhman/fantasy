/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 */
export const SPORTS_TRENDS_DEFAULT_DISCOVERY_URL = "https://www.sports.ru/fantasy-sports/news/";
export const SPORTS_TRENDS_MAX_ARTICLES_PER_CYCLE = 20;
export const SPORTS_TRENDS_FEED_CACHE_MS = 30 * 60 * 1000;
export const SPORTS_TRENDS_DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
export const SPORTS_TRENDS_ARTICLE_RETENTION_DAYS = 90;
export const SPORTS_TRENDS_EVIDENCE_RETENTION_DAYS = 7;
export const SPORTS_TRENDS_OWNERSHIP_HISTORY_DAYS = 30;
export const SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS = 50;

export function sportsTrendsEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.SPORTS_TRENDS_SYNC_ENABLED === "true";
}

function listFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function sportsTrendsDiscoveryUrls(environment: NodeJS.ProcessEnv = process.env): string[] {
  const configured = listFromEnv(environment.SPORTS_RU_TRENDS_DISCOVERY_URLS);
  return configured.length > 0 ? configured : [SPORTS_TRENDS_DEFAULT_DISCOVERY_URL];
}

export function sportsTrendsConfiguredArticleUrls(environment: NodeJS.ProcessEnv = process.env): string[] {
  return listFromEnv(environment.SPORTS_TRENDS_ARTICLE_URLS);
}

export function sportsTrendsIntervalMs(environment: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(environment.SPORTS_TRENDS_INTERVAL_MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) return SPORTS_TRENDS_DEFAULT_INTERVAL_MS;
  return Math.max(5 * 60 * 1000, Math.min(6 * 60 * 60 * 1000, minutes * 60 * 1000));
}
