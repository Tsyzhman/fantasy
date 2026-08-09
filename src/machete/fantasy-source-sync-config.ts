import type { PrismaClient } from "@prisma/client";

import type { SportsRuFantasySyncScope } from "./sports_ru_fantasy_config";

type LeagueSeasonLookupPrisma = Pick<PrismaClient, "leagueSeason">;

type SourceDefinition = {
  leagueId: bigint;
  sourceKey: string;
  labelEn: string;
  labelRu: string;
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
  assistantSlug: string;
  url: string;
};

const sportsRuPriceDefinitions: readonly SourceDefinition[] = [
  { leagueId: 63n, sourceKey: "russia", labelEn: "Russia", labelRu: "Россия" },
  { leagueId: 87n, sourceKey: "spain", labelEn: "Spain", labelRu: "Испания" },
  { leagueId: 61n, sourceKey: "portugal", labelEn: "Portugal", labelRu: "Португалия" },
  { leagueId: 57n, sourceKey: "netherlands", labelEn: "Netherlands", labelRu: "Нидерланды" },
  { leagueId: 71n, sourceKey: "turkey", labelEn: "Turkey", labelRu: "Турция" },
  { leagueId: 48n, sourceKey: "championship", labelEn: "Championship", labelRu: "Чемпионшип" }
];

const defaultFoontasyScopeDefinitions = "63:rpl;57:eredivisie";

export async function loadSportsRuPriceSyncScopes(prisma: LeagueSeasonLookupPrisma) {
  return currentScopes(prisma, sportsRuPriceDefinitions, (definition, season) => ({
    leagueId: definition.leagueId,
    season,
    tournamentHru: definition.sourceKey
  } satisfies SportsRuFantasySyncScope));
}

export async function loadFoontasySyncScopes(
  prisma: LeagueSeasonLookupPrisma,
  environment: Record<string, string | undefined> = process.env
) {
  const definitions = parseFoontasyScopeDefinitions(
    environment.FOONTASY_SYNC_SCOPES?.trim() || defaultFoontasyScopeDefinitions
  );
  const origin = foontasyOrigin(environment.FOONTASY_URL);
  return currentScopes(prisma, definitions, (definition, season) => ({
    leagueId: definition.leagueId,
    season,
    assistantSlug: definition.sourceKey,
    url: new URL(`/assistant/${definition.sourceKey}`, origin).toString()
  } satisfies FoontasySyncScope));
}

export function parseFoontasyScopeDefinitions(value: string): SourceDefinition[] {
  const labelsByLeagueId = new Map(sportsRuPriceDefinitions.map((definition) => [definition.leagueId, definition]));
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
      const known = labelsByLeagueId.get(leagueId);
      return {
        leagueId,
        sourceKey,
        labelEn: known?.labelEn ?? `League ${leagueId}`,
        labelRu: known?.labelRu ?? `Лига ${leagueId}`
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
  return fantasySourceScopeKey(scope, scope.assistantSlug);
}

export function sportsRuScopeOption(scope: SportsRuFantasySyncScope) {
  const definition = sportsRuPriceDefinitions.find((item) => item.leagueId === scope.leagueId && item.sourceKey === scope.tournamentHru);
  return fantasySourceSyncOption(scope, scope.tournamentHru, definition ?? {
    labelEn: `League ${scope.leagueId}`,
    labelRu: `Лига ${scope.leagueId}`
  });
}

export function foontasyScopeOption(scope: FoontasySyncScope) {
  const definition = sportsRuPriceDefinitions.find((item) => item.leagueId === scope.leagueId);
  return fantasySourceSyncOption(scope, scope.assistantSlug, definition ?? {
    labelEn: `League ${scope.leagueId}`,
    labelRu: `Лига ${scope.leagueId}`
  });
}

async function currentScopes<T>(
  prisma: LeagueSeasonLookupPrisma,
  definitions: readonly SourceDefinition[],
  build: (definition: SourceDefinition, season: string) => T
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
    return season ? [build(definition, season)] : [];
  });
}

function foontasyOrigin(configuredUrl: string | undefined) {
  try {
    return new URL(configuredUrl || "https://foontasy.ru/assistant/rpl").origin;
  } catch {
    return "https://foontasy.ru";
  }
}
