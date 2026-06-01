import { prisma } from "../src/lib/db";
import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  calculateValueScore,
  getActiveScoringModel
} from "../src/lib/scoring";
import { buildBaltikaTeamFormulaMetrics } from "../src/lib/scoring/baltika-team-form-metrics";
import { playerSnapshotScoringMetrics } from "../src/lib/players/derived-metrics";

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
        positionGroup: true,
        marketValue: true,
        teamId: true,
        seasonId: true,
        matchesPlayed: true,
        minutesPlayed: true,
        goals: true,
        xg: true,
        assists: true,
        xa: true,
        fantasyAssists: true,
        cleanSheets: true,
        saves: true,
        penaltySaves: true,
        recoveries: true,
        penaltiesConceded: true,
        missedPenalties: true,
        ownGoals: true,
        goalsConceded: true,
        shotsOnTarget: true,
        keyPasses: true,
        tacklesWon: true,
        interceptions: true,
        clearances: true,
        yellowCards: true,
        redCards: true,
        averageRating: true
      }
    });

    if (snapshots.length === 0) break;

    const updates = [];
    for (const snapshot of snapshots) {
      const teamMetrics = await buildBaltikaTeamFormulaMetrics(prisma, snapshot.teamId, snapshot.seasonId);
      const rawMetrics = playerSnapshotScoringMetrics(snapshot, teamMetrics);
      const fantasyScore = calculateFantasyScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const scoringScore = calculateScoringScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const alternativeScore = calculateAlternativeScore(rawMetrics, snapshot.positionGroup, scoringModel);
      const valueScore = calculateValueScore(fantasyScore, snapshot.marketValue);

      updates.push(
        prisma.playerSnapshot.update({
          where: { id: snapshot.id },
          data: {
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
