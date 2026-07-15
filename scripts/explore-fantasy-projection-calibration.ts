import { PrismaClient } from "@prisma/client";

import { getActiveScoringModelBundleForSource } from "../src/lib/scoring";
import {
  FANTASY_BACKTEST_POSITION_GROUPS,
  buildFantasyBacktestObservations,
  runFantasyBacktest,
  summarizeFantasyBacktestSamples,
  type FantasyBacktestPositionGroup,
  type FantasyBacktestSample
} from "../src/machete/fantasy_backtest";
import {
  FANTASY_PROJECTION_CALIBRATION,
  buildFantasyBacktestHorizonSamples,
  calibrateFantasyBacktestSamples,
  fantasyBacktestHoldoutStart
} from "../src/machete/fantasy_projection_calibration";

type Options = {
  leagueId: bigint;
  season: string;
  expectedMatches: number | null;
};

type PositionState = {
  count: number;
  sum: number;
  xtx: number[][];
  xty: number[];
};

type OutcomeState = { count: number; sum: number };
type TeamGoalState = { matches: number; goalsFor: number; goalsAgainst: number; xgFor: number; xgAgainst: number };
type RidgeContext = {
  teamPosition: Map<string, OutcomeState>;
  opponentAllowed: Map<string, OutcomeState>;
  teamGoals: Map<string, TeamGoalState>;
  leagueGoals: TeamGoalState;
};

const RIDGE_FEATURES = 19;

