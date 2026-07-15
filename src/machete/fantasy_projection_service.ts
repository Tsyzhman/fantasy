import type { PrismaClient } from "@prisma/client";

import type { ActiveScoringModel } from "@/lib/scoring";

import { buildFantasyBacktestObservations, runFantasyBacktest } from "./fantasy_backtest";
import { fitFantasyProjectionCalibration, type FantasyProjectionCalibrationModel } from "./fantasy_projection_calibration";

export type LoadedFantasyProjectionCalibration = {
  model: FantasyProjectionCalibrationModel;
  trainingSeason: string;
  trainingMatches: number;
  trainingSamples: number;
  trainedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  promise: Promise<LoadedFantasyProjectionCalibration | null>;
};

const calibrationCache = new Map<string, CacheEntry>();
const calibrationCacheMilliseconds = 6 * 60 * 60 * 1000;
const minimumTrainingMatches = 100;

export async function loadFantasyProjectionCalibration(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    currentSeason: string;
    scoringModel: ActiveScoringModel;
    modelCacheKey: string;
  }
) {
  const cacheKey = `${input.leagueId}:${input.currentSeason}:${input.modelCacheKey}`;
  const now = Date.now();
  const cached = calibrationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = buildFantasyProjectionCalibration(prisma, input);
  calibrationCache.set(cacheKey, { expiresAt: now + calibrationCacheMilliseconds, promise });
  try {
    const result = await promise;
    if (!result) calibrationCache.delete(cacheKey);
    return result;
  } catch (error) {
    calibrationCache.delete(cacheKey);
    throw error;
  }
}

async function buildFantasyProjectionCalibration(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    currentSeason: string;
    scoringModel: ActiveScoringModel;
  }
): Promise<LoadedFantasyProjectionCalibration | null> {
  const seasonRows = await prisma.coreMatch.findMany({
    where: {
      leagueId: input.leagueId,
      finished: true,
      cancelled: false,
      matchDate: { not: null },
      season: { not: null }
    },
    select: { season: true, matchDate: true },
    distinct: ["season"],
    orderBy: { matchDate: "desc" },
    take: 6
  });
  const seasonCandidates = uniqueStrings([
    ...seasonRows.map((row) => row.season).filter((season): season is string => Boolean(season && season !== input.currentSeason)),
    ...seasonRows.map((row) => row.season).filter((season): season is string => Boolean(season === input.currentSeason))
  ]);

  for (const trainingSeason of seasonCandidates) {
    const matches = await prisma.coreMatch.findMany({
      where: {
        leagueId: input.leagueId,
        season: trainingSeason,
        finished: true,
        cancelled: false,
        matchDate: { not: null }
      },
      include: { playerStats: true, teamStats: true },
      orderBy: [{ matchDate: "asc" }, { id: "asc" }]
    });
    const competitionMatches = matches.filter((match) => match.status !== "SEASON_AGGREGATE");
    if (competitionMatches.length < minimumTrainingMatches) continue;

    const observations = buildFantasyBacktestObservations(competitionMatches);
    const raw = runFantasyBacktest(observations, input.scoringModel);
    if (raw.samples.length === 0) continue;
    const model = fitFantasyProjectionCalibration(raw.samples);
    return {
      model,
      trainingSeason,
      trainingMatches: competitionMatches.length,
      trainingSamples: raw.samples.length,
      trainedAt: new Date().toISOString()
    };
  }

  return null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
