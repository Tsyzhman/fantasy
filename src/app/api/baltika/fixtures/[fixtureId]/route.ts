import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getActiveScoringModel } from "@/lib/scoring";
import { recalculateBaltikaTeamSnapshots } from "@/lib/scoring/baltika-team-form-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: {
    fixtureId: string;
  };
};

export async function PATCH(request: Request, { params }: Params) {
  const fixture = await prisma.baltikaFixture.findUnique({ where: { id: params.fixtureId } });
  if (!fixture) return errorResponse("FIXTURE_NOT_FOUND", "Fixture not found.", 404);

  const body = await request.json();
  const homeTeamId = stringOrNull(body.homeTeamId);
  const awayTeamId = stringOrNull(body.awayTeamId);
  const [homeTeam, awayTeam] = await Promise.all([
    homeTeamId ? prisma.team.findUnique({ where: { id: homeTeamId } }) : null,
    awayTeamId ? prisma.team.findUnique({ where: { id: awayTeamId } }) : null
  ]);

  if (homeTeamId && (!homeTeam || homeTeam.leagueId !== fixture.leagueId)) {
    return errorResponse("HOME_TEAM_NOT_FOUND", "Home team was not found in this league.", 404);
  }

  if (awayTeamId && (!awayTeam || awayTeam.leagueId !== fixture.leagueId)) {
    return errorResponse("AWAY_TEAM_NOT_FOUND", "Away team was not found in this league.", 404);
  }

  const updated = await prisma.baltikaFixture.update({
    where: { id: fixture.id },
    data: {
      homeTeamId,
      awayTeamId,
      homeTeamName: homeTeam?.name ?? String(body.homeTeamName ?? fixture.homeTeamName),
      awayTeamName: awayTeam?.name ?? stringOrNull(body.awayTeamName),
      roundNumber: integerOrNull(body.roundNumber),
      kickoffAt: dateOrNull(body.kickoffAt),
      source: fixture.source === "WYSCOUT_TEAM_STATS" ? fixture.source : "MANUAL"
    }
  });
  const scoringModel = await getActiveScoringModel();
  await recalculateBaltikaTeamSnapshots(
    prisma,
    [fixture.homeTeamId, fixture.awayTeamId, updated.homeTeamId, updated.awayTeamId].filter((value): value is string => Boolean(value)),
    fixture.seasonId,
    scoringModel
  );

  return NextResponse.json({ fixture: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const fixture = await prisma.baltikaFixture.findUnique({ where: { id: params.fixtureId } });
  if (!fixture) return errorResponse("FIXTURE_NOT_FOUND", "Fixture not found.", 404);

  await prisma.baltikaFixture.delete({ where: { id: fixture.id } });
  const scoringModel = await getActiveScoringModel();
  await recalculateBaltikaTeamSnapshots(
    prisma,
    [fixture.homeTeamId, fixture.awayTeamId].filter((value): value is string => Boolean(value)),
    fixture.seasonId,
    scoringModel
  );
  return NextResponse.json({ ok: true });
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
