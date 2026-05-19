import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveScoringModel } from "@/lib/scoring";
import { recalculateBaltikaTeamSnapshots } from "@/lib/scoring/baltika-team-form-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const body = await request.json();
  const leagueId = stringOrNull(body.leagueId);
  const seasonId = stringOrNull(body.seasonId);

  if (!leagueId || !seasonId) {
    return errorResponse("MISSING_CONTEXT", "leagueId and seasonId are required.", 400);
  }

  const homeTeamId = stringOrNull(body.homeTeamId);
  const awayTeamId = stringOrNull(body.awayTeamId);
  const [homeTeam, awayTeam] = await Promise.all([
    homeTeamId ? prisma.team.findUnique({ where: { id: homeTeamId } }) : null,
    awayTeamId ? prisma.team.findUnique({ where: { id: awayTeamId } }) : null
  ]);

  if (homeTeamId && (!homeTeam || homeTeam.leagueId !== leagueId)) {
    return errorResponse("HOME_TEAM_NOT_FOUND", "Home team was not found in this league.", 404);
  }

  if (awayTeamId && (!awayTeam || awayTeam.leagueId !== leagueId)) {
    return errorResponse("AWAY_TEAM_NOT_FOUND", "Away team was not found in this league.", 404);
  }

  const kickoffAt = dateOrNull(body.kickoffAt);
  const fixture = await prisma.baltikaFixture.create({
    data: {
      leagueId,
      seasonId,
      homeTeamId,
      awayTeamId,
      homeTeamName: homeTeam?.name ?? String(body.homeTeamName ?? "TBD"),
      awayTeamName: awayTeam?.name ?? stringOrNull(body.awayTeamName),
      roundNumber: integerOrNull(body.roundNumber),
      kickoffAt,
      status: "SCHEDULED",
      source: "MANUAL"
    }
  });
  const scoringModel = await getActiveScoringModel();
  await recalculateBaltikaTeamSnapshots(
    prisma,
    [homeTeamId, awayTeamId].filter((value): value is string => Boolean(value)),
    seasonId,
    scoringModel
  );

  return NextResponse.json({ fixture });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function dateOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
