/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 */
export interface SportsTrendExistingSource {
  canonicalUrl: string;
  fetchedAt: Date;
}

export interface SportsTrendCyclePlan {
  toFetch: string[];
  skippedFresh: number;
  duplicates: number;
  overflow: number;
}

export function planSportsTrendsCycle(input: {
  discovered: string[];
  existing: SportsTrendExistingSource[];
  now: Date;
  refreshAfterMs: number;
  maxArticles: number;
}): SportsTrendCyclePlan {
  const freshCutoff = input.now.getTime() - input.refreshAfterMs;
  const freshUrls = new Set(input.existing.filter((source) => source.fetchedAt.getTime() > freshCutoff).map((source) => source.canonicalUrl));
  const seen = new Set<string>();
  const toFetch: string[] = [];
  let duplicates = 0;
  let skippedFresh = 0;
  let overflow = 0;
  for (const url of input.discovered) {
    if (seen.has(url)) {
      duplicates += 1;
      continue;
    }
    seen.add(url);
    if (freshUrls.has(url)) {
      skippedFresh += 1;
      continue;
    }
    if (toFetch.length >= input.maxArticles) {
      overflow += 1;
      continue;
    }
    toFetch.push(url);
  }
  return { toFetch, skippedFresh, duplicates, overflow };
}
