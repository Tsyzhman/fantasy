import { calculateFantasyScore, calculateScoringScore, type ActiveScoringModel } from "@/lib/scoring";
import { fantasyPositionOrder } from "@/lib/players/fantasy-position-order";

import { build_fantasy_model_metrics_from_player_stat, type FantasyMatchPlayerStatInput } from "./fantasy_points_engine";

export type FantasyBacktestPositionGroup = Exclude<(typeof fantasyPositionOrder)[number], "UNK">;
export const FANTASY_BACKTEST_POSITION_GROUPS: readonly FantasyBacktestPositionGroup[] = fantasyPositionOrder.filter(
  (position): position is FantasyBacktestPositionGroup => position !== "UNK"
);
export type FantasyBacktestPlayingTimeGroup = "STABLE_STARTER" | "UNCERTAIN_MINUTES" | "OTHER";

export type FantasyBacktestObservation = FantasyMatchPlayerStatInput & {
  matchDate: Date;
};

export type FantasyBacktestOptions = {
  historyMatches?: number;
  minimumHistory?: number;
  minimumImprovementPercent?: number;
  requiredPassingPositions?: number;
};

export type FantasyBacktestSample = {
  matchId: string;
  playerId: string;
  teamId: string;
  opponentTeamId: string | null;
  isHome: boolean | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeXg: number | null;
  awayXg: number | null;
  matchDate: string;
  position: FantasyBacktestPositionGroup;
  playingTimeGroup: FantasyBacktestPlayingTimeGroup;
  historyMatchIds: string[];
  historyFeatures: {
    expectedMinutes: number;
    startRate: number;
    minutesDeviation: number;
    averageRating: number;
    recentPointsDeviation: number;
    recentPointsTrend: number;
  };
  predictedPoints: number;
  baselinePoints: number;
  seasonBaselinePoints: number;
  actualPoints: number;
};

export type FantasyBacktestMetricComparison = {
  count: number;
  modelMae: number | null;
  baselineMae: number | null;
  maeImprovementPercent: number | null;
  modelRmse: number | null;
  baselineRmse: number | null;
  rmseImprovementPercent: number | null;
  passesImprovementThreshold: boolean;
};

export type FantasyBacktestSummary = {
  method: {
    validation: "ROLLING_ORIGIN";
    baseline: "MEAN_ACTUAL_FP_OVER_SAME_HISTORY_WINDOW";
    historyMatches: number;
    minimumHistory: number;
    minimumImprovementPercent: number;
    requiredPassingPositions: number;
    stableStarterDefinition: string;
    uncertainMinutesDefinition: string;
  };
  samples: number;
  skipped: {
    missingTeam: number;
    unknownPosition: number;
    insufficientHistory: number;
    invalidScore: number;
  };
  overall: FantasyBacktestMetricComparison;
  byPosition: Record<FantasyBacktestPositionGroup, FantasyBacktestMetricComparison>;
  byPlayingTime: Record<FantasyBacktestPlayingTimeGroup, FantasyBacktestMetricComparison>;
  qualityGate: {
    passingPositions: FantasyBacktestPositionGroup[];
    requiredPassingPositions: number;
    passed: boolean;
  };
};

export type FantasyBacktestResult = {
  samples: FantasyBacktestSample[];
  summary: FantasyBacktestSummary;
};

export type FantasyBacktestMatchInput = {
  matchDate: Date | null;
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  homeScore: number | null;
  awayScore: number | null;
  playerStats: unknown[];
  teamStats: Array<{ teamId: bigint; xg: number | null }>;
};

const DEFAULT_HISTORY_MATCHES = 5;
const DEFAULT_MINIMUM_HISTORY = 3;
const DEFAULT_MINIMUM_IMPROVEMENT_PERCENT = 10;
const DEFAULT_REQUIRED_PASSING_POSITIONS = 3;
const STABLE_START_RATE = 0.8;
const STABLE_STARTER_MINUTES = 60;
const UNCERTAIN_START_RATE_MIN = 0.2;
const UNCERTAIN_MINUTES_DEVIATION = 25;

