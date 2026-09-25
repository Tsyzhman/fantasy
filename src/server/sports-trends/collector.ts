import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { fetchSportsTrendsHtml } from "@/providers/sports-ru-trends/fetch";
import { discoverSportsTrendArticleLinks, parseSportsTrendArticle } from "@/providers/sports-ru-trends/parser";
import { SPORTS_TRENDS_PARSER_VERSION, type SportsTrendArticle } from "@/providers/sports-ru-trends/types";
import {
  SPORTS_TRENDS_ARTICLE_RETENTION_DAYS,
  SPORTS_TRENDS_EVIDENCE_RETENTION_DAYS,
  SPORTS_TRENDS_FEED_CACHE_MS,
  SPORTS_TRENDS_MAX_ARTICLES_PER_CYCLE,
  SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS,
  sportsTrendsConfiguredArticleUrls,
  sportsTrendsDiscoveryUrls
} from "./config";
import { planSportsTrendsCycle } from "./planner";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 */

const TOURNAMENT_KEYWORDS: Record<string, string[]> = {
  "ЧМ": ["чемпионат мира", "чм"],
  "Лига чемпионов": ["лига чемпионов", "лч"],
  "Лига Европы": ["лига европы", "ле"],
  "АПЛ": ["англия", "апл", "премьер лига"],
  "Чемпионшип": ["чемпионшип"],
  "Серия А": ["серия а", "италия"],
  "Бундеслига": ["бундеслига", "германия"],
  "Ла Лига": ["ла лига", "испания"],
  "Лига 1": ["лига 1", "франция"],
  "РПЛ": ["россия", "рпл"],
  "КХЛ": ["кхл"]
};

interface FeedCacheEntry {
  expiresAt: number;
  links: string[];
}

export interface SportsTrendContestCandidate {
  id: string;
  name: string;
  season: string;
}

export interface SportsTrendsCollectionOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  articleUrls?: string[];
  discoveryUrls?: string[];
  maxArticles?: number;
  feedCache?: Map<string, FeedCacheEntry>;
}

export interface SportsTrendsCollectionResult {
  skipped: boolean;
  discovered: number;
  planned: number;
  fetched: number;
  unchanged: number;
  parsed: number;
  unmapped: number;
  failed: number;
  entries: number;
}

const feedCache: Map<string, FeedCacheEntry> = new Map();
let collectorRunning = false;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#data
 */
export function matchSportsTrendContest(
  hint: string | null,
  candidates: SportsTrendContestCandidate[]
): SportsTrendContestCandidate | null {
  if (!hint) return null;
  const keywords = TOURNAMENT_KEYWORDS[hint] ?? [normalizeName(hint)];
  const matches = candidates.filter((candidate) => {
    const name = normalizeName(candidate.name);
    if (!name) return false;
    return keywords.some((keyword) => name.includes(keyword) || keyword.includes(name));
  });
  return matches.length === 1 ? matches[0]! : null;
}

async function discoveredArticleUrls(options: SportsTrendsCollectionOptions): Promise<string[]> {
  const now = options.now?.() ?? new Date();
  const cache = options.feedCache ?? feedCache;
  const links = new Set<string>(options.articleUrls ?? sportsTrendsConfiguredArticleUrls());
  for (const discoveryUrl of options.discoveryUrls ?? sportsTrendsDiscoveryUrls()) {
    const cached = cache.get(discoveryUrl);
    if (cached && cached.expiresAt > now.getTime()) {
      for (const link of cached.links) links.add(link);
      continue;
    }
    try {
      const result = await fetchSportsTrendsHtml(discoveryUrl, { fetchImpl: options.fetchImpl, now: options.now });
      const discovered = discoverSportsTrendArticleLinks(result.html, discoveryUrl).map((link) => link.url);
      cache.set(discoveryUrl, { expiresAt: now.getTime() + SPORTS_TRENDS_FEED_CACHE_MS, links: discovered });
      for (const link of discovered) links.add(link);
    } catch {
      continue;
    }
  }
  return [...links];
}

