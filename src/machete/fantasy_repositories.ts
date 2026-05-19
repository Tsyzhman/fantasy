import { Prisma, type PrismaClient } from "@prisma/client";

export class FantasyPointsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getRuleset(rulesetId: bigint) {
    return this.prisma.fantasyRuleset.findUnique({
      where: { id: rulesetId }
    });
  }

  async getMatchPlayerStats(matchId: bigint) {
    return this.prisma.matchPlayerStat.findMany({
      where: { matchId },
      include: {
        match: {
          select: {
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true
          }
        }
      },
      orderBy: { playerId: "asc" }
    });
  }

  async upsertPlayerPoints(input: {
    matchId: bigint;
    playerId: bigint;
    teamId: bigint | null;
    rulesetId: bigint;
    points: number;
    minutes: number | null;
    breakdown: Array<{ category: string; value: number | null; points: number }>;
  }) {
    await this.prisma.fantasyPoint.upsert({
      where: {
        matchId_playerId_rulesetId: {
          matchId: input.matchId,
          playerId: input.playerId,
          rulesetId: input.rulesetId
        }
      },
      update: {
        teamId: input.teamId,
        points: input.points,
        minutes: input.minutes
      },
      create: {
        matchId: input.matchId,
        playerId: input.playerId,
        teamId: input.teamId,
        rulesetId: input.rulesetId,
        points: input.points,
        minutes: input.minutes
      }
    });

    await this.prisma.fantasyPointBreakdown.deleteMany({
      where: {
        matchId: input.matchId,
        playerId: input.playerId,
        rulesetId: input.rulesetId
      }
    });

    if (input.breakdown.length > 0) {
      await this.prisma.fantasyPointBreakdown.createMany({
        data: input.breakdown.map((row) => ({
          matchId: input.matchId,
          playerId: input.playerId,
          rulesetId: input.rulesetId,
          category: row.category,
          value: row.value,
          points: row.points
        })),
        skipDuplicates: true
      });
    }
  }

  async createRuleset(input: { name: string; version: string; rules: unknown }) {
    return this.prisma.fantasyRuleset.upsert({
      where: {
        name_version: {
          name: input.name,
          version: input.version
        }
      },
      update: {
        rules: jsonValue(input.rules)
      },
      create: {
        name: input.name,
        version: input.version,
        rules: jsonValue(input.rules)
      }
    });
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}