export function buildFantasyBacktestObservations(matches: FantasyBacktestMatchInput[]) {
  const observations: FantasyBacktestObservation[] = [];
  for (const match of matches) {
    if (!match.matchDate) continue;
    const homeTeamStats = match.teamStats.find((row) => row.teamId === match.homeTeamId);
    const awayTeamStats = match.teamStats.find((row) => row.teamId === match.awayTeamId);
    for (const stat of match.playerStats) {
      observations.push({
        ...(stat as Omit<FantasyBacktestObservation, "matchDate" | "match">),
        matchDate: match.matchDate,
        match: {
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeXg: homeTeamStats?.xg ?? null,
          awayXg: awayTeamStats?.xg ?? null
        }
      });
    }
  }
  return observations;
}

export function runFantasyBacktest(
  observations: FantasyBacktestObservation[],
  model: ActiveScoringModel,
  options: FantasyBacktestOptions = {}
): FantasyBacktestResult {
  const configuration = normalizeOptions(options);
  const histories = new Map<string, FantasyBacktestObservation[]>();
  const samples: FantasyBacktestSample[] = [];
  const skipped = {
    missingTeam: 0,
    unknownPosition: 0,
    insufficientHistory: 0,
    invalidScore: 0
  };

  const ordered = [...observations].sort(compareObservations);
  for (const observation of ordered) {
    if (observation.teamId === null) {
      skipped.missingTeam += 1;
      continue;
    }

    const historyKey = `${String(observation.teamId)}:${String(observation.playerId)}`;
    const prior = histories.get(historyKey) ?? [];
    const position = resolvePositionGroup(observation, prior);

    if (!position) {
      skipped.unknownPosition += 1;
    } else if (prior.length < configuration.minimumHistory) {
      skipped.insufficientHistory += 1;
    } else {
      const history = prior.slice(-configuration.historyMatches);
      const historicalMetrics = aggregateHistoricalMetrics(history);
      const predictedPoints = calculateFantasyScore(historicalMetrics, position, model);
      const actualPoints = actualFantasyPoints(observation, position, model);
      const historicalActualPoints = history.map((row) => actualFantasyPoints(row, position, model));
      const baselinePoints = mean(historicalActualPoints);
      const seasonBaselinePoints = mean(prior.map((row) => actualFantasyPoints(row, position, model)));

      if ([predictedPoints, actualPoints, baselinePoints, seasonBaselinePoints].every(isFiniteNumber)) {
        samples.push({
          matchId: String(observation.matchId),
          playerId: String(observation.playerId),
          teamId: String(observation.teamId),
          opponentTeamId: resolveOpponentTeamId(observation),
          isHome: resolveIsHome(observation),
          homeTeamId: observation.match?.homeTeamId === null || observation.match?.homeTeamId === undefined ? null : String(observation.match.homeTeamId),
          awayTeamId: observation.match?.awayTeamId === null || observation.match?.awayTeamId === undefined ? null : String(observation.match.awayTeamId),
          homeScore: finiteNumberOrNull(observation.match?.homeScore),
          awayScore: finiteNumberOrNull(observation.match?.awayScore),
          homeXg: finiteNumberOrNull(observation.match?.homeXg),
          awayXg: finiteNumberOrNull(observation.match?.awayXg),
          matchDate: observation.matchDate.toISOString(),
          position,
          playingTimeGroup: classifyPlayingTime(history),
          historyMatchIds: history.map((row) => String(row.matchId)),
          historyFeatures: historicalPredictionFeatures(history, historicalActualPoints),
          predictedPoints,
          baselinePoints,
          seasonBaselinePoints,
          actualPoints
        });
      } else {
        skipped.invalidScore += 1;
      }
    }

    prior.push(observation);
    histories.set(historyKey, prior);
  }

  return {
    samples,
    summary: summarizeFantasyBacktestSamples(samples, skipped, configuration)
  };
}

