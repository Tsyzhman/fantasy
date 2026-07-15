import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireCronAccess } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { runFantasyDataQualityAudit } from "@/machete/data_quality_audit";
import { readDataQualityAuditScheduleConfig } from "@/machete/data_quality_schedule";

const logger = createLogger("data-quality:cron");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const cronAccessResponse = requireCronAccess(request);
  if (cronAccessResponse) return cronAccessResponse;

  let config: ReturnType<typeof readDataQualityAuditScheduleConfig>;
  try {
    config = readDataQualityAuditScheduleConfig();
  } catch (error) {
    return jsonError("DATA_QUALITY_AUDIT_CONFIG_INVALID", errorMessage(error), 503);
  }
  if (config.scopes.length === 0) {
    return jsonError(
      "DATA_QUALITY_AUDIT_NOT_CONFIGURED",
      "Configure DATA_QUALITY_AUDIT_SCOPES before running the scheduled audit.",
      503
    );
  }

  try {
    const results: Array<{
      runId: string | null;
      leagueId: string;
      season: string;
      passed: boolean;
      reasons: string[];
      forecastCoveragePercent: number;
      playerDataCoveragePercent: number;
      matchDataCoveragePercent: number;
      statRowCoveragePercent: number;
      promotionLatencyCoveragePercent: number;
    }> = [];
    const crashes: Array<{ leagueId: string; season: string; error: string }> = [];
    for (const scope of config.scopes) {
      logger.info("Starting scheduled data-quality audit.", scope);
      try {
        const report = await runFantasyDataQualityAudit(prisma, {
          ...scope,
          coveragePercent: config.coveragePercent,
          maximumLatencyHours: config.maximumLatencyHours
        });
        const result = {
          runId: report.runId,
          leagueId: report.scope.leagueId,
          season: report.scope.season,
          passed: report.quality.betaGate.passed,
          reasons: report.quality.betaGate.reasons,
          forecastCoveragePercent: report.quality.forecasts.coveragePercent,
          playerDataCoveragePercent: report.quality.players.coveragePercent,
          matchDataCoveragePercent: report.quality.matches.coveragePercent,
          statRowCoveragePercent: report.quality.statRows.coveragePercent,
          promotionLatencyCoveragePercent: report.quality.matches.promotionLatencyCoveragePercent
        };
        results.push(result);
        if (result.passed) logger.info("Scheduled data-quality audit passed.", result);
        else logger.warn("Scheduled data-quality audit failed its beta gate.", result);
      } catch (error) {
        const crash = { leagueId: String(scope.leagueId), season: scope.season, error: errorMessage(error) };
        crashes.push(crash);
        logger.error("Scheduled data-quality audit scope crashed.", crash);
      }
    }

    const passed = crashes.length === 0 && results.length === config.scopes.length && results.every((result) => result.passed);
    const status = crashes.length > 0 ? 500 : passed ? 200 : 409;
    return NextResponse.json(
      {
        status: crashes.length > 0 ? "error" : passed ? "ok" : "failed",
        mode: "fantasy_data_quality",
        schedule: "10:00 Europe/Moscow daily",
        passed,
        results,
        crashes
      },
      { status }
    );
  } catch (error) {
    logger.error("Scheduled data-quality audit crashed.", { error });
    return jsonError("DATA_QUALITY_AUDIT_FAILED", errorMessage(error), 500);
  }
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
