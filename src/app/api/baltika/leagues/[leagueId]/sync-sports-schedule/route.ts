import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSportsRuCalendarSource, fetchSportsRuCalendarFixtures } from "@/lib/providers/sports-ru-calendar";
import { getActiveScoringModel } from "@/lib/scoring";
import { recalculateBaltikaTeamSnapshots } from "@/lib/scoring/baltika-team-form-metrics";
import { normalizeName } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    leagueId: string;
  }>;
};

export const POST = withApiHandler(async (_request: Request, { params }: Params) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: true
    }
  });

  if (!league) return errorResponse("LEAGUE_NOT_FOUND", "League not found.", 404);

  const season = league.seasons[0];
  if (!season) return errorResponse("SEASON_NOT_FOUND", "Create a season before syncing schedule.", 400);

  const source = getSportsRuCalendarSource(league.id);
  if (!source) {
    return errorResponse("SPORTS_RU_SOURCE_NOT_CONFIGURED", "Sports.ru schedule source is not configured for this league.", 400);
  }

  const teamMatcher = createTeamMatcher(league.teams);
  const fixtures = await fetchSportsRuCalendarFixtures(source);
  let fixturesSaved = 0;
  const unmatchedTeams = new Set<string>();

  for (const fixture of fixtures) {
    const homeTeam = teamMatcher(fixture.homeTeamName);
    const awayTeam = teamMatcher(fixture.awayTeamName);
    if (!homeTeam) unmatchedTeams.add(fixture.homeTeamName);
    if (!awayTeam) unmatchedTeams.add(fixture.awayTeamName);

    const existing = await prisma.baltikaFixture.findFirst({
      where: {
        leagueId: league.id,
        seasonId: season.id,
        homeTeamName: fixture.homeTeamName,
        awayTeamName: fixture.awayTeamName,
        roundNumber: fixture.roundNumber
      }
    });

    const status = fixture.homeScore === null || fixture.awayScore === null ? "SCHEDULED" : "PLAYED";
    const data = {
      leagueId: league.id,
      seasonId: season.id,
      homeTeamId: homeTeam?.id ?? null,
      awayTeamId: awayTeam?.id ?? null,
      homeTeamName: fixture.homeTeamName,
      awayTeamName: fixture.awayTeamName,
      roundNumber: fixture.roundNumber,
      kickoffAt: fixture.kickoffAt,
      status,
      source: "SPORTS_RU",
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore
    };

    if (existing) {
      await prisma.baltikaFixture.update({
        where: { id: existing.id },
        data
      });
    } else {
      await prisma.baltikaFixture.create({ data });
    }

    fixturesSaved += 1;
  }

  const scoringModel = await getActiveScoringModel();
  const snapshotsRecalculated = await recalculateBaltikaTeamSnapshots(
    prisma,
    league.teams.map((team) => team.id),
    season.id,
    scoringModel
  );

  return NextResponse.json({
    fixturesFetched: fixtures.length,
    fixturesSaved,
    unmatchedTeams: Array.from(unmatchedTeams),
    snapshotsRecalculated,
    source: source.fantasyUrl
  });
});

type TeamMatcherTeam = {
  id: string;
  name: string;
  aliases: string[];
};

function createTeamMatcher(teams: TeamMatcherTeam[]) {
  const teamsByName = new Map<string, TeamMatcherTeam>();
  for (const team of teams) {
    teamsByName.set(normalizeName(team.name), team);
    for (const alias of team.aliases) {
      teamsByName.set(normalizeName(alias), team);
    }
  }

  return (name: string) => teamsByName.get(normalizeName(name)) ?? null;
}

function errorResponse(code: string, message: string, status: number) {
  return jsonError(code, message, status);
}