export function summarizeFantasyBacktestSamples(
  samples: FantasyBacktestSample[],
  skipped: FantasyBacktestSummary["skipped"] = {
    missingTeam: 0,
    unknownPosition: 0,
    insufficientHistory: 0,
    invalidScore: 0
  },
  options: FantasyBacktestOptions = {}
): FantasyBacktestSummary {
  const configuration = normalizeOptions(options);
  const byPosition = Object.fromEntries(
    FANTASY_BACKTEST_POSITION_GROUPS.map((position) => [position, compareErrors(samples.filter((sample) => sample.position === position), configuration.minimumImprovementPercent)])
  ) as Record<FantasyBacktestPositionGroup, FantasyBacktestMetricComparison>;
  const playingTimeGroups: FantasyBacktestPlayingTimeGroup[] = ["STABLE_STARTER", "UNCERTAIN_MINUTES", "OTHER"];
  const byPlayingTime = Object.fromEntries(
    playingTimeGroups.map((group) => [group, compareErrors(samples.filter((sample) => sample.playingTimeGroup === group), configuration.minimumImprovementPercent)])
  ) as Record<FantasyBacktestPlayingTimeGroup, FantasyBacktestMetricComparison>;
  const passingPositions = FANTASY_BACKTEST_POSITION_GROUPS.filter((position) => byPosition[position].passesImprovementThreshold);

  return {
    method: {
      validation: "ROLLING_ORIGIN",
      baseline: "MEAN_ACTUAL_FP_OVER_SAME_HISTORY_WINDOW",
      historyMatches: configuration.historyMatches,
      minimumHistory: configuration.minimumHistory,
      minimumImprovementPercent: configuration.minimumImprovementPercent,
      requiredPassingPositions: configuration.requiredPassingPositions,
      stableStarterDefinition: `start rate >= ${STABLE_START_RATE} and average minutes >= ${STABLE_STARTER_MINUTES}, using history only`,
      uncertainMinutesDefinition: `not a stable starter and either start rate is ${UNCERTAIN_START_RATE_MIN}-${STABLE_START_RATE} or minutes standard deviation >= ${UNCERTAIN_MINUTES_DEVIATION}, using history only`
    },
    samples: samples.length,
    skipped,
    overall: compareErrors(samples, configuration.minimumImprovementPercent),
    byPosition,
    byPlayingTime,
    qualityGate: {
      passingPositions,
      requiredPassingPositions: configuration.requiredPassingPositions,
      passed: passingPositions.length >= configuration.requiredPassingPositions
    }
  };
}

export function classifyPlayingTime(history: FantasyBacktestObservation[]): FantasyBacktestPlayingTimeGroup {
  if (history.length === 0) return "OTHER";

  const startRate = history.filter((row) => row.started === true).length / history.length;
  const minutes = history.map((row) => row.minutes ?? 0);
  const averageMinutes = mean(minutes);
  const minutesDeviation = standardDeviation(minutes, averageMinutes);
  const stableStarter = startRate >= STABLE_START_RATE && averageMinutes >= STABLE_STARTER_MINUTES;

  if (stableStarter) return "STABLE_STARTER";
  if ((startRate >= UNCERTAIN_START_RATE_MIN && startRate < STABLE_START_RATE) || minutesDeviation >= UNCERTAIN_MINUTES_DEVIATION) {
    return "UNCERTAIN_MINUTES";
  }
  return "OTHER";
}