interface ArticleResolution {
  contestId: string | null;
  season: string | null;
  providerRoundId: string | null;
  roundOrdinal: number | null;
  status: "READY" | "UNMAPPED_CONTEST" | "UNMAPPED_ROUND" | "UNPROVEN_ROUND";
}

async function resolveArticleTarget(
  prisma: PrismaClient,
  article: SportsTrendArticle,
  candidates: SportsTrendContestCandidate[],
  fallbackSeason: string | null
): Promise<ArticleResolution> {
  const contest = matchSportsTrendContest(article.tournamentHint, candidates);
  if (!contest) {
    return { contestId: null, season: fallbackSeason, providerRoundId: null, roundOrdinal: null, status: "UNMAPPED_CONTEST" };
  }
  if (!article.roundLabel || !/^\d+$/.test(article.roundLabel)) {
    return { contestId: contest.id, season: contest.season, providerRoundId: null, roundOrdinal: null, status: "UNPROVEN_ROUND" };
  }
  const roundOrdinal = Number(article.roundLabel);
  const round = await prisma.fantasyProviderRound.findFirst({
    where: { contestId: contest.id, ordinal: roundOrdinal },
    select: { providerRoundId: true, ordinal: true }
  });
  if (!round) {
    return { contestId: contest.id, season: contest.season, providerRoundId: null, roundOrdinal, status: "UNMAPPED_ROUND" };
  }
  return { contestId: contest.id, season: contest.season, providerRoundId: round.providerRoundId, roundOrdinal: round.ordinal, status: "READY" };
}

async function persistParsedArticle(
  prisma: PrismaClient,
  input: {
    canonicalUrl: string;
    title: string | null;
    html: string;
    fetchedAt: Date;
    contentHash: string;
    article: SportsTrendArticle;
    resolution: ArticleResolution;
  }
): Promise<number> {
  const { article, resolution } = input;
  const parseStatus = article.sections.length > 0 ? "PARSED" : "EMPTY";
  let entryCount = 0;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.sportsTrendSource.findUnique({ where: { canonicalUrl: input.canonicalUrl } });
    const revision = (existing?.revision ?? 0) + 1;
    const sourceData = {
      title: input.title,
      sourcePublishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
      fetchedAt: input.fetchedAt,
      contentHash: input.contentHash,
      parserVersion: SPORTS_TRENDS_PARSER_VERSION,
      parseStatus,
      parseError: null,
      sourceRoundLabel: article.roundLabel,
      revision
    };
    const source = existing
      ? await tx.sportsTrendSource.update({ where: { id: existing.id }, data: sourceData })
      : await tx.sportsTrendSource.create({ data: { canonicalUrl: input.canonicalUrl, ...sourceData } });
    const observedAt = input.fetchedAt;
    for (const section of article.sections) {
      const snapshot = await tx.sportsTrendSnapshot.create({
        data: {
          contestId: resolution.contestId,
          season: resolution.season ?? "UNKNOWN",
          providerRoundId: resolution.providerRoundId,
          roundOrdinal: resolution.roundOrdinal,
          category: section.category,
          metricKind: section.metricKind,
          unit: section.unit,
          populationScope: section.populationScope,
          sectionKey: section.position ?? "",
          sourceId: source.id,
          revision,
          status: resolution.status,
          statusReason: resolution.status === "READY" ? null : `article target: ${resolution.status}`,
          sourceEntryCount: section.availableCount,
          observedAt,
          sourcePublishedAt: article.publishedAt ? new Date(article.publishedAt) : null
        }
      });
      await tx.sportsTrendEntry.createMany({
        data: section.entries.map((entry) => ({
          snapshotId: snapshot.id,
          sourceRank: entry.rank,
          providerPlayerId: null,
          playerId: null,
          sourceName: entry.name,
          sourceTeam: entry.team,
          sourcePosition: entry.position,
          value: entry.value,
          valueText: entry.valueText
        }))
      });
      entryCount += section.entries.length;
    }
  });
  return entryCount;
}

