import { normalizeName } from "@/lib/text";

export type SportsRuFantasyTournamentLink = {
  name: string;
  href: string;
  deadline: string | null;
  members: number | null;
};

export type SportsRuFantasyContestRules = {
  name: string;
  budgetLimit: number;
  squadSize: number;
  maxPlayersPerTeam: number | null;
};

export type SportsRuFantasyPriceRow = {
  playerName: string;
  normalizedName: string;
  position: string | null;
  price: number;
  raw: Record<string, unknown>;
};

const defaultBudget = 100;
const defaultSquadSize = 15;

export function parseSportsRuFantasyTournamentLinks(html: string, baseUrl = "https://www.sports.ru"): SportsRuFantasyTournamentLink[] {
  const links: SportsRuFantasyTournamentLink[] = [];
  const cardRegex = /<a\b[^>]*class="[^"]*\btournament-card\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html))) {
    const [, rawHref, body] = match;
    const name = textFromFirstClass(body, "tournament-card__name");
    if (!name) continue;
    links.push({
      name,
      href: absoluteUrl(htmlDecode(rawHref), baseUrl),
      deadline: textFromFirstClass(body, "tournament-card__deadline-date"),
      members: parseMembers(textFromFirstClass(body, "tournament-card__members"))
    });
  }

  return uniqueBy(links, (link) => link.href);
}

export function parseSportsRuFantasyTournament(html: string): {
  contest: SportsRuFantasyContestRules;
  prices: SportsRuFantasyPriceRow[];
} {
  const name = cleanText(textBetween(html, /<h1[^>]*>/i, /<\/h1>/i) || textFromTitle(html) || "Sports.ru fantasy");
  const budgetLimit = parseBudget(html) ?? defaultBudget;
  const prices = parseFeaturedPriceRows(html);

  return {
    contest: {
      name,
      budgetLimit,
      squadSize: defaultSquadSize,
      maxPlayersPerTeam: parseMaxPlayersPerTeam(html)
    },
    prices
  };
}

export function normalizeSportsRuPlayerName(value: string) {
  const transliterated = transliterateCyrillic(value);
  return normalizeName(transliterated || value);
}

function parseFeaturedPriceRows(html: string): SportsRuFantasyPriceRow[] {
  const rows: SportsRuFantasyPriceRow[] = [];
  const rowRegex = /<div class="field__row"[\s\S]*?>([\s\S]*?)<\/div><\/div><!--\]-->/gi;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = rowRegex.exec(html))) {
    const position = positionForFeaturedRow(rowIndex);
    const playerRegex = /<div class="field-player__surname"[^>]*>([^<]+)<\/div>\s*<div class="field-player__price"[^>]*>([\d.,]+)/gi;
    let playerMatch: RegExpExecArray | null;
    while ((playerMatch = playerRegex.exec(rowMatch[1]))) {
      const playerName = cleanText(playerMatch[1]);
      const price = Number(playerMatch[2].replace(",", "."));
      if (!playerName || !Number.isFinite(price)) continue;
      rows.push({
        playerName,
        normalizedName: normalizeSportsRuPlayerName(playerName),
        position,
        price,
        raw: {
          source: "featured-field",
          rowIndex
        }
      });
    }
    rowIndex += 1;
  }

  if (rows.length > 0) return rows;

  const fallbackRegex = /field-player__surname"[^>]*>([^<]+)<\/div>\s*<div class="field-player__price"[^>]*>([\d.,]+)/gi;
  let fallbackMatch: RegExpExecArray | null;
  let index = 0;
  while ((fallbackMatch = fallbackRegex.exec(html))) {
    const playerName = cleanText(fallbackMatch[1]);
    const price = Number(fallbackMatch[2].replace(",", "."));
    if (!playerName || !Number.isFinite(price)) continue;
    rows.push({
      playerName,
      normalizedName: normalizeSportsRuPlayerName(playerName),
      position: positionForFeaturedIndex(index),
      price,
      raw: {
        source: "featured-field-fallback",
        index
      }
    });
    index += 1;
  }

  return rows;
}

function parseBudget(html: string) {
  const match = html.match(/бюджет[\s\S]{0,180}?<strong[^>]*>\s*([\d.,]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseMaxPlayersPerTeam(html: string) {
  const match = html.match(/(?:не\s+более|максимум)[^<]{0,80}?(\d+)[^<]{0,80}?(?:одн(?:ой|ого)|клуб|команд)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function positionForFeaturedRow(rowIndex: number) {
  if (rowIndex === 0) return "GK";
  if (rowIndex === 1) return "DEF";
  if (rowIndex === 2) return "MID";
  return "FWD";
}

function positionForFeaturedIndex(index: number) {
  if (index === 0) return "GK";
  if (index <= 4) return "DEF";
  if (index <= 8) return "MID";
  return "FWD";
}

function textFromFirstClass(html: string, className: string) {
  const pattern = new RegExp(`<[^>]+class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : null;
}

function textFromTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : null;
}

function textBetween(html: string, start: RegExp, end: RegExp) {
  const startMatch = start.exec(html);
  if (!startMatch) return null;
  const rest = html.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(rest);
  return endMatch ? rest.slice(0, endMatch.index) : null;
}

function parseMembers(value: string | null) {
  if (!value) return null;
  const match = value.replace(/\s+/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function cleanText(value: string) {
  return htmlDecode(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlDecode(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transliterateCyrillic(value: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: ""
  };

  return value
    .split("")
    .map((char) => map[char.toLowerCase()] ?? char)
    .join("");
}