void main().catch((error) => {
  console.error("[fantasy-calibration] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured.");

  const prisma = new PrismaClient();
  try {
    const [modelBundle, matches] = await Promise.all([
      getActiveScoringModelBundleForSource("MACHETE", prisma),
      prisma.coreMatch.findMany({
        where: {
          leagueId: options.leagueId,
          season: options.season,
          finished: true,
          cancelled: false
        },
        include: { playerStats: true, teamStats: true },
        orderBy: [{ matchDate: "asc" }, { id: "asc" }]
      })
    ]);
    const competitionMatches = matches.filter((match) => match.status !== "SEASON_AGGREGATE");
    if (options.expectedMatches !== null && competitionMatches.length !== options.expectedMatches) {
      throw new Error(`Expected ${options.expectedMatches} finished matches, found ${competitionMatches.length}.`);
    }

    const observations = buildFantasyBacktestObservations(competitionMatches);
    const rawResult = runFantasyBacktest(observations, modelBundle.model);
    const splitDate = fantasyBacktestHoldoutStart(rawResult.samples);
    const candidates: Array<{ name: string; samples: FantasyBacktestSample[] }> = [
      { name: "raw-model", samples: rawResult.samples },
      {
        name: `ridge-${FANTASY_PROJECTION_CALIBRATION.lambda}-min-${FANTASY_PROJECTION_CALIBRATION.minimumTrainingSamples}`,
        samples: calibrateFantasyBacktestSamples(rawResult.samples)
      }
    ];

    for (const rawWeight of [0, 0.25, 0.5, 0.75, 1]) {
      candidates.push({
        name: `blend-raw-${rawWeight}`,
        samples: rawResult.samples.map((sample) => ({
          ...sample,
          predictedPoints: round(sample.predictedPoints * rawWeight + sample.baselinePoints * (1 - rawWeight))
        }))
      });
      for (const priorWeight of [1, 2, 3, 5, 8, 13]) {
        candidates.push({
          name: `shrink-raw-${rawWeight}-prior-${priorWeight}`,
          samples: rollingShrinkage(rawResult.samples, rawWeight, priorWeight)
        });
      }
    }

    for (const lambda of [0.1, 1, 5, 10, 25, 50, 100, 250, 500, 1000]) {
      for (const minimumTrainingSamples of [30, 60, 120]) {
        if (lambda === FANTASY_PROJECTION_CALIBRATION.lambda && minimumTrainingSamples === FANTASY_PROJECTION_CALIBRATION.minimumTrainingSamples) continue;
        candidates.push({
          name: `ridge-${lambda}-min-${minimumTrainingSamples}`,
          samples: rollingRidge(rawResult.samples, lambda, minimumTrainingSamples)
        });
      }
    }

    const evaluatedCandidates = candidates.flatMap((candidate) => [
      candidate,
      {
        name: `${candidate.name}-vs-season`,
        samples: candidate.samples.map((sample) => ({ ...sample, baselinePoints: sample.seasonBaselinePoints }))
      }
    ]);
    const reports = evaluatedCandidates.map((candidate) => candidateReport(candidate.name, candidate.samples, splitDate));
    reports.sort(
      (left, right) =>
        right.holdoutH5PassingPositions - left.holdoutH5PassingPositions ||
        right.holdoutH5OverallRmseImprovement - left.holdoutH5OverallRmseImprovement ||
        right.holdoutPassingPositions - left.holdoutPassingPositions ||
        right.holdoutOverallRmseImprovement - left.holdoutOverallRmseImprovement ||
        right.holdoutOverallMaeImprovement - left.holdoutOverallMaeImprovement
    );

    const fixedCandidateName = `ridge-${FANTASY_PROJECTION_CALIBRATION.lambda}-min-${FANTASY_PROJECTION_CALIBRATION.minimumTrainingSamples}`;
    const fixedReport = reports.find((report) => report.name === fixedCandidateName);
    const rawReport = reports.find((report) => report.name === "raw-model");
    const fixedSamples = evaluatedCandidates.find((candidate) => candidate.name === fixedCandidateName)?.samples;
    if (!fixedReport || !rawReport || !fixedSamples) throw new Error(`Missing fixed candidate ${fixedCandidateName}.`);

    console.log(`[fantasy-calibration] ${options.leagueId} ${options.season}`);
    console.log(`[fantasy-calibration] Samples: ${rawResult.samples.length}; chronological holdout starts ${splitDate}`);
    console.log(`[fantasy-calibration] Fixed candidate selected before final holdout: ${fixedCandidateName}`);
    console.table([rawReport, fixedReport]);

    const holdout = summarizeFantasyBacktestSamples(fixedSamples.filter((sample) => sample.matchDate >= splitDate));
    const holdoutH5 = summarizeFantasyBacktestSamples(buildFantasyBacktestHorizonSamples(fixedSamples, 5).filter((sample) => sample.matchDate >= splitDate));
    console.log(`[fantasy-calibration] Final holdout candidate: ${fixedCandidateName}`);
    console.log("[fantasy-calibration] Next-observation metrics:");
    console.table(
      FANTASY_BACKTEST_POSITION_GROUPS.map((position) => ({
        position,
        ...holdout.byPosition[position]
      }))
    );
    console.log("[fantasy-calibration] Five-observation cumulative metrics:");
    console.table(
      FANTASY_BACKTEST_POSITION_GROUPS.map((position) => ({
        position,
        ...holdoutH5.byPosition[position]
      }))
    );
  } finally {
    await prisma.$disconnect();
  }
}

function rollingShrinkage(samples: FantasyBacktestSample[], rawWeight: number, priorWeight: number) {
  const states = emptyPositionStates();
  return mapByCompletedDate(samples, (sample) => {
    const state = states[sample.position];
    const source = sample.predictedPoints * rawWeight + sample.baselinePoints * (1 - rawWeight);
    const prior = state.count > 0 ? state.sum / state.count : sample.baselinePoints;
    const historyWeight = Math.max(1, sample.historyMatchIds.length);
    return clamp((source * historyWeight + prior * priorWeight) / (historyWeight + priorWeight), -5, 25);
  }, states);
}

function rollingRidge(samples: FantasyBacktestSample[], lambda: number, minimumTrainingSamples: number) {
  const states = emptyPositionStates();
  const context: RidgeContext = {
    teamPosition: new Map(),
    opponentAllowed: new Map(),
    teamGoals: new Map(),
    leagueGoals: { matches: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 }
  };
  const ordered = [...samples].sort((left, right) => left.matchDate.localeCompare(right.matchDate) || left.matchId.localeCompare(right.matchId));
  const result: FantasyBacktestSample[] = [];

  for (let index = 0; index < ordered.length; ) {
    const date = ordered[index].matchDate.slice(0, 10);
    const batch: Array<{ original: FantasyBacktestSample; predicted: FantasyBacktestSample; features: number[] }> = [];
    while (index < ordered.length && ordered[index].matchDate.slice(0, 10) === date) {
      const sample = ordered[index];
      const state = states[sample.position];
      const features = ridgeFeatures(sample, state, context);
      let predictedPoints: number;
      if (state.count < minimumTrainingSamples) {
        const prior = positionMean(state, sample.baselinePoints);
        const historyWeight = Math.max(1, sample.historyMatchIds.length);
        predictedPoints = (sample.predictedPoints * historyWeight + prior * 3) / (historyWeight + 3);
      } else {
        const coefficients = solveRidge(state.xtx, state.xty, lambda);
        predictedPoints = coefficients ? dot(coefficients, features) : sample.predictedPoints;
      }
      batch.push({
        original: sample,
        predicted: { ...sample, predictedPoints: round(clamp(predictedPoints, -5, 25)) },
        features
      });
      index += 1;
    }
    result.push(...batch.map((row) => row.predicted));
    for (const row of batch) updateRidgeState(states[row.original.position], row.features, row.original.actualPoints);
    updateContext(context, batch.map((row) => row.original));
  }

  return result;
}

function mapByCompletedDate(
  samples: FantasyBacktestSample[],
  predict: (sample: FantasyBacktestSample) => number,
  states: Record<FantasyBacktestPositionGroup, PositionState>
) {
  const ordered = [...samples].sort((left, right) => left.matchDate.localeCompare(right.matchDate) || left.matchId.localeCompare(right.matchId));
  const result: FantasyBacktestSample[] = [];
  for (let index = 0; index < ordered.length; ) {
    const date = ordered[index].matchDate.slice(0, 10);
    const originals: FantasyBacktestSample[] = [];
    const batch: FantasyBacktestSample[] = [];
    while (index < ordered.length && ordered[index].matchDate.slice(0, 10) === date) {
      const sample = ordered[index];
      originals.push(sample);
      batch.push({ ...sample, predictedPoints: round(predict(sample)) });
      index += 1;
    }
    result.push(...batch);
    for (const sample of originals) {
      const state = states[sample.position];
      state.count += 1;
      state.sum += sample.actualPoints;
    }
  }
  return result;
}

function updateRidgeState(state: PositionState, features: number[], actualPoints: number) {
  state.count += 1;
  state.sum += actualPoints;
  for (let row = 0; row < RIDGE_FEATURES; row += 1) {
    state.xty[row] += features[row] * actualPoints;
    for (let column = 0; column < RIDGE_FEATURES; column += 1) {
      state.xtx[row][column] += features[row] * features[column];
    }
  }
}

function ridgeFeatures(sample: FantasyBacktestSample, state: PositionState, context: RidgeContext) {
  const positionPrior = positionMean(state, sample.baselinePoints);
  const teamPosition = context.teamPosition.get(teamPositionKey(sample.teamId, sample.position));
  const opponentAllowed = sample.opponentTeamId ? context.opponentAllowed.get(teamPositionKey(sample.opponentTeamId, sample.position)) : null;
  const leagueGoals = goalRates(context.leagueGoals, 1.35, 1.35);
  const teamGoals = goalRates(context.teamGoals.get(sample.teamId), leagueGoals.for, leagueGoals.against);
  const opponentGoals = goalRates(sample.opponentTeamId ? context.teamGoals.get(sample.opponentTeamId) : undefined, leagueGoals.for, leagueGoals.against);
  const expectedGoalsFor = (teamGoals.for + opponentGoals.against) / 2;
  const expectedGoalsAgainst = (teamGoals.against + opponentGoals.for) / 2;
  const expectedXgFor = (teamGoals.xgFor + opponentGoals.xgAgainst) / 2;
  const expectedXgAgainst = (teamGoals.xgAgainst + opponentGoals.xgFor) / 2;
  const history = sample.historyFeatures;
  return [
    1,
    sample.predictedPoints,
    sample.baselinePoints,
    positionPrior,
    history.expectedMinutes / 90,
    history.startRate,
    history.minutesDeviation / 45,
    history.averageRating / 10,
    history.recentPointsDeviation / 5,
    history.recentPointsTrend / 5,
    sample.isHome === true ? 1 : 0,
    expectedGoalsFor / 2,
    expectedGoalsAgainst / 2,
    expectedXgFor / 2,
    expectedXgAgainst / 2,
    Math.exp(-Math.max(0, expectedXgAgainst)),
    1 - Math.exp(-Math.max(0, expectedXgFor)),
    outcomeMean(teamPosition, positionPrior),
    outcomeMean(opponentAllowed, positionPrior)
  ];
}

function updateContext(context: RidgeContext, samples: FantasyBacktestSample[]) {
  for (const sample of samples) {
    updateOutcome(context.teamPosition, teamPositionKey(sample.teamId, sample.position), sample.actualPoints);
    if (sample.opponentTeamId) updateOutcome(context.opponentAllowed, teamPositionKey(sample.opponentTeamId, sample.position), sample.actualPoints);
  }

  const matches = new Map<string, FantasyBacktestSample>();
  for (const sample of samples) {
    if (sample.homeTeamId && sample.awayTeamId && sample.homeScore !== null && sample.awayScore !== null && !matches.has(sample.matchId)) {
      matches.set(sample.matchId, sample);
    }
  }
  for (const sample of matches.values()) {
    const homeXg = sample.homeXg ?? sample.homeScore!;
    const awayXg = sample.awayXg ?? sample.awayScore!;
    updateTeamGoals(context.teamGoals, sample.homeTeamId!, sample.homeScore!, sample.awayScore!, homeXg, awayXg);
    updateTeamGoals(context.teamGoals, sample.awayTeamId!, sample.awayScore!, sample.homeScore!, awayXg, homeXg);
    context.leagueGoals.matches += 2;
    context.leagueGoals.goalsFor += sample.homeScore! + sample.awayScore!;
    context.leagueGoals.goalsAgainst += sample.homeScore! + sample.awayScore!;
    context.leagueGoals.xgFor += homeXg + awayXg;
    context.leagueGoals.xgAgainst += homeXg + awayXg;
  }
}

function updateOutcome(values: Map<string, OutcomeState>, key: string, value: number) {
  const state = values.get(key) ?? { count: 0, sum: 0 };
  state.count += 1;
  state.sum += value;
  values.set(key, state);
}

function updateTeamGoals(values: Map<string, TeamGoalState>, teamId: string, goalsFor: number, goalsAgainst: number, xgFor: number, xgAgainst: number) {
  const state = values.get(teamId) ?? { matches: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 };
  state.matches += 1;
  state.goalsFor += goalsFor;
  state.goalsAgainst += goalsAgainst;
  state.xgFor += xgFor;
  state.xgAgainst += xgAgainst;
  values.set(teamId, state);
}

function goalRates(state: TeamGoalState | undefined, fallbackFor: number, fallbackAgainst: number) {
  if (!state || state.matches === 0) return { for: fallbackFor, against: fallbackAgainst, xgFor: fallbackFor, xgAgainst: fallbackAgainst };
  return {
    for: (state.goalsFor + fallbackFor * 4) / (state.matches + 4),
    against: (state.goalsAgainst + fallbackAgainst * 4) / (state.matches + 4),
    xgFor: (state.xgFor + fallbackFor * 4) / (state.matches + 4),
    xgAgainst: (state.xgAgainst + fallbackAgainst * 4) / (state.matches + 4)
  };
}

function outcomeMean(state: OutcomeState | null | undefined, fallback: number) {
  return state && state.count > 0 ? state.sum / state.count : fallback;
}

function positionMean(state: PositionState, fallback: number) {
  return state.count > 0 ? state.sum / state.count : fallback;
}

function teamPositionKey(teamId: string, position: FantasyBacktestPositionGroup) {
  return `${teamId}:${position}`;
}

function solveRidge(xtx: number[][], xty: number[], lambda: number) {
  const size = xty.length;
  const matrix = xtx.map((row, rowIndex) => [
    ...row.map((value, columnIndex) => value + (rowIndex === columnIndex ? (rowIndex === 0 ? lambda * 0.01 : lambda) : 0)),
    xty[rowIndex]
  ]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[bestRow][pivot])) bestRow = row;
    }
    if (Math.abs(matrix[bestRow][pivot]) < 1e-9) return null;
    [matrix[pivot], matrix[bestRow]] = [matrix[bestRow], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column <= size; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
    }
  }
  return matrix.map((row) => row[size]);
}

