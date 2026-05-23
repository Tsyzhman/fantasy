import { NextResponse } from "next/server";

import { pruneOldLeagueSeasons } from "@/core_data/league-season-retention";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cron access is not allowed." } }, { status: 403 });
  }

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
    return NextResponse.json(
      { error: { code: "CRON_RETENTION_FAILED", message: error instanceof Error ? error.message : "League season retention failed." } },
      { status: 409 }
    );
  }
}