export function stableFantasyModelConfiguration(model: ActiveScoringModel) {
  return {
    modelSource: model.modelSource,
    customFormula: model.customFormula,
    customFormulaGk: model.customFormulaGk,
    customFormulaDef: model.customFormulaDef,
    customFormulaMid: model.customFormulaMid,
    customFormulaFwd: model.customFormulaFwd,
    customFormulaEnabled: model.customFormulaEnabled,
    scoringFormulaGk: model.scoringFormulaGk,
    scoringFormulaDef: model.scoringFormulaDef,
    scoringFormulaMid: model.scoringFormulaMid,
    scoringFormulaFwd: model.scoringFormulaFwd,
    scoringFormulaEnabled: model.scoringFormulaEnabled,
    alternativeFormulaGk: model.alternativeFormulaGk,
    alternativeFormulaDef: model.alternativeFormulaDef,
    alternativeFormulaMid: model.alternativeFormulaMid,
    alternativeFormulaFwd: model.alternativeFormulaFwd,
    alternativeFormulaEnabled: model.alternativeFormulaEnabled,
    rules: [...model.rules].sort((left, right) =>
      `${left.positionGroup}:${left.metricKey}:${left.transform}`.localeCompare(`${right.positionGroup}:${right.metricKey}:${right.transform}`)
    )
  };
}

function aggregateHistoricalMetrics(history: FantasyBacktestObservation[]) {
  const totals: Record<string, number> = {};
  const ratings: number[] = [];
  let appearances = 0;

  for (const observation of history) {
    const { rawMetrics } = build_fantasy_model_metrics_from_player_stat(observation);
    appearances += rawMetrics.matches_played;
    for (const [key, value] of Object.entries(rawMetrics)) {
      if (key === "average_rating") continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
    if (typeof observation.rating === "number" && Number.isFinite(observation.rating)) ratings.push(observation.rating);
  }

  const observedRounds = history.length;
  totals.matches_played = observedRounds;
  totals.observed_rounds = observedRounds;
  totals.appearance_probability = observedRounds > 0 ? appearances / observedRounds : 0;
  totals.sixty_minute_probability = observedRounds > 0 ? (totals.appearances_60 ?? 0) / observedRounds : 0;
  totals.full_match_probability = observedRounds > 0 ? (totals.full_matches ?? 0) / observedRounds : 0;
  totals.average_rating = ratings.length > 0 ? mean(ratings) : 0;
  return totals;
}

function actualFantasyPoints(observation: FantasyBacktestObservation, position: FantasyBacktestPositionGroup, model: ActiveScoringModel) {
  const { rawMetrics } = build_fantasy_model_metrics_from_player_stat(observation);
  return calculateScoringScore(rawMetrics, position, model);
}

function historicalPredictionFeatures(history: FantasyBacktestObservation[], historicalActualPoints: number[]) {
  const minutes = history.map((row) => row.minutes ?? 0);
  const expectedMinutes = mean(minutes);
  const knownStarts = history.filter((row) => row.started !== null && row.started !== undefined);
  const startRate = knownStarts.length > 0 ? knownStarts.filter((row) => row.started === true).length / knownStarts.length : 0;
  const ratings = history.map((row) => row.rating).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const recent = historicalActualPoints.slice(-2);
  const earlier = historicalActualPoints.slice(0, -2);
  return {
    expectedMinutes: round(expectedMinutes),
    startRate: round(startRate),
    minutesDeviation: round(standardDeviation(minutes, expectedMinutes)),
    averageRating: round(ratings.length > 0 ? mean(ratings) : 0),
    recentPointsDeviation: round(standardDeviation(historicalActualPoints, mean(historicalActualPoints))),
    recentPointsTrend: round(recent.length > 0 && earlier.length > 0 ? mean(recent) - mean(earlier) : 0)
  };
}

function resolveOpponentTeamId(observation: FantasyBacktestObservation) {
  if (observation.opponentTeamId !== null && observation.opponentTeamId !== undefined) return String(observation.opponentTeamId);
  const match = observation.match;
  if (!match || observation.teamId === null) return null;
  if (match.homeTeamId === observation.teamId && match.awayTeamId !== null) return String(match.awayTeamId);
  if (match.awayTeamId === observation.teamId && match.homeTeamId !== null) return String(match.homeTeamId);
  return null;
}

function resolveIsHome(observation: FantasyBacktestObservation) {
  if (typeof observation.isHome === "boolean") return observation.isHome;
  if (!observation.match || observation.teamId === null) return null;
  if (observation.match.homeTeamId === observation.teamId) return true;
  if (observation.match.awayTeamId === observation.teamId) return false;
  return null;
}

function finiteNumberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolvePositionGroup(observation: FantasyBacktestObservation, history: FantasyBacktestObservation[]): FantasyBacktestPositionGroup | null {
  const current = positionGroupFromStat(observation);
  if (current) return current;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = positionGroupFromStat(history[index]);
    if (previous) return previous;
  }
  return null;
}