function candidateReport(name: string, samples: FantasyBacktestSample[], splitDate: string) {
  const full = summarizeFantasyBacktestSamples(samples);
  const holdout = summarizeFantasyBacktestSamples(samples.filter((sample) => sample.matchDate >= splitDate));
  const holdoutH3 = summarizeFantasyBacktestSamples(buildFantasyBacktestHorizonSamples(samples, 3).filter((sample) => sample.matchDate >= splitDate));
  const holdoutH5 = summarizeFantasyBacktestSamples(buildFantasyBacktestHorizonSamples(samples, 5).filter((sample) => sample.matchDate >= splitDate));
  return {
    name,
    fullPassingPositions: full.qualityGate.passingPositions.length,
    holdoutPassingPositions: holdout.qualityGate.passingPositions.length,
    holdoutH3PassingPositions: holdoutH3.qualityGate.passingPositions.length,
    holdoutH5PassingPositions: holdoutH5.qualityGate.passingPositions.length,
    holdoutOverallMaeImprovement: holdout.overall.maeImprovementPercent ?? -999,
    holdoutOverallRmseImprovement: holdout.overall.rmseImprovementPercent ?? -999,
    holdoutH5OverallMaeImprovement: holdoutH5.overall.maeImprovementPercent ?? -999,
    holdoutH5OverallRmseImprovement: holdoutH5.overall.rmseImprovementPercent ?? -999,
    holdoutH5Gk: bestImprovement(holdoutH5.byPosition.GK),
    holdoutH5Def: bestImprovement(holdoutH5.byPosition.DEF),
    holdoutH5Mid: bestImprovement(holdoutH5.byPosition.MID),
    holdoutH5Fwd: bestImprovement(holdoutH5.byPosition.FWD)
  };
}

function bestImprovement(value: { maeImprovementPercent: number | null; rmseImprovementPercent: number | null }) {
  return Math.max(value.maeImprovementPercent ?? -999, value.rmseImprovementPercent ?? -999);
}

function emptyPositionStates() {
  return Object.fromEntries(
    FANTASY_BACKTEST_POSITION_GROUPS.map((position) => [
      position,
      {
        count: 0,
        sum: 0,
        xtx: Array.from({ length: RIDGE_FEATURES }, () => Array(RIDGE_FEATURES).fill(0)),
        xty: Array(RIDGE_FEATURES).fill(0)
      }
    ])
  ) as Record<FantasyBacktestPositionGroup, PositionState>;
}

function parseOptions(args: string[]): Options {
  const value = (name: string) => {
    const prefix = `--${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] ?? null : null;
  };
  const league = value("league") ?? value("league-id");
  const season = value("season")?.trim();
  if (!league || !season) throw new Error("--league and --season are required.");
  const expected = value("expected-matches");
  return {
    leagueId: BigInt(league),
    season,
    expectedMatches: expected ? Number(expected) : null
  };
}

function dot(left: number[], right: number[]) {
  return left.reduce((total, value, index) => total + value * right[index], 0);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
