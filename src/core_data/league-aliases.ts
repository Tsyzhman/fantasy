import type { IngestionScope } from "./ingestion-scope";

type LeagueIdentity = {
  id: bigint | number | string;
  name?: string | null;
  country?: string | null;
};

type TargetLeague = {
  id: number;
  name: string;
  country: string | null;
};

type Matcher = {
  words?: string[];
  anyPhrase?: string[];
  compactIncludes?: string[];
  country?: Array<string | null>;
  exclude?: string[];
};

type CanonicalRule = {
  target: TargetLeague;
  matchers: Matcher[];
};

export type LeagueAlias = {
  sourceLeagueId: number;
  canonicalLeagueId: number;
};

export const canonicalCombinedLeagueIds = new Set([42, 48, 50, 73, 108, 133, 140, 10216]);

const canonicalRules: CanonicalRule[] = [
  rule(42, "Champions League", "International", [
    {
      words: ["champions", "league"],
      country: ["international", "int", null],
      exclude: ["afc", "caf", "concacaf", "ofc", "women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(10216, "Conference League", "International", [
    {
      words: ["conference", "league"],
      country: ["international", "int", null],
      exclude: ["women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(73, "Europa League", "International", [
    {
      words: ["europa", "league"],
      country: ["international", "int", null],
      exclude: ["conference", "women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(50, "EURO", "International", [
    {
      words: ["euro"],
      country: ["international", "int", null],
      exclude: ["qualification", "qualifier", "qualifying", "women", "futsal", "beach", "u17", "u19", "u20", "u21"]
    },
    {
      words: ["european", "championship"],
      country: ["international", "int", null],
      exclude: ["qualification", "qualifier", "qualifying", "women", "futsal", "beach", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(48, "Championship", "England", [
    {
      words: ["championship"],
      anyPhrase: ["playoff", "play off", "playoffs", "play offs"],
      country: ["england", null],
      exclude: ["scottish", "usl", "women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(133, "EFL Cup", "England", [
    {
      words: ["efl", "cup"],
      anyPhrase: ["qualification", "qualifying", "qualifier"],
      country: ["england", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    },
    {
      words: ["carabao", "cup"],
      anyPhrase: ["qualification", "qualifying", "qualifier"],
      country: ["england", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(140, "LaLiga2", "Spain", [
    {
      anyPhrase: ["laliga2 playoff", "laliga 2 playoff", "la liga 2 playoff", "laliga2 play off", "laliga 2 play off", "la liga 2 play off"],
      compactIncludes: ["laliga2playoff", "laliga2playoffs"],
      country: ["spain", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(108, "League One", "England", [
    {
      anyPhrase: ["league one", "efl league one", "league one playoff", "league one play off"],
      country: ["england", null],
      exclude: ["usl", "scottish", "women", "u17", "u19", "u20", "u21"]
    }
  ])
];

export function canonicalLeagueIdForIdentity(input: LeagueIdentity) {
  const numericId = numericLeagueId(input.id);
  if (numericId && canonicalCombinedLeagueIds.has(numericId)) return numericId;

  for (const canonicalRule of canonicalRules) {
    if (numericId === canonicalRule.target.id) return canonicalRule.target.id;
    if (!input.name || !matchesRule(input, canonicalRule)) continue;
    return canonicalRule.target.id;
  }

  return numericId;
}

export function targetLeagueForCanonicalId(leagueId: number | bigint | string | null | undefined) {
  const numericId = numericLeagueId(leagueId);
  if (!numericId) return null;
  return canonicalRules.find((candidate) => candidate.target.id === numericId)?.target ?? null;
}

export function scopeCanonicalLeagueId(scope: Pick<IngestionScope, "league_id" | "canonical_league_id">) {
  return scope.canonical_league_id ?? scope.league_id;
}

export function expandScopesWithAliases(scopes: IngestionScope[], aliases: LeagueAlias[]) {
  if (aliases.length === 0) return scopes;

  const expanded: IngestionScope[] = [];
  const seen = new Set<string>();

  const push = (scope: IngestionScope) => {
    const key = `${scope.league_id}:${scope.canonical_league_id ?? ""}:${scope.season}`;
    if (seen.has(key)) return;
    seen.add(key);
    expanded.push(scope);
  };

  for (const scope of scopes) {
    push(scope);
    const canonicalLeagueId = scopeCanonicalLeagueId(scope);
    for (const alias of aliases) {
      if (alias.canonicalLeagueId !== canonicalLeagueId || alias.sourceLeagueId === canonicalLeagueId) continue;
      push({
        ...scope,
        league_id: alias.sourceLeagueId,
        canonical_league_id: canonicalLeagueId
      });
    }
  }

  return expanded;
}

export function parseLeagueAliases(raw: string | null | undefined) {
  const aliases: LeagueAlias[] = [];
  if (!raw?.trim()) return aliases;

  for (const group of raw.split(/[;\n]+/)) {
    const trimmed = group.trim();
    if (!trimmed) continue;

    const separator = findAliasSeparator(trimmed);
    if (!separator || separator.index <= 0) continue;

    const canonicalLeagueId = Number(trimmed.slice(0, separator.index).trim());
    if (!Number.isInteger(canonicalLeagueId) || canonicalLeagueId <= 0) continue;

    const sourcePart = trimmed.slice(separator.index + separator.length);
    for (const source of sourcePart.split(/[,\s]+/)) {
      const sourceLeagueId = Number(source.trim());
      if (!Number.isInteger(sourceLeagueId) || sourceLeagueId <= 0 || sourceLeagueId === canonicalLeagueId) continue;
      aliases.push({ sourceLeagueId, canonicalLeagueId });
    }
  }

  return dedupeAliases(aliases);
}

export function dedupeAliases(aliases: LeagueAlias[]) {
  const seen = new Set<string>();
  const result: LeagueAlias[] = [];
  for (const alias of aliases) {
    const key = `${alias.sourceLeagueId}:${alias.canonicalLeagueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

export function numericLeagueId(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const valueString = String(value);
  if (!/^\d+$/.test(valueString)) return null;
  const numeric = Number(valueString);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function rule(id: number, name: string, country: string | null, matchers: Matcher[]): CanonicalRule {
  return {
    target: { id, name, country },
    matchers
  };
}

function matchesRule(league: Pick<LeagueIdentity, "name" | "country">, canonicalRule: CanonicalRule) {
  return canonicalRule.matchers.some((matcher) => matchesMatcher(league, matcher));
}

function matchesMatcher(league: Pick<LeagueIdentity, "name" | "country">, matcher: Matcher) {
  const text = normalizeText(league.name);
  const compact = text.replace(/\s+/g, "");
  const country = normalizeCountry(league.country);

  if (matcher.country && !matcher.country.some((candidate) => normalizeCountry(candidate) === country)) return false;
  if (matcher.exclude?.some((word) => hasWord(text, word))) return false;
  if (matcher.words?.some((word) => !hasWord(text, word))) return false;
  if (matcher.anyPhrase && !matcher.anyPhrase.some((phrase) => text.includes(normalizeText(phrase)))) return false;
  if (matcher.compactIncludes && !matcher.compactIncludes.some((phrase) => compact.includes(normalizeText(phrase).replace(/\s+/g, "")))) return false;

  return true;
}

function findAliasSeparator(value: string) {
  const separators = [":", "=", "->"];
  const matches = separators
    .map((separator) => ({ index: value.indexOf(separator), length: separator.length }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);
  return matches[0] ?? null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (normalized === "int") return "international";
  return normalized || null;
}

function hasWord(text: string, word: string) {
  const normalizedWord = normalizeText(word);
  if (!normalizedWord) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedWord)}(\\s|$)`).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
