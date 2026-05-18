import type { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/db";
import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  calculateValueScore,
  getActiveScoringModel
} from "../src/lib/scoring";
import { buildBaltikaTeamFormulaMetrics } from "../src/lib/scoring/baltika-team-form-metrics";

const batchSize = 500;

async function main() {
  const scoringModel = await getActiveScoringModel();
  let cursor: string | undefined;
  let recalculated = 0;

  while (true) {
    const snapshots = await prisma.playerSnapshot.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        rawMetrics: true,
        positionGroup: true,
        marketValue: true,
        teamId: true,
        seasonId: true
      }
    });

    if (snapshots.length === 0) break;

    const updates = [];
    for (const snapshot of snapshots) {
      const teamMetrics = await buildBaltikaTeamFormulaMetrics(prisma, snapshot.teamId, snapshot.seasonId);
      const rawMetrics = {
        ...objectMetrics(snapshot.rawMetrics),
        ...teamMetrics
      };
      const fantasyScore = calculateFantasyScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const scoringScore = calculateScoringScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const alternativeScore = calculateAlternativeScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const valueScore = calculateValueScore(fantasyScore, snapshot.marketValue);

      updates.push(
        prisma.playerSnapshot.update({
          where: { id: snapshot.id },
          data: {
            rawMetrics: rawMetrics as Prisma.InputJsonValue,
            fantasyScore,
            scoringScore,
            alternativeScore,
            valueScore
          }
        })
      );
    }

    await prisma.$transaction(updates);

    recalculated += snapshots.length;
    cursor = snapshots[snapshots.length - 1]?.id;
  }

  console.log(`Recalculated fantasy scores for ${recalculated} player snapshots.`);
}

function objectMetrics(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
