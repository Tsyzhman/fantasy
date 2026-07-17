import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import { evaluateDataQualityAuditRunHealth } from "@/machete/data_quality_monitor";
import { readDataQualityAuditScheduleConfig } from "@/machete/data_quality_schedule";
import { evaluatePlannerDefaultScope, loadPlannerReadinessByScope, plannerReadinessKey } from "@/machete/planner_readiness";
import { loadSharedLeagueSeasonOptions } from "@/machete/shared_read_model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ status: "error", reason: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  let config: ReturnType<typeof readDataQualityAuditScheduleConfig>;
  try {
    config = readDataQualityAuditScheduleConfig();
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "CONFIG_INVALID", message: errorMessage(error) }, { status: 503 });
  }
  if (config.scopes.length === 0) {
    return NextResponse.json({ status: "error", reason: "SCOPES_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const now = Date.now();
    const results = await Promise.all(
      config.scopes.map(async (scope) => {
        const run = await prisma.dataQualityAuditRun.findFirst({
          where: { leagueId: scope.leagueId, season: scope.season },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            gatePassed: true,
            forecastCoverage: true,
            playerDataCoverage: true,
            matchDataCoverage: true,
            statRowCoverage: true,
            promotionLatencyCoverage: true,
            startedAt: true,
            completedAt: true
          }
        });
        const runHealth = evaluateDataQualityAuditRunHealth(run, now, config.maximumRunAgeHours);
        return {
          leagueId: String(scope.leagueId),
          season: scope.season,
          healthy: runHealth.healthy,
          maximumRunAgeHours: config.maximumRunAgeHours,
          ageHours: runHealth.ageHours,
          latestRun: run
        };
      })
    );
    const configuredLeagueIds = new Set(config.scopes.map((scope) => String(scope.leagueId)));
    const leagueSeasons = (await loadSharedLeagueSeasonOptions(prisma)).filter((scope) => configuredLeagueIds.has(String(scope.leagueId)));
    const plannerReadiness = await loadPlannerReadinessByScope(prisma, leagueSeasons, {
      now: new Date(now),
      maximumAgeHours: config.maximumRunAgeHours
    });
    const configuredScopeKeys = new Set(config.scopes.map(plannerReadinessKey));
    const plannerDefaults = [...configuredLeagueIds].map((leagueId) =>
      evaluatePlannerDefaultScope(
        leagueId,
        leagueSeasons.filter((scope) => String(scope.leagueId) === leagueId),
        plannerReadiness,
        configuredScopeKeys
      )
    );
    const healthy = results.every((result) => result.healthy) && plannerDefaults.length > 0 && plannerDefaults.every((result) => result.healthy);
    return NextResponse.json(
      { status: healthy ? "ok" : "error", healthy, results, plannerDefaults },
      { status: healthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "QUERY_FAILED", message: errorMessage(error) }, { status: 503 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
