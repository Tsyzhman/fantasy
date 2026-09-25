import { parse as parseHtml } from "node-html-parser";
import {
  SPORTS_TRENDS_MAX_ENTRIES,
  SPORTS_TRENDS_PARSER_VERSION,
  type SportsTrendArticle,
  type SportsTrendArticleEntry,
  type SportsTrendArticleSection,
  type SportsTrendCategory,
  type SportsTrendMetricKind,
  type SportsTrendPopulationScope,
  type SportsTrendUnit
} from "./types";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 */
export { SPORTS_TRENDS_PARSER_VERSION };

const POSITION_TOKENS: Array<[RegExp, string]> = [
  [/^вр$|^вратарь$|^вратар/i, "GK"],
  [/^зщ$|^защитник/i, "DEF"],
  [/^пз$|^полузащитник/i, "MID"],
  [/^нп$|^нападающ/i, "FWD"]
];

const TOURNAMENT_ALIASES: Array<[RegExp, string]> = [
  [/чемпионат[а-я]* мира|ЧМ(?![а-яё])/i, "ЧМ"],
  [/лиг[аи] чемпионов|ЛЧ(?![а-яё])/i, "Лига чемпионов"],
  [/лиг[аи] европы|ЛЕ(?![а-яё])/i, "Лига Европы"],
  [/чемпионшип/i, "Чемпионшип"],
  [/английск[а-я]* премьер|АПЛ(?![а-яё])/i, "АПЛ"],
  [/сери[ия] а(?![а-яё])/i, "Серия А"],
  [/бундеслиг/i, "Бундеслига"],
  [/ла лиг/i, "Ла Лига"],
  [/лиг[аи] 1(?![0-9])|французск[а-я]* лиг/i, "Лига 1"],
  [/российск[а-я]* премьер|РПЛ(?![а-яё])/i, "РПЛ"],
  [/КХЛ(?![а-яё])/i, "КХЛ"]
];

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseDecimal(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const normalized = raw.replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.+;-]/g, "").replace(";", ".");
  if (!/[0-9]/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizePositionToken(raw: string | null | undefined): string | null {
  const token = compact(raw).toLowerCase().replace(/[.,]/g, "");
  if (!token) return null;
  for (const [pattern, position] of POSITION_TOKENS) {
    if (pattern.test(token)) return position;
  }
  return null;
}

function positionFromHeading(heading: string): string | null {
  const lower = heading.toLowerCase();
  if (/вратар/.test(lower)) return "GK";
  if (/полузащитник/.test(lower)) return "MID";
  if (/защитник/.test(lower)) return "DEF";
  if (/нападающ/.test(lower)) return "FWD";
  return null;
}

function detectCategory(heading: string): { category: SportsTrendCategory; metricKind: SportsTrendMetricKind; unit: SportsTrendUnit } | null {
  const lower = heading.toLowerCase();
  if (/капитан/.test(lower) && /популярн|процент|выбор|взяли|купили/.test(lower)) {
    return { category: "CAPTAINS", metricKind: "ownership_percent", unit: "percent" };
  }
  if (/популярн|процент[а-я]* выбора|выбрали|взяли|купили|состав[а-я]*/.test(lower)) {
    return { category: "OWNERSHIP", metricKind: "ownership_percent", unit: "percent" };
  }
  if (/покуп/.test(lower)) {
    return { category: "BUYS", metricKind: "reported_popularity_change", unit: "percent" };
  }
  if (/прода/.test(lower)) {
    return { category: "SELLS", metricKind: "reported_popularity_change", unit: "percent" };
  }
  return null;
}

function detectPopulationScope(text: string): SportsTrendPopulationScope {
  if (/1000\s*(?:первых\s*)?команд|перв(?:ой|ых)\s*1000|топ-?1000/i.test(text)) return "TOP_1000_MANAGERS";
  return "ALL_MANAGERS";
}

function matchNumberedSigned(text: string): SportsTrendArticleEntry | null {
  const match = text.match(/^(\d+)\)\s+(.+?),\s*([^,]+),\s*(.+?)\s*([+-]\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  const name = compact(match[2]);
  if (!name) return null;
  return {
    rank: Number(match[1]),
    name,
    team: compact(match[4]) || null,
    position: normalizePositionToken(match[3]),
    value: parseDecimal(match[5]),
    valueText: `${compact(match[5])}%`
  };
}

function matchNumberedOwnership(text: string): SportsTrendArticleEntry | null {
  const withTeam = text.match(/^(\d+)[.)]\s+(.+?),\s*(?:(вр|зщ|пз|нп),\s*)?«([^»]+)»\s*(?:\(([\d.,]+)\))?\s*[–—-]\s*([\d.,]+)\s*%/i);
  if (withTeam) {
    const name = compact(withTeam[2]);
    if (!name) return null;
    return {
      rank: Number(withTeam[1]),
      name,
      team: compact(withTeam[4]) || null,
      position: normalizePositionToken(withTeam[3]),
      value: parseDecimal(withTeam[6]),
      valueText: `${compact(withTeam[6])}%`
    };
  }
  const plain = text.match(/^(\d+)[.)]\s+(.+?)(?:,\s*(вр|зщ|пз|нп))?\s*[–—-]\s*([\d.,]+)\s*%/i);
  if (plain) {
    const name = compact(plain[2]);
    if (!name) return null;
    return {
      rank: Number(plain[1]),
      name,
      team: null,
      position: normalizePositionToken(plain[3]),
      value: parseDecimal(plain[4]),
      valueText: `${compact(plain[4])}%`
    };
  }
  return null;
}