async function pruneSportsTrends(prisma: PrismaClient, now: Date): Promise<number> {
  const articleCutoff = new Date(now.getTime() - SPORTS_TRENDS_ARTICLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const evidenceCutoff = new Date(now.getTime() - SPORTS_TRENDS_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.sportsTrendSource.deleteMany({
    where: {
      OR: [
        { parseStatus: "PARSED", fetchedAt: { lt: articleCutoff } },
        { parseStatus: { in: ["FAILED", "EMPTY", "PENDING"] }, fetchedAt: { lt: evidenceCutoff } }
      ]
    }
  });
  return result.count;
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 */
export async function collectSportsTrends(
  prisma: PrismaClient,
  options: SportsTrendsCollectionOptions = {}
): Promise<SportsTrendsCollectionResult> {
  const empty: SportsTrendsCollectionResult = {
    skipped: true,
    discovered: 0,
    planned: 0,
    fetched: 0,
    unchanged: 0,
    parsed: 0,
    unmapped: 0,
    failed: 0,
    entries: 0
  };
  if (collectorRunning) return empty;
  collectorRunning = true;
  try {
    const now = options.now?.() ?? new Date();
    const urls = await discoveredArticleUrls(options);
    const existing = await prisma.sportsTrendSource.findMany({
      where: { canonicalUrl: { in: urls } },
      select: { canonicalUrl: true, fetchedAt: true }
    });
    const plan = planSportsTrendsCycle({
      discovered: urls,
      existing,
      now,
      refreshAfterMs: SPORTS_TRENDS_FEED_CACHE_MS,
      maxArticles: options.maxArticles ?? SPORTS_TRENDS_MAX_ARTICLES_PER_CYCLE
    });
    const candidates = await prisma.fantasyContest.findMany({
      where: { scheduleSyncedAt: { not: null } },
      select: { id: true, name: true, season: true },
      orderBy: { scheduleSyncedAt: "desc" },
      take: SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS
    });
    const fallbackSeason = candidates[0]?.season ?? null;
    const result: SportsTrendsCollectionResult = {
      skipped: false,
      discovered: urls.length,
      planned: plan.toFetch.length,
      fetched: 0,
      unchanged: 0,
      parsed: 0,
      unmapped: 0,
      failed: 0,
      entries: 0
    };
    for (const url of plan.toFetch) {
      try {
        const fetched = await fetchSportsTrendsHtml(url, { fetchImpl: options.fetchImpl, now: options.now });
        result.fetched += 1;
        const previous = await prisma.sportsTrendSource.findUnique({ where: { canonicalUrl: url }, select: { id: true, contentHash: true } });
        if (previous && previous.contentHash === fetched.contentHash) {
          await prisma.sportsTrendSource.update({ where: { id: previous.id }, data: { fetchedAt: fetched.fetchedAt } });
          result.unchanged += 1;
          continue;
        }
        const article = parseSportsTrendArticle(fetched.html, { url });
        const resolution = await resolveArticleTarget(prisma, article, candidates, fallbackSeason);
        result.entries += await persistParsedArticle(prisma, {
          canonicalUrl: url,
          title: article.title || null,
          html: fetched.html,
          fetchedAt: fetched.fetchedAt,
          contentHash: fetched.contentHash,
          article,
          resolution
        });
        result.parsed += 1;
        if (resolution.status !== "READY") result.unmapped += 1;
      } catch (error) {
        result.failed += 1;
        await prisma.sportsTrendSource
          .upsert({
            where: { canonicalUrl: url },
            create: {
              canonicalUrl: url,
              fetchedAt: now,
              contentHash: createHash("sha256").update(url).digest("hex"),
              parserVersion: SPORTS_TRENDS_PARSER_VERSION,
              parseStatus: "FAILED",
              parseError: error instanceof Error ? error.message.slice(0, 500) : "unknown error"
            },
            update: {
              parseStatus: "FAILED",
              parseError: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
              fetchedAt: now
            }
          })
          .catch(() => undefined);
      }
    }
    await pruneSportsTrends(prisma, now).catch(() => 0);
    return result;
  } finally {
    collectorRunning = false;
  }
}
