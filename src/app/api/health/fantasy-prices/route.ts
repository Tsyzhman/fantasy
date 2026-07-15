import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasyPriceHealthThresholds
} from "@/machete/sports_ru_fantasy_config";
import { evaluateSportsRuFantasyPriceHealth } from "@/machete/sports_ru_fantasy_health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ status: "error", reason: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  let scopes;
  try {
    scopes = parseSportsRuFantasySyncScopes(process.env.SPORTS_RU_FANTASY_SYNC_SCOPES ?? "");
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "CONFIG_INVALID", message: errorMessage(error) }, { status: 503 });
  }
  if (scopes.length === 0) return NextResponse.json({ status: "error", reason: "SCOPES_NOT_CONFIGURED" }, { status: 503 });

  const thresholds = sportsRuFantasyPriceHealthThresholds();
  try {
    const results = await Promise.all(
      scopes.map(async (scope) => {
        const [contest, priceCount, mappedCount] = await Promise.all([
          prisma.sportsRuFantasyContest.findUnique({
            where: { provider_leagueId_season: { provider: "SPORTS_RU", leagueId: scope.leagueId, season: scope.season } },
            select: { lastSyncedAt: true, sourceUrl: true }
          }),
          prisma.fantasyPlayerPrice.count({ where: { provider: "SPORTS_RU", leagueId: scope.leagueId, season: scope.season } }),
          prisma.fantasyPlayerPrice.count({
            where: { provider: "SPORTS_RU", leagueId: scope.leagueId, season: scope.season, playerId: { not: null } }
          })
        ]);
        return evaluateSportsRuFantasyPriceHealth(
          { scope, lastSyncedAt: contest?.lastSyncedAt ?? null, priceCount, mappedCount },
          thresholds
        );
      })
    );
    const healthy = results.every((result) => result.healthy);
    return NextResponse.json(
      { status: healthy ? "ok" : "error", healthy, thresholds, results },
      { status: healthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "QUERY_FAILED", message: errorMessage(error) }, { status: 503 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