function matchExtraOwnership(text: string): SportsTrendArticleEntry | null {
  const match = text.match(/^\+\s+(.+?),\s*«([^»]+)»\s*(?:\(([\d.,]+)\))?\s*[–—-]\s*([\d.,]+)\s*%/);
  if (!match) return null;
  const name = compact(match[1]);
  if (!name) return null;
  return {
    rank: 0,
    name,
    team: compact(match[2]) || null,
    position: null,
    value: parseDecimal(match[4]),
    valueText: `${compact(match[4])}%`
  };
}

function extractRoundLabel(text: string): string | null {
  const patterns = [/(\d+)-[мй]\s*туром/i, /(\d+)-го\s+тура/i, /перед\s+(\d+)\s*туром/i, /дедлайн\s+(\d+)-?го\s+тура/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractTournamentHint(text: string): string | null {
  for (const [pattern, alias] of TOURNAMENT_ALIASES) {
    if (pattern.test(text)) return alias;
  }
  return null;
}

function readJsonLd(html: string, fallbackUrl: string, fallbackTitle: string) {
  const root = parseHtml(html);
  let canonicalUrl = fallbackUrl;
  let title = fallbackTitle;
  let publishedAt: string | null = null;
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed: unknown = JSON.parse(script.rawText);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const record = node as Record<string, unknown>;
        if (record["@type"] !== "NewsArticle" && record["@type"] !== "Article") continue;
        const url = typeof record.url === "string" ? record.url : typeof record.mainEntityOfPage === "string" ? record.mainEntityOfPage : null;
        if (url) canonicalUrl = url;
        if (typeof record.headline === "string" && record.headline.trim()) title = record.headline.trim();
        if (typeof record.datePublished === "string") publishedAt = record.datePublished;
      }
    } catch {
      continue;
    }
  }
  return { root, canonicalUrl, title, publishedAt };
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#acceptance
 */
