import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  addPromotedTeamStrengthProfiles,
  buildTeamStrengthProfilesFromMatches,
  fillTeamStrengthStatsFromScore,
  fixtureDifficultyFromMultipliers,
  fixtureOddsAreFresh,
  fixtureStrengthProjection,
  fixtureStrengthWithBookmaker
} from "../src/machete/squad_planner";

loadDotEnv();

void main().catch((error) => {
  console.error("[fixture-difficulty] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured.");

  const leagueId = BigInt(argument("--league") ?? "63");
  const season = argument("--season") ?? "2026/2027";
  const requestedTeam = argument("--team") ?? "Baltika";
  const teamNeedle = ({
    "балтика": "baltika",
    "родина": "rodina",
    "факел": "fakel",
    "зенит": "zenit"
  }[requestedTeam.toLocaleLowerCase("ru-RU")] ?? requestedTeam).toLocaleLowerCase("ru-RU");
  const limit = Math.max(1, Number(argument("--limit") ?? "5"));
  const feederLeagueId = leagueId === 63n ? 338n : null;
  const prisma = new PrismaClient();

  try {
    const seasonTeams = await prisma.leagueSeasonTeam.findMany({
      where: { leagueId, season, active: true },
      include: { team: { select: { id: true, name: true } } }
    });
    const team = seasonTeams.find((row) => row.team.name.toLocaleLowerCase("ru-RU").includes(teamNeedle))?.team;
    if (!team) throw new Error(`Team ${teamNeedle} is not active in ${leagueId}:${season}.`);

    const [strengthMatches, feederMatches, fixtures] = await Promise.all([
      loadStrengthMatches(prisma, leagueId),
      feederLeagueId ? loadStrengthMatches(prisma, feederLeagueId) : Promise.resolve([]),
      prisma.coreMatch.findMany({
        where: {
          leagueId,
          season,
          finished: false,
          cancelled: false,
          OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }]
        },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          oddsSnapshots: {
            where: { provider: "FONBET", status: "AVAILABLE" },
            orderBy: { fetchedAt: "desc" },
            take: 1
          }
        },
        orderBy: [{ matchDate: "asc" }, { id: "asc" }],
        take: limit
      })
    ]);

    let profiles = buildTeamStrengthProfilesFromMatches(strengthMatches);
    if (feederMatches.length > 0) {
      profiles = addPromotedTeamStrengthProfiles(profiles, buildTeamStrengthProfilesFromMatches(feederMatches, { fallbackToGoals: true }));
    }

    const rows = fixtures.map((fixture) => {
      const isHome = fixture.homeTeamId === team.id;
      const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
      const projection = fixtureStrengthProjection(
        {
          teamId: String(team.id),
          opponentTeamId: opponentId ? String(opponentId) : null,
          side: isHome ? "H" : "A"
        },
        profiles
      );
      const odds = fixture.oddsSnapshots[0];
      const freshOdds = odds && fixtureOddsAreFresh(odds.fetchedAt) ? odds : null;
      const marketProjection = fixtureStrengthWithBookmaker(projection, {
        teamOver15Probability: isHome ? freshOdds?.homeOver15Probability : freshOdds?.awayOver15Probability,
        cleanSheetProbability: isHome ? freshOdds?.homeCleanSheetProbability : freshOdds?.awayCleanSheetProbability
      });
      const difficultyFixture = { ...marketProjection, side: isHome ? "H" as const : "A" as const };

      return {
        round: fixture.round,
        date: fixture.matchDate?.toISOString() ?? null,
        side: difficultyFixture.side,
        opponent: isHome ? fixture.awayTeam?.name : fixture.homeTeam?.name,
        projectedXg: rounded(projection.projectedXg),
        projectedXga: rounded(projection.projectedXga),
        blendedXg: rounded(marketProjection.marketProjectedXg),
        blendedXga: rounded(marketProjection.marketProjectedXga),
        attackMultiplier: rounded(marketProjection.attackMultiplier),
        defenseMultiplier: rounded(marketProjection.defenseMultiplier),
        difficultyGkDef: fixtureDifficultyFromMultipliers(difficultyFixture, "DEF"),
        difficultyMidFwd: fixtureDifficultyFromMultipliers(difficultyFixture, "MID")
      };
    });

    console.log(JSON.stringify({ leagueId: String(leagueId), season, team: team.name, rows }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function loadStrengthMatches(prisma: PrismaClient, leagueId: bigint) {
  const matches = await prisma.coreMatch.findMany({
    where: { leagueId, finished: true, cancelled: false },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    take: 600,
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      matchDate: true,
      teamStats: {
        select: { teamId: true, opponentTeamId: true, isHome: true, xg: true, goals: true }
      }
    }
  });

  return matches.map((match) => fillTeamStrengthStatsFromScore({
    homeTeamId: match.homeTeamId ? String(match.homeTeamId) : null,
    awayTeamId: match.awayTeamId ? String(match.awayTeamId) : null,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    matchDate: match.matchDate,
    teamStats: match.teamStats.map((stat) => ({
      teamId: String(stat.teamId),
      opponentTeamId: stat.opponentTeamId ? String(stat.opponentTeamId) : null,
      isHome: stat.isHome,
      xg: stat.xg,
      goals: stat.goals
    }))
  }));
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function rounded(value: number | null) {
  return value === null ? null : Math.round(value * 1_000) / 1_000;
}

function loadDotEnv() {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
