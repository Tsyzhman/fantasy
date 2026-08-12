import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasyPriceHealthThresholds,
  type SportsRuFantasySyncScope
} from "@/machete/sports_ru_fantasy_config";
import { evaluateSportsRuFantasyPriceHealth } from "@/machete/sports_ru_fantasy_health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ status: "error", reason: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  let configuredScopes: SportsRuFantasySyncScope[];
  try {
    configuredScopes = parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "CONFIG_INVALID", message: errorMessage(error) }, { status: 503 });
  }

  const thresholds = sportsRuFantasyPriceHealthThresholds();
  try {
    const observedContests = await prisma.fantasyContest.findMany({
      where: { provider: "SPORTS_RU" },
      select: { id: true, leagueId: true, season: true, rules: true, lastSyncedAt: true, sourceUrl: true },
      orderBy: { lastSyncedAt: "desc" }
    });
    const observedByScope = new Map(observedContests.map((contest) => [scopeIdentity(contest.leagueId, contest.season), contest]));
    const observedScopes = observedContests.map((contest) => ({
      leagueId: contest.leagueId,
      season: contest.season,
      tournamentHru: readTournamentHru(contest.rules) ?? "unknown"
    } satisfies SportsRuFantasySyncScope));
    const scopes = mergeHealthScopes(configuredScopes, observedScopes);
    if (scopes.length === 0) return NextResponse.json({ status: "error", reason: "SCOPES_NOT_CONFIGURED" }, { status: 503 });

    const results = await Promise.all(
      scopes.map(async (scope) => {
        const contest = observedByScope.get(scopeIdentity(scope.leagueId, scope.season));
        const priceWhere = contest
          ? { contestId: contest.id, provider: "SPORTS_RU" as const }
          : { provider: "SPORTS_RU" as const, leagueId: scope.leagueId, season: scope.season };
        const [priceCount, mappedCount] = await Promise.all([
          prisma.fantasyPlayerPrice.count({ where: priceWhere }),
          prisma.fantasyPlayerPrice.count({ where: { ...priceWhere, playerId: { not: null } } })
        ]);
        return evaluateSportsRuFantasyPriceHealth(
          { scope, lastSyncedAt: contest?.lastSyncedAt ?? null, priceCount, mappedCount },
          thresholds
        );
      })
    );
    const healthy = results.every((result) => result.healthy);
    const configDrift = compareConfiguredAndObservedScopes(configuredScopes, observedScopes);
    return NextResponse.json(
      {
        status: healthy ? "ok" : "error",
        healthy,
        thresholds,
        source: observedContests.length > 0 ? "DATABASE_CONTESTS" : "ENVIRONMENT_FALLBACK",
        configDrift,
        results
      },
      { status: healthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "QUERY_FAILED", message: errorMessage(error) }, { status: 503 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function scopeIdentity(leagueId: bigint, season: string) {
  return `${leagueId.toString()}:${season}`;
}

function mergeHealthScopes(configured: SportsRuFantasySyncScope[], observed: SportsRuFantasySyncScope[]) {
  const merged = new Map<string, SportsRuFantasySyncScope>();
  for (const scope of observed) merged.set(scopeIdentity(scope.leagueId, scope.season), scope);
  for (const scope of configured) {
    const key = scopeIdentity(scope.leagueId, scope.season);
    if (!merged.has(key)) merged.set(key, scope);
  }
  return [...merged.values()];
}

function compareConfiguredAndObservedScopes(configured: SportsRuFantasySyncScope[], observed: SportsRuFantasySyncScope[]) {
  const configuredByIdentity = new Map(configured.map((scope) => [scopeIdentity(scope.leagueId, scope.season), scope]));
  const observedByIdentity = new Map(observed.map((scope) => [scopeIdentity(scope.leagueId, scope.season), scope]));
  return {
    configured: configured.map(formatScope),
    observed: observed.map(formatScope),
    missingInDatabase: configured.filter((scope) => !observedByIdentity.has(scopeIdentity(scope.leagueId, scope.season))).map(formatScope),
    notConfigured: observed.filter((scope) => !configuredByIdentity.has(scopeIdentity(scope.leagueId, scope.season))).map(formatScope),
    tournamentMismatch: observed
      .filter((scope) => {
        const configuredScope = configuredByIdentity.get(scopeIdentity(scope.leagueId, scope.season));
        return Boolean(configuredScope && configuredScope.tournamentHru !== scope.tournamentHru && scope.tournamentHru !== "unknown");
      })
      .map((scope) => ({ observed: formatScope(scope), configured: formatScope(configuredByIdentity.get(scopeIdentity(scope.leagueId, scope.season))!) }))
  };
}

function formatScope(scope: SportsRuFantasySyncScope) {
  return `${scope.leagueId.toString()}:${scope.season}:${scope.tournamentHru}`;
}

function readTournamentHru(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).tournamentHru;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}