export function parseSportsTrendArticle(html: string, input: { url: string; title?: string }): SportsTrendArticle {
  const h1 = compact(parseHtml(html).querySelector("h1")?.textContent ?? "");
  const { root, canonicalUrl, title, publishedAt } = readJsonLd(html, input.url, input.title ?? h1);
  const scope = detectPopulationScope(`${title} ${h1}`);
  const bodyText = compact(root.querySelector(".news-content, article, main")?.textContent ?? root.textContent ?? "");
  const roundLabel = extractRoundLabel(`${title} ${bodyText}`);
  const tournamentHint = extractTournamentHint(`${title} ${bodyText}`);

  const sections: SportsTrendArticleSection[] = [];
  const indexByKey = new Map<string, number>();
  let current: SportsTrendArticleSection | null = null;
  const nextExtraRank = new Map<SportsTrendArticleSection, number>();

  const blocks = root.querySelectorAll(".news-content p, .news-content li, article p, article li, p, li");
  const seenKeys = new Set<string>();
  for (const block of blocks) {
    const outer = block.outerHTML ?? "";
    const dedupeKey = `${block.tagName}:${outer.slice(0, 120)}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    const text = compact(block.textContent);
    if (!text) continue;

    const heading = detectCategory(text);
    if (heading && !/\d/.test(text.slice(0, 3))) {
      const position = positionFromHeading(text);
      const key = `${heading.category}:${position ?? ""}:${heading.metricKind}`;
      const existing = indexByKey.get(key);
      if (existing != null) {
        current = sections[existing]!;
      } else {
        current = {
          category: heading.category,
          metricKind: heading.metricKind,
          unit: heading.unit,
          populationScope: scope,
          heading: text,
          position,
          entries: [],
          availableCount: 0,
          duplicates: 0
        };
        indexByKey.set(key, sections.length);
        sections.push(current);
      }
      continue;
    }

    if (!current) continue;
    let entry: SportsTrendArticleEntry | null = null;
    if (current.metricKind === "reported_popularity_change") {
      entry = matchNumberedSigned(text);
    } else {
      entry = matchNumberedOwnership(text) ?? matchExtraOwnership(text);
    }
    if (!entry) continue;

    current.availableCount += 1;
    const nameKey = entry.name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
    const alreadySeen = current.entries.some((existingEntry) => existingEntry.name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ") === nameKey);
    if (alreadySeen) {
      current.duplicates += 1;
      continue;
    }
    if (current.entries.length >= SPORTS_TRENDS_MAX_ENTRIES) continue;
    if (entry.rank === 0) {
      const rank = nextExtraRank.get(current) ?? current.entries.length + 1;
      nextExtraRank.set(current, rank + 1);
      entry = { ...entry, rank };
    }
    current.entries.push(entry);
  }

  const populated = sections.filter((section) => section.entries.length > 0);
  return {
    canonicalUrl,
    title,
    publishedAt,
    roundLabel,
    tournamentHint,
    sections: populated.map((section) => ({
      ...section,
      entries: section.entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
    }))
  };
}

export interface SportsTrendFeedLink {
  url: string;
  title: string | null;
  publishedAt: string | null;
}

function normalizeSportsArticleUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.host !== "www.sports.ru" && url.host !== "sports.ru" && url.host !== "m.sports.ru") return null;
    if (!/^\/[a-z-]+\/\d{5,}-[^/]+\.html$/.test(url.pathname)) return null;
    if (url.host === "m.sports.ru") url.host = "www.sports.ru";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 */
export function discoverSportsTrendArticleLinks(html: string, baseUrl: string): SportsTrendFeedLink[] {
  const root = parseHtml(html);
  const links: SportsTrendFeedLink[] = [];
  const seen = new Set<string>();
  for (const mark of root.querySelectorAll(".fantasy")) {
    let node = mark.parentNode as unknown as {
      parentNode: unknown;
      querySelectorAll?: (selector: string) => Array<{ getAttribute: (name: string) => string | undefined; textContent: string }>;
    } | null;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      const anchors = node.querySelectorAll?.("a[href]") ?? [];
      let found = false;
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") ?? "";
        const url = normalizeSportsArticleUrl(href, baseUrl);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const title = compact(anchor.getAttribute("title") ?? anchor.textContent) || null;
        links.push({ url, title, publishedAt: null });
        found = true;
      }
      if (found) break;
      node = node.parentNode as never;
    }
  }
  return links;
}
