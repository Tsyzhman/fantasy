import type { PrismaClient } from "@prisma/client";

import type { SportsRuFantasySyncScope } from "./sports_ru_fantasy_config";

type LeagueSeasonLookupPrisma = Pick<PrismaClient, "leagueSeason">;

type SourceDefinition = {
  leagueId: bigint;
  sourceKey: string;
  labelEn: string;
  labelRu: string;
  requiresCurrentEuropeanSeason?: boolean;
};

export type FoontasySourceDefinition = SourceDefinition & {
  assistantSlug: string;
  sourceVariant: "sports" | "uefa";
  assistantQuery?: Readonly<Record<string, string>>;
};

export type FantasySourceSyncOption = {
  key: string;
  leagueId: string;
  season: string;
  labelEn: string;
  labelRu: string;
};

export type FoontasySyncScope = {
  leagueId: bigint;
  season: string;
  sourceKey: string;
  sourceVariant: "sports" | "uefa";
  assistantSlug: string;
  url: string;
};

const sportsRuPriceDefinitions: readonly SourceDefinition[] = [
  { leagueId: 63n, sourceKey: "russia", labelEn: "Russia", labelRu: "Россия" },
  { leagueId: 47n, sourceKey: "england", labelEn: "Premier League", labelRu: "АПЛ" },
  { leagueId: 87n, sourceKey: "spain", labelEn: "Spain", labelRu: "Испания" },
  { leagueId: 54n, sourceKey: "germany", labelEn: "Bundesliga", labelRu: "Бундеслига" },
  { leagueId: 55n, sourceKey: "italy", labelEn: "Serie A", labelRu: "Серия А" },
  { leagueId: 53n, sourceKey: "france", labelEn: "Ligue 1", labelRu: "Лига 1" },
  { leagueId: 61n, sourceKey: "portugal", labelEn: "Portugal", labelRu: "Португалия" },
  { leagueId: 57n, sourceKey: "netherlands", labelEn: "Netherlands", labelRu: "Нидерланды" },
  { leagueId: 71n, sourceKey: "turkey", labelEn: "Turkey", labelRu: "Турция" },
  { leagueId: 48n, sourceKey: "championship", labelEn: "Championship", labelRu: "Чемпионшип" },
  { leagueId: 42n, sourceKey: "champions-league", labelEn: "Champions League", labelRu: "ЛЧ Sports", requiresCurrentEuropeanSeason: true },
  { leagueId: 73n, sourceKey: "europa-league", labelEn: "Europa League", labelRu: "Лига Европы", requiresCurrentEuropeanSeason: true },
  { leagueId: 77n, sourceKey: "world-cup", labelEn: "World Cup", labelRu: "Чемпионат мира" }
];

const foontasySourceDefinitions: readonly FoontasySourceDefinition[] = [
  foontasyDefinition(63n, "rpl", "RPL", "РПЛ"),
  foontasyDefinition(47n, "epl", "Premier League", "АПЛ"),
  foontasyDefinition(87n, "la-liga", "LaLiga", "Ла Лига"),
  foontasyDefinition(54n, "bundesliga", "Bundesliga", "Бундеслига"),
  foontasyDefinition(55n, "serie-a", "Serie A", "Серия А"),
  foontasyDefinition(53n, "ligue-1", "Ligue 1", "Лига 1"),
  foontasyDefinition(57n, "eredivisie", "Eredivisie", "Эредивизи"),
  foontasyDefinition(61n, "liga-nos", "Liga Portugal", "Примейра"),
  foontasyDefinition(71n, "super-lig", "Super Lig", "Суперлига"),
  foontasyDefinition(48n, "championship", "Championship", "Чемпионшип"),
  foontasyDefinition(42n, "champions-league-sports", "Champions League (Sports.ru)", "ЛЧ Sports", {
    assistantSlug: "champions-league",
    requiresCurrentEuropeanSeason: true
  }),
  foontasyDefinition(42n, "champions-league-uefa", "Champions League (UEFA)", "ЛЧ UEFA", {
    assistantSlug: "champions-league",
    assistantQuery: { game: "uefa" },
    requiresCurrentEuropeanSeason: true,
    sourceVariant: "uefa"
  }),
  foontasyDefinition(73n, "europa-league", "Europa League", "Лига Европы", {
    requiresCurrentEuropeanSeason: true
  }),
  foontasyDefinition(77n, "world-cup", "World Cup", "Чемпионат мира")
];

