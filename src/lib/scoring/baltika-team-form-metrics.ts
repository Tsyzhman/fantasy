import type { Prisma, PrismaClient } from "@prisma/client";

import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateValueScore,
  type ActiveScoringModel
} from "@/lib/scoring";

type TeamStat = {
  side: string;
  xg: number | null;
  xga: number | null;
};

type TeamAverages = {
  home: AverageBlock;
  away: AverageBlock;
  overall: AverageBlock;
};

type AverageBlock = {
  matches: number;
  xg: number;
  xga: number;
  xgPerMatch: number;
  xgaPerMatch: number;
};

export async function buildBaltikaTeamFormulaMetrics(
  prisma: PrismaClient,
  teamId: string,
  seasonId: string
): Promise<Record<string, number>> {
  const [stats, upcomingFixtures] = await Promise.all([
    prisma.baltikaTeamMatchStat.findMany({
      where: {
        teamId,
        fixture: { seasonId }
      },
      select: {
        side: true,
        xg: true,
        xga: true
      }
    }),
    prisma.baltikaFixture.findMany({
      where: {
        seasonId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        NOT: [{ status: "PLAYED" }, { status: "FINISHED" }]
      },
      orderBy: [{ roundNumber: "asc" }, { kickoffAt: "asc" }],
      take: 20
    })
  ]);

  const ownAverages = averageTeamStats(stats);
  const metrics: Record<string, number> = {};
  assignAverageMetrics(metrics, "team_home", ownAverages.home);
  assignAverageMetrics(metrics, "team_away", ownAverages.away);
  assignAverageMetrics(metrics, "team_overall", ownAverages.overall);

  const nextRoundNumber = firstRoundNumber(upcomingFixtures);
  const roundFixtures = nextRoundNumber === null
    ? upcomingFixtures.slice(0, 1)
    : upcomingFixtures.filter((fixture) => fixture.roundNumber === nextRoundNumber);

  const projections = [];
  for (const fixture of roundFixtures) {
    const isHome = fixture.homeTeamId === teamId;
    const opponentTeamId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponentAverages = opponentTeamId
      ? averageTeamStats(
          await prisma.baltikaTeamMatchStat.findMany({
            where: {
              teamId: opponentTeamId,
              fixture: { seasonId }
            },
            select: {
              side: true,
              xg: true,
              xga: true
            }
          })
        )
      : emptyTeamAverages();

    const ownSide = isHome ? ownAverages.home : ownAverages.away;
    const opponentSide = isHome ? opponentAverages.away : opponentAverages.home;
    const fallbackOwn = ownSide.matches > 0 ? ownSide : ownAverages.overall;
    const fallbackOpponent = opponentSide.matches > 0 ? opponentSide : opponentAverages.overall;
    const projectedXg = averageKnown([fallbackOwn.xgPerMatch, fallbackOpponent.xgaPerMatch]);
    const projectedXga = averageKnown([fallbackOwn.xgaPerMatch, fallbackOpponent.xgPerMatch]);

    projections.push({
      isHome,
      projectedXg,
      projectedXga,
      ownXg: fallbackOwn.xgPerMatch,
      ownXga: fallbackOwn.xgaPerMatch,
      opponentXg: fallbackOpponent.xgPerMatch,
      opponentXga: fallbackOpponent.xgaPerMatch
    });
  }

  const firstProjection = projections[0];
  metrics.next_fixture_count = projections.length > 0 ? 1 : 0;
  metrics.round_fixture_count = projections.length;
  metrics.next_round = nextRoundNumber ?? 0;
  metrics.next_is_home = firstProjection?.isHome ? 1 : 0;
  metrics.next_is_away = firstProjection ? (firstProjection.isHome ? 0 : 1) : 0;
  metrics.next_team_xg_per_match = round(firstProjection?.ownXg ?? 0);
  metrics.next_team_xga_per_match = round(firstProjection?.ownXga ?? 0);
  metrics.next_opponent_xg_per_match = round(firstProjection?.opponentXg ?? 0);
  metrics.next_opponent_xga_per_match = round(firstProjection?.opponentXga ?? 0);
  metrics.next_projected_xg = round(firstProjection?.projectedXg ?? 0);
  metrics.next_projected_xga = round(firstProjection?.projectedXga ?? 0);
  metrics.round_projected_xg = round(sum(projections.map((projection) => projection.projectedXg)));
  metrics.round_projected_xga = round(sum(projections.map((projection) => projection.projectedXga)));
  metrics.round_projected_xg_avg = round(averageKnown(projections.map((projection) => projection.projectedXg)));
  metrics.round_projected_xga_avg = round(averageKnown(projections.map((projection) => projection.projectedXga)));

  return metrics;
}

