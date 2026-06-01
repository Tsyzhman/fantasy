import type { PrismaClient } from "@prisma/client";

import { calculateAlternativeScore, calculateFantasyScore, calculateScoringScore, calculateValueScore, getActiveScoringModel, getActiveScoringModelForSource } from ".";
import type { ScoringModelSource } from ".";
import { buildBaltikaTeamFormulaMetrics } from "./baltika-team-form-metrics";
import { playerSnapshotScoringMetrics } from "@/lib/players/derived-metrics";
import { getMacheteAggregateMatchDenominators } from "@/scoring/machete/aggregate-match-denominator";
import { shouldIgnoreProviderSeasonStats } from "@/scoring/machete/world-cup";

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
        leagueId: true,
        teamId: true,
        position: true,
        matchesPlayed: true,
        minutesPlayed: true,
        goals: true,
        assists: true,
        shotsOnTarget: true,
        keyPasses: true,
        tackles: true,
        interceptions: true,
        saves: true,
        yellowCards: true,
        redCards: true,
        averageRating: true,
        appearances60: true,
        fullMatches: true,
        expectedMinutes: true,
        providerSeasonStatsIgnored: true
      }
    });

    if (snapshots.length === 0) break;

    const leagueIds = [...new Set(snapshots.map((snapshot) => snapshot.leagueId).filter((leagueId): leagueId is string => Boolean(leagueId)))];
    const leagueMetadata = await prisma.macheteLeague.findMany({
      where: {
        id: {
          in: leagueIds
        }
      },
      select: {
        id: true,
        providerLeagueId: true,
        season: true
      }
    });
    const leaguesById = new Map(leagueMetadata.map((league) => [league.id, league]));
    const denominatorMaps = await Promise.all(
      leagueIds.map(async (leagueId) => [
        leagueId,
        await getMacheteAggregateMatchDenominators(
          prisma,
          leagueId,
          snapshots
            .filter((snapshot) => snapshot.leagueId === leagueId)
            .map((snapshot) => snapshot.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
          leaguesById.get(leagueId)?.season
        )
      ] as const)
    );
    const denominatorsByLeague = new Map(denominatorMaps);

    const updates = snapshots.map((snapshot) => {
      const rawMetrics = macheteSnapshotScoringMetrics(snapshot);
      const league = snapshot.leagueId ? leaguesById.get(snapshot.leagueId) : null;
      const shouldIgnoreStats = shouldIgnoreProviderSeasonStats(league?.providerLeagueId, league?.season) && readMetric(rawMetrics, "minutes_played") <= 0;
      const denominator = !shouldIgnoreStats && snapshot.leagueId && snapshot.teamId ? denominatorsByLeague.get(snapshot.leagueId)?.get(snapshot.teamId) ?? 0 : 0;
      if (shouldIgnoreStats) {
        clearProviderSeasonMetrics(rawMetrics);
      } else if (denominator > readMetric(rawMetrics, "matches_played")) {
        rawMetrics.matches_played = denominator;
      }
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

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function macheteSnapshotScoringMetrics(snapshot: {
  matchesPlayed: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  keyPasses: number;
  tackles: number;
  interceptions: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  averageRating: number | null;
  appearances60: number;
  fullMatches: number;
  expectedMinutes: number | null;
  providerSeasonStatsIgnored: boolean;
}) {
  return {
    matches_played: snapshot.matchesPlayed,
    minutes_played: snapshot.minutesPlayed,
    appearances_60: snapshot.appearances60,
    full_matches: snapshot.fullMatches,
    ...(snapshot.expectedMinutes !== null ? { expected_minutes: snapshot.expectedMinutes } : {}),
    goals: snapshot.goals,
    assists: snapshot.assists,
    shots_on_target: snapshot.shotsOnTarget,
    key_passes: snapshot.keyPasses,
    tackles: snapshot.tackles,
    interceptions: snapshot.interceptions,
    saves: snapshot.saves,
    yellow_cards: snapshot.yellowCards,
    red_cards: snapshot.redCards,
    average_rating: snapshot.averageRating ?? 0,
    ...(snapshot.providerSeasonStatsIgnored ? { provider_season_stats_ignored: 1 } : {})
  };
}

function clearProviderSeasonMetrics(rawMetrics: Record<string, unknown>) {
  for (const key of [
    "matches_played",
    "minutes_played",
    "expected_minutes",
    "goals",
    "assists",
    "shots_on_target",
    "key_passes",
    "tackles",
    "interceptions",
    "saves",
    "yellow_cards",
    "red_cards",
    "average_rating"
  ]) {
    rawMetrics[key] = 0;
  }
  rawMetrics.provider_season_stats_ignored = 1;
}

function readMetric(rawMetrics: Record<string, unknown>, key: string) {
  const value = rawMetrics[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
