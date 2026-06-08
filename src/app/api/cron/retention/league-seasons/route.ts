import { NextResponse } from "next/server";

import { pruneOldLeagueSeasons } from "@/core_data/league-season-retention";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireCronAccess } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";

export const GET = withApiHandler(async (request: Request) => {
  const cronAccessResponse = requireCronAccess(request);
  if (cronAccessResponse) return cronAccessResponse;

  const url = new URL(request.url);
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());

  try {
    const result = await pruneOldLeagueSeasons(prisma, { dryRun });
    return NextResponse.json({
      ...result,
      schedule: "03:30 Europe/Moscow on January 1 and July 1",
      mode: "league_season_retention"
    });
  } catch (error) {
    return jsonError("CRON_RETENTION_FAILED", error instanceof Error ? error.message : "League season retention failed.", 409);
  }
});