const defaultFoontasyScopeDefinitions = foontasySourceDefinitions
  .map((definition) => `${definition.leagueId}:${definition.sourceKey}`)
  .join(";");

export async function loadSportsRuPriceSyncScopes(prisma: LeagueSeasonLookupPrisma, now = new Date()) {
  return currentScopes(prisma, sportsRuPriceDefinitions, (definition, season) => ({
    leagueId: definition.leagueId,
    season,
    tournamentHru: definition.sourceKey
  } satisfies SportsRuFantasySyncScope), now);
}

export async function loadFoontasySyncScopes(
  prisma: LeagueSeasonLookupPrisma,
  environment: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  const definitions = parseFoontasyScopeDefinitions(
    environment.FOONTASY_SYNC_SCOPES?.trim() || defaultFoontasyScopeDefinitions
  );
  const origin = foontasyOrigin(environment.FOONTASY_URL);
  return currentScopes(prisma, definitions, (definition, season) => ({
    leagueId: definition.leagueId,
    season,
    sourceKey: definition.sourceKey,
    sourceVariant: definition.sourceVariant,
    assistantSlug: definition.assistantSlug,
    url: foontasyAssistantUrl(origin, definition)
  } satisfies FoontasySyncScope), now);
}

export function parseFoontasyScopeDefinitions(value: string): FoontasySourceDefinition[] {
  const knownByScope = new Map(foontasySourceDefinitions.map((definition) => [
    `${definition.leagueId}:${definition.sourceKey}`,
    definition
  ]));
  const labelsByLeagueId = new Map(foontasySourceDefinitions.map((definition) => [definition.leagueId, definition]));
  const seen = new Set<string>();
  return value
    .split(/[;,]/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .map((scope) => {
      const match = /^(\d+):([a-z0-9-]+)$/i.exec(scope);
      if (!match) throw new Error(`Invalid Foontasy sync scope: ${scope}. Expected <league-id>:<assistant-slug>.`);
      const leagueId = BigInt(match[1]);
      const sourceKey = match[2].toLowerCase();
      const uniqueKey = `${leagueId}:${sourceKey}`;
      if (seen.has(uniqueKey)) throw new Error(`Duplicate Foontasy sync scope: ${scope}.`);
      seen.add(uniqueKey);
      const exact = knownByScope.get(uniqueKey);
      if (exact) return { ...exact };
      const known = labelsByLeagueId.get(leagueId);
      return {
        leagueId,
        sourceKey,
        labelEn: known?.labelEn ?? `League ${leagueId}`,
        labelRu: known?.labelRu ?? `Лига ${leagueId}`,
        assistantSlug: sourceKey,
        sourceVariant: "sports" as const
      };
    });
}

export function fantasySourceScopeKey(scope: { leagueId: bigint; season: string }, sourceKey: string) {
  return `${scope.leagueId}:${scope.season}:${sourceKey}`;
}

export function fantasySourceSyncOption(
  scope: { leagueId: bigint; season: string },
  sourceKey: string,
  labels: Pick<SourceDefinition, "labelEn" | "labelRu">
): FantasySourceSyncOption {
  return {
    key: fantasySourceScopeKey(scope, sourceKey),
    leagueId: String(scope.leagueId),
    season: scope.season,
    labelEn: labels.labelEn,
    labelRu: labels.labelRu
  };
}

export function selectRequestedScopes<T>(
  available: readonly T[],
  requestedKeys: readonly string[],
  keyFor: (scope: T) => string
) {
  if (requestedKeys.length === 0) throw new Error("Select at least one league.");
  if (requestedKeys.length > 20) throw new Error("Too many league scopes were selected.");
  const uniqueKeys = [...new Set(requestedKeys)];
  const availableByKey = new Map(available.map((scope) => [keyFor(scope), scope]));
  const invalid = uniqueKeys.filter((key) => !availableByKey.has(key));
  if (invalid.length > 0) throw new Error(`Unsupported league scope: ${invalid.join(", ")}.`);
  return uniqueKeys.map((key) => availableByKey.get(key)!);
}

export function sportsRuScopeKey(scope: SportsRuFantasySyncScope) {
  return fantasySourceScopeKey(scope, scope.tournamentHru);
}

export function foontasyScopeKey(scope: FoontasySyncScope) {
  return fantasySourceScopeKey(scope, scope.sourceKey);
}

export function sportsRuScopeOption(scope: SportsRuFantasySyncScope) {
  const definition = sportsRuPriceDefinitions.find((item) => item.leagueId === scope.leagueId && item.sourceKey === scope.tournamentHru);
  return fantasySourceSyncOption(scope, scope.tournamentHru, definition ?? {
    labelEn: `League ${scope.leagueId}`,
    labelRu: `Лига ${scope.leagueId}`
  });
}

export function foontasyScopeOption(scope: FoontasySyncScope) {
  const definition = foontasySourceDefinitions.find((item) =>
    item.leagueId === scope.leagueId && item.sourceKey === scope.sourceKey
  );
  return fantasySourceSyncOption(scope, scope.sourceKey, definition ?? {
    labelEn: `League ${scope.leagueId}`,
    labelRu: `Лига ${scope.leagueId}`
  });
}

async function currentScopes<D extends SourceDefinition, T>(
  prisma: LeagueSeasonLookupPrisma,
  definitions: readonly D[],
  build: (definition: D, season: string) => T,
  now: Date
) {
  const seasons = await prisma.leagueSeason.findMany({
    where: { leagueId: { in: definitions.map((definition) => definition.leagueId) }, isCurrent: true },
    orderBy: { updatedAt: "desc" },
    select: { leagueId: true, season: true }
  });
  const currentSeasonByLeague = new Map<bigint, string>();
  for (const season of seasons) {
    if (!currentSeasonByLeague.has(season.leagueId)) currentSeasonByLeague.set(season.leagueId, season.season);
  }
  return definitions.flatMap((definition) => {
    const season = currentSeasonByLeague.get(definition.leagueId);
    if (!season || !definitionSeasonIsUsable(definition, season, now)) return [];
    return [build(definition, season)];
  });
}

function foontasyDefinition(
  leagueId: bigint,
  sourceKey: string,
  labelEn: string,
  labelRu: string,
  options: Partial<Pick<FoontasySourceDefinition,
    "assistantQuery" | "assistantSlug" | "requiresCurrentEuropeanSeason" | "sourceVariant">> = {}
): FoontasySourceDefinition {
  return {
    leagueId,
    sourceKey,
    labelEn,
    labelRu,
    assistantSlug: options.assistantSlug ?? sourceKey,
    sourceVariant: options.sourceVariant ?? "sports",
    assistantQuery: options.assistantQuery,
    requiresCurrentEuropeanSeason: options.requiresCurrentEuropeanSeason
  };
}

function foontasyAssistantUrl(origin: string, definition: FoontasySourceDefinition) {
  const url = new URL(`/assistant/${definition.assistantSlug}`, origin);
  for (const [key, value] of Object.entries(definition.assistantQuery ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function definitionSeasonIsUsable(definition: SourceDefinition, season: string, now: Date) {
  return !definition.requiresCurrentEuropeanSeason || season === currentEuropeanSeason(now);
}

export function currentEuropeanSeason(now: Date) {
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

function foontasyOrigin(configuredUrl: string | undefined) {
  try {
    return new URL(configuredUrl || "https://foontasy.ru/assistant/rpl").origin;
  } catch {
    return "https://foontasy.ru";
  }
}