function positionGroupFromStat(observation: FantasyBacktestObservation): FantasyBacktestPositionGroup | null {
  const group = build_fantasy_model_metrics_from_player_stat(observation).positionGroup;
  return FANTASY_BACKTEST_POSITION_GROUPS.includes(group as FantasyBacktestPositionGroup) ? (group as FantasyBacktestPositionGroup) : null;
}

function compareErrors(samples: FantasyBacktestSample[], threshold: number): FantasyBacktestMetricComparison {
  if (samples.length === 0) {
    return {
      count: 0,
      modelMae: null,
      baselineMae: null,
      maeImprovementPercent: null,
      modelRmse: null,
      baselineRmse: null,
      rmseImprovementPercent: null,
      passesImprovementThreshold: false
    };
  }

  const modelErrors = samples.map((sample) => sample.predictedPoints - sample.actualPoints);
  const baselineErrors = samples.map((sample) => sample.baselinePoints - sample.actualPoints);
  const modelMae = mean(modelErrors.map(Math.abs));
  const baselineMae = mean(baselineErrors.map(Math.abs));
  const modelRmse = Math.sqrt(mean(modelErrors.map((error) => error ** 2)));
  const baselineRmse = Math.sqrt(mean(baselineErrors.map((error) => error ** 2)));
  const maeImprovementPercent = improvementPercent(modelMae, baselineMae);
  const rmseImprovementPercent = improvementPercent(modelRmse, baselineRmse);

  return {
    count: samples.length,
    modelMae: round(modelMae),
    baselineMae: round(baselineMae),
    maeImprovementPercent,
    modelRmse: round(modelRmse),
    baselineRmse: round(baselineRmse),
    rmseImprovementPercent,
    passesImprovementThreshold: [maeImprovementPercent, rmseImprovementPercent].some((value) => value !== null && value >= threshold)
  };
}

function improvementPercent(modelError: number, baselineError: number) {
  if (baselineError <= 0) return null;
  return round(((baselineError - modelError) / baselineError) * 100);
}

function compareObservations(left: FantasyBacktestObservation, right: FantasyBacktestObservation) {
  return left.matchDate.getTime() - right.matchDate.getTime() || compareBigInts(left.matchId, right.matchId) || compareBigInts(left.playerId, right.playerId);
}

function compareBigInts(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeOptions(options: FantasyBacktestOptions) {
  return {
    historyMatches: positiveInteger(options.historyMatches, DEFAULT_HISTORY_MATCHES),
    minimumHistory: positiveInteger(options.minimumHistory, DEFAULT_MINIMUM_HISTORY),
    minimumImprovementPercent: nonNegativeNumber(options.minimumImprovementPercent, DEFAULT_MINIMUM_IMPROVEMENT_PERCENT),
    requiredPassingPositions: clamp(positiveInteger(options.requiredPassingPositions, DEFAULT_REQUIRED_PASSING_POSITIONS), 1, FANTASY_BACKTEST_POSITION_GROUPS.length)
  };
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
