import type { Prisma, PrismaClient } from "@prisma/client";

import { calculateAlternativeScore, calculateFantasyScore, calculateScoringScore, calculateValueScore, getActiveScoringModel, getActiveScoringModelForSource } from ".";
import type { ScoringModelSource } from ".";
import { buildBaltikaTeamFormulaMetrics } from "./baltika-team-form-metrics";

const batchSize = 500;

export async function recalculateSnapshotsForSource(prisma: PrismaClient, source: ScoringModelSource) {
  return source === "MACHETE" ? recalculateMacheteSnapshots(prisma) : recalculateWyscoutSnapshots(prisma);
}

async function recalculateWyscoutSnapshots(prisma: PrismaClient) {
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

  return recalculated;
}

async function recalculateMacheteSnapshots(prisma: PrismaClient) {
  const scoringModel = await getActiveScoringModelForSource("MACHETE");
  let cursor: string | undefined;
  let recalculated = 0;

  while (true) {
    const snapshots = await prisma.machetePlayerSnapshot.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        rawMetrics: true,
        position: true,
        minutesPlayed: true
      }
    });

    if (snapshots.length === 0) break;

    const updates = snapshots.map((snapshot) => {
      const rawMetrics = objectMetrics(snapshot.rawMetrics);
      const positionGroup = machetePositionGroup(snapshot.position);
      const fantasyScore = calculateFantasyScore(rawMetrics, positionGroup, scoringModel);
      const scoringScore = calculateScoringScore(rawMetrics, positionGroup, scoringModel);
      const alternativeScore = calculateAlternativeScore(rawMetrics, positionGroup, scoringModel);

      return prisma.machetePlayerSnapshot.update({
        where: { id: snapshot.id },
        data: {
          fantasyScore,
          scoringScore,
          alternativeScore,
          valueScore: snapshot.minutesPlayed > 0 ? Number((fantasyScore / (snapshot.minutesPlayed / 90)).toFixed(2)) : null
        }
      });
    });

    await prisma.$transaction(updates);
    recalculated += snapshots.length;
    cursor = snapshots[snapshots.length - 1]?.id;
  }

  return recalculated;
}

function objectMetrics(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}
