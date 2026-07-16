import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getActiveScoringModelBundleForSource } from "@/lib/scoring";

import { evaluateFantasyDataQuality, isBasicPlayerStatComplete, type BasicPlayerStatInput } from "./data_quality";
import { stableFantasyModelConfiguration } from "./fantasy_backtest";
import { FANTASY_PROJECTION_CALIBRATION, fantasyProjectionCalibrationConfiguration } from "./fantasy_projection_calibration";
import { loadSharedMachetePlayerRows } from "./shared_read_model";

export type FantasyDataQualityAuditOptions = {
  leagueId: bigint;
  season: string;
  coveragePercent?: number;
  maximumLatencyHours?: number;
  persist?: boolean;
};

export type FantasyDataQualityAuditReport = {
  generatedAt: string;
  runId: string | null;
  scope: {
    leagueId: string;
    season: string;
  };
  model: {
    name: string;
    version: string;
    hash: string;
    fallback: "DIRECT" | "WYSCOUT" | "SEED";
  };
  quality: ReturnType<typeof evaluateFantasyDataQuality>;
};

export async function runFantasyDataQualityAudit(
  prisma: PrismaClient,
  options: FantasyDataQualityAuditOptions
): Promise<FantasyDataQualityAuditReport> {
  const coveragePercent = validCoveragePercent(options.coveragePercent ?? 98);
  const maximumLatencyHours = validPositiveNumber(options.maximumLatencyHours ?? 6, "maximumLatencyHours");
  const season = options.season.trim();
  if (!season) throw new Error("season must not be empty.");

  const modelBundle = await getActiveScoringModelBundleForSource("MACHETE", prisma);
  const modelConfiguration = {
    scoring: stableFantasyModelConfiguration(modelBundle.model),
    projectionCalibration: fantasyProjectionCalibrationConfiguration()
  };
  const modelHash = createHash("sha256").update(JSON.stringify(modelConfiguration)).digest("hex");
  const modelVersion = `${modelBundle.identity.configuredModelSource}:${modelBundle.identity.configuredModelId ?? "built-in"}:v${modelBundle.identity.configuredModelVersion}+${FANTASY_PROJECTION_CALIBRATION.featureVersion}`;
  let runId: string | null = null;

  try {
    if (options.persist !== false) {
      const run = await prisma.dataQualityAuditRun.create({
        data: {
          leagueId: options.leagueId,
          season,
          modelVersion,
          modelHash,
          coverageThreshold: coveragePercent,
          maximumLatencyHours
        }
      });
      runId = run.id;
    }

    const [rosterRows, rawMatches] = await Promise.all([
      prisma.teamPlayerSeason.findMany({
        where: {
          leagueId: options.leagueId,
          season,
          active: true
        },
        include: {
          player: { select: { name: true } },
          team: { select: { name: true } }
        },
        orderBy: [{ team: { name: "asc" } }, { player: { name: "asc" } }]
      }),
      prisma.coreMatch.findMany({
        where: {
          leagueId: options.leagueId,
          season,
          finished: true,
          cancelled: false
        },
        include: {
          playerStats: true
        },
        orderBy: [{ matchDate: "asc" }, { id: "asc" }]
      })
    ]);
    const matches = rawMatches.filter((match) => match.status !== "SEASON_AGGREGATE");
    const teamIds = [...new Set(rosterRows.map((row) => row.teamId.toString()))].map(BigInt);
    const projectedRows = await loadSharedMachetePlayerRows(prisma, {
      scopes: teamIds.map((teamId) => ({ leagueId: options.leagueId, season, teamId })),
      matchWindow: { kind: "last", matches: 5 },
      fallbackToRecentPlayerHistory: true,
      scoringModel: modelBundle.model
    });
    const projectedByPlayerTeam = new Map<string, (typeof projectedRows)[number]>(
      projectedRows.map((row) => {
        const parts = row.id.split(":");
        return [`${parts[2] ?? ""}:${parts[3] ?? ""}`, row] as const;
      })
    );
    const rosterPositionByPlayerTeam = new Map(rosterRows.map((row) => [`${String(row.teamId)}:${String(row.playerId)}`, row.position]));
    const statRows: BasicPlayerStatInput[] = [];
    const playerKeysWithBasicStats = new Set<string>();

    for (const match of matches) {
      for (const stat of match.playerStats) {
        const key = stat.teamId ? `${String(stat.teamId)}:${String(stat.playerId)}` : null;
        const basicStat = toBasicStat(stat, (key ? rosterPositionByPlayerTeam.get(key) : null) ?? null);
        statRows.push(basicStat);
        if (key && isBasicPlayerStatComplete(basicStat)) playerKeysWithBasicStats.add(key);
      }
    }

    const candidates = rosterRows.map((row) => {
      const playerKey = `${String(row.teamId)}:${String(row.playerId)}`;
      const projected = projectedByPlayerTeam.get(playerKey);
      return {
        playerKey,
        playerName: row.player.name,
        teamName: row.team.name,
        position: row.position ?? projected?.position ?? null,
        matchesPlayed: projected?.matchesPlayed ?? 0,
        fantasyScore: projected?.fantasyScore ?? null,
        expectedMinutes: projected?.expectedMinutes ?? null,
        forecastConfidence: projected?.forecastConfidence ?? null,
        dataUpdatedAt: projected?.dataUpdatedAt ?? null,
        hasBasicStats: projected?.hasBasicStats === true || playerKeysWithBasicStats.has(playerKey)
      };
    });
    const matchCoverage = matches.map((match) => ({
      matchId: String(match.id),
      hasPlayerStats: match.playerStats.length > 0,
      rawReceivedAt: match.rawReceivedAt,
      normalizedAt: match.normalizedAt
    }));
    const quality = evaluateFantasyDataQuality(candidates, matchCoverage, statRows, {
      coveragePercent,
      maximumPromotionLatencyHours: maximumLatencyHours
    });
    const report: FantasyDataQualityAuditReport = {
      generatedAt: new Date().toISOString(),
      runId,
      scope: {
        leagueId: String(options.leagueId),
        season
      },
      model: {
        name: modelBundle.identity.configuredModelName,
        version: modelVersion,
        hash: modelHash,
        fallback: modelBundle.identity.fallback
      },
      quality
    };

    if (runId) {
      await prisma.dataQualityAuditRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          activePlayers: quality.forecasts.activePlayers,
          forecastsAvailable: quality.forecasts.available,
          forecastCoverage: quality.forecasts.coveragePercent,
          playersWithBasicStats: quality.players.withBasicStats,
          playerDataCoverage: quality.players.coveragePercent,
          finishedMatches: quality.matches.finishedMatches,
          matchesWithPlayerStats: quality.matches.withPlayerStats,
          matchDataCoverage: quality.matches.coveragePercent,
          statRows: quality.statRows.total,
          completeStatRows: quality.statRows.complete,
          statRowCoverage: quality.statRows.coveragePercent,
          matchesPromotedInTime: quality.matches.promotedWithinLimit,
          promotionLatencyCoverage: quality.matches.promotionLatencyCoveragePercent,
          gatePassed: quality.betaGate.passed,
          report: report as unknown as Prisma.InputJsonValue,
          completedAt: new Date()
        }
      });
    }

    return report;
  } catch (error) {
    if (runId) {
      await prisma.dataQualityAuditRun
        .update({
          where: { id: runId },
          data: {
            status: "FAILED",
            error: errorMessage(error).slice(0, 4000),
            completedAt: new Date()
          }
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

function toBasicStat(stat: Prisma.MatchPlayerStatGetPayload<Record<string, never>>, fallbackPosition: string | null): BasicPlayerStatInput {
  return {
    position: stat.position ?? fallbackPosition,
    minutes: stat.minutes,
    started: stat.started,
    substitutedIn: stat.substitutedIn,
    rating: stat.rating,
    goals: stat.goals,
    assists: stat.assists,
    xg: stat.xg,
    xa: stat.xa,
    shots: stat.shots,
    shotsOnTarget: stat.shotsOnTarget,
    keyPasses: stat.keyPasses,
    tacklesWon: stat.tacklesWon,
    interceptions: stat.interceptions,
    clearances: stat.clearances,
    recoveries: stat.recoveries,
    saves: stat.saves,
    goalsConceded: stat.goalsConceded
  };
}

function validCoveragePercent(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`coveragePercent must be between 0 and 100; received ${value}.`);
  return value;
}

function validPositiveNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number; received ${value}.`);
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