export async function recalculateBaltikaTeamSnapshots(
  prisma: PrismaClient,
  teamIds: string[],
  seasonId: string,
  scoringModel: ActiveScoringModel
) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
  let recalculated = 0;

  for (const teamId of uniqueTeamIds) {
    const teamMetrics = await buildBaltikaTeamFormulaMetrics(prisma, teamId, seasonId);
    const snapshots = await prisma.playerSnapshot.findMany({
      where: {
        teamId,
        seasonId,
        teamImport: {
          status: "PUBLISHED",
          isCurrentPublished: true
        }
      },
      select: {
        id: true,
        rawMetrics: true,
        positionGroup: true,
        marketValue: true
      }
    });

    await prisma.$transaction(
      snapshots.map((snapshot) => {
        const rawMetrics = {
          ...objectMetrics(snapshot.rawMetrics),
          ...teamMetrics
        };
        const fantasyScore = calculateFantasyScore(rawMetrics, snapshot.positionGroup, scoringModel);
        const alternativeScore = calculateAlternativeScore(rawMetrics, snapshot.positionGroup, scoringModel);
        const valueScore = calculateValueScore(fantasyScore, snapshot.marketValue);

        return prisma.playerSnapshot.update({
          where: { id: snapshot.id },
          data: {
            rawMetrics: rawMetrics as Prisma.InputJsonValue,
            fantasyScore,
            alternativeScore,
            valueScore
          }
        });
      })
    );

    recalculated += snapshots.length;
  }

  return recalculated;
}

function averageTeamStats(stats: TeamStat[]): TeamAverages {
  return {
    home: averageBlock(stats.filter((stat) => stat.side === "HOME")),
    away: averageBlock(stats.filter((stat) => stat.side === "AWAY")),
    overall: averageBlock(stats)
  };
}

function averageBlock(stats: TeamStat[]): AverageBlock {
  const xgValues = stats.map((stat) => stat.xg).filter(isNumber);
  const xgaValues = stats.map((stat) => stat.xga).filter(isNumber);
  const xg = sum(xgValues);
  const xga = sum(xgaValues);
  const matches = Math.max(xgValues.length, xgaValues.length);

  return {
    matches,
    xg: round(xg),
    xga: round(xga),
    xgPerMatch: matches > 0 ? round(xg / matches) : 0,
    xgaPerMatch: matches > 0 ? round(xga / matches) : 0
  };
}

function assignAverageMetrics(metrics: Record<string, number>, prefix: string, block: AverageBlock) {
  metrics[`${prefix}_matches`] = block.matches;
  metrics[`${prefix}_xg`] = block.xg;
  metrics[`${prefix}_xga`] = block.xga;
  metrics[`${prefix}_xg_per_match`] = block.xgPerMatch;
  metrics[`${prefix}_xga_per_match`] = block.xgaPerMatch;
}

function emptyTeamAverages(): TeamAverages {
  return {
    home: averageBlock([]),
    away: averageBlock([]),
    overall: averageBlock([])
  };
}

function firstRoundNumber(fixtures: Array<{ roundNumber: number | null }>) {
  const round = fixtures.find((fixture) => fixture.roundNumber !== null)?.roundNumber;
  return round ?? null;
}

function objectMetrics(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function averageKnown(values: number[]) {
  const known = values.filter((value) => Number.isFinite(value) && value > 0);
  if (known.length === 0) return 0;
  return sum(known) / known.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
