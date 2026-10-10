/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasyPriceHealthThresholds,
  type SportsRuFantasySyncScope
} from "@/machete/sports_ru_fantasy_config";
import { evaluateSportsRuFantasyPriceHealth } from "@/machete/sports_ru_fantasy_health";
import { loadActiveFantasySourceScopes, activeFantasyScope } from "@/server/fantasy-source-registry";

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
    const scopes = await loadActiveFantasySourceScopes(prisma);
    if (scopes.length === 0) return NextResponse.json({ status: "error", reason: "SCOPES_NOT_CONFIGURED" }, { status: 503 });

    const results = await Promise.all(
      scopes.map(async (scope) => {
        const contest = observedByScope.get(scopeIdentity(scope.leagueId, scope.season));
        const priceWhere = contest
          ? { contestId: contest.id, provider: "SPORTS_RU" as const }
          : { provider: "SPORTS_RU" as const, leagueId: scope.leagueId, season: scope.season };
        const [priceCount, mappedCount, excluded] = await Promise.all([
          prisma.fantasyPlayerPrice.count({ where: priceWhere }),
          prisma.fantasyPlayerPrice.count({ where: { ...priceWhere, playerId: { not: null } } }),
          prisma.providerEntityMap.findMany({ where: { provider: "SPORTS_RU", contestId: contest?.id ?? "__missing__", providerEntityType: "FANTASY_PLAYER_PRICE", status: "EXCLUDED", matchedBy: { startsWith: "MANUAL_" } }, select: { providerEntityId: true, matchedBy: true }, take: 2000 })
        ]);
        const excludedCount = excluded.length ? await prisma.fantasyPlayerPrice.count({ where: { ...priceWhere, id: { in: excluded.map(row => row.providerEntityId) }, playerId: null } }) : 0;
        return { ...evaluateSportsRuFantasyPriceHealth(
          { scope, lastSyncedAt: contest?.lastSyncedAt ?? null, priceCount, mappedCount, excludedCount },
          thresholds
        ), scheduleOwner: "fantasy-source-registry", intervalHours: Number(process.env.SPORTS_RU_FANTASY_SYNC_INTERVAL_HOURS || 6), exclusions: excluded };
      })
    );
    const healthy = results.every((result) => result.healthy);
    const archives = await Promise.all(observedContests.filter(contest => !activeFantasyScope(contest.leagueId, contest.season)).map(async contest => {
      const where = { contestId: contest.id, provider: "SPORTS_RU" as const };
      const [priceCount, mappedCount, invalidPriceCount, mismatchedScopeCount] = await Promise.all([
        prisma.fantasyPlayerPrice.count({ where }),
        prisma.fantasyPlayerPrice.count({ where: { ...where, playerId: { not: null } } }),
        prisma.fantasyPlayerPrice.count({ where: { ...where, price: { lt: 0 } } }),
        prisma.fantasyPlayerPrice.count({ where: { ...where, OR: [{ leagueId: { not: contest.leagueId } }, { season: { not: contest.season } }] } })
      ]);
      return { leagueId: String(contest.leagueId), season: contest.season, state: "ARCHIVE", freshness: "NOT_APPLICABLE",
        lastSuccessfulReceipt: contest.lastSyncedAt, integrity: { healthy: priceCount > 0 && invalidPriceCount === 0 && mismatchedScopeCount === 0,
          priceCount, mappedCount, unmappedCount: priceCount - mappedCount, invalidPriceCount, mismatchedScopeCount } };
    }));
    const configDrift = compareConfiguredAndObservedScopes(scopes, observedScopes.filter(scope => activeFantasyScope(scope.leagueId, scope.season)));
    return NextResponse.json(
      {
        status: healthy ? "ok" : "error",
        healthy,
        thresholds,
        source: observedContests.length > 0 ? "DATABASE_CONTESTS" : "ENVIRONMENT_FALLBACK",
        configDrift,
        legacyConfiguredScopes: configuredScopes.map(formatScope),
        archives,
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
