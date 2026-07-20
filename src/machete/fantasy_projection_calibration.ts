import {
  FANTASY_BACKTEST_POSITION_GROUPS,
  type FantasyBacktestPositionGroup,
  type FantasyBacktestSample
} from "./fantasy_backtest";

export const FANTASY_PROJECTION_CALIBRATION = {
  kind: "POSITION_RIDGE",
  featureVersion: "ridge19-v1",
  lambda: 25,
  minimumTrainingSamples: 30,
  betaHorizon: 5,
  finalHoldoutFraction: 0.25,
  predictionClamp: { minimum: -5, maximum: 25 }
} as const;

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

export type FantasyProjectionCalibrationModel = {
  configuration: typeof FANTASY_PROJECTION_CALIBRATION;
  trainingSamples: number;
  states: Record<FantasyBacktestPositionGroup, PositionState>;
  context: RidgeContext;
  coefficients: Record<FantasyBacktestPositionGroup, number[] | null>;
};

const RIDGE_FEATURES = 19;

export function fantasyProjectionCalibrationConfiguration() {
  return {
    ...FANTASY_PROJECTION_CALIBRATION,
    predictionClamp: { ...FANTASY_PROJECTION_CALIBRATION.predictionClamp }
  };
}

/**
 * Applies the fixed calibration in rolling-origin order. All rows on the same
 * UTC date are predicted before any target from that date is added to state.
 */
export function calibrateFantasyBacktestSamples(samples: FantasyBacktestSample[]) {
  return trainCalibration(samples, true).predictions;
}

/** Fits the production calibrator from completed historical samples. */
export function fitFantasyProjectionCalibration(samples: FantasyBacktestSample[]): FantasyProjectionCalibrationModel {
  return trainCalibration(samples, false).model;
}

/** Predicts one upcoming observation without mutating the fitted model. */
export function predictCalibratedFantasyPoints(model: FantasyProjectionCalibrationModel, sample: FantasyBacktestSample) {
  const state = model.states[sample.position];
  const features = ridgeFeatures(sample, state, model.context);
  const coefficients = model.coefficients[sample.position];
  const predicted = coefficients ? dot(coefficients, features) : predictFromState(state, features, sample);
  return round(clamp(predicted, FANTASY_PROJECTION_CALIBRATION.predictionClamp.minimum, FANTASY_PROJECTION_CALIBRATION.predictionClamp.maximum));
}

export function buildFantasyBacktestHorizonSamples(samples: FantasyBacktestSample[], horizon: number) {
  if (!Number.isInteger(horizon) || horizon <= 0) throw new Error(`horizon must be a positive integer; received ${horizon}.`);

  const grouped = new Map<string, FantasyBacktestSample[]>();
  for (const sample of samples) {
    const key = `${sample.teamId}:${sample.playerId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(sample);
    grouped.set(key, rows);
  }

  const result: FantasyBacktestSample[] = [];
  for (const rows of grouped.values()) {
    rows.sort(compareSamples);
    for (let index = 0; index + horizon <= rows.length; index += 1) {
      const window = rows.slice(index, index + horizon);
      const first = window[0];
      if (window.some((sample) => sample.position !== first.position)) continue;
      result.push({
        ...first,
        matchId: `${first.matchId}:h${horizon}`,
        predictedPoints: round(window.reduce((total, sample) => total + sample.predictedPoints, 0)),
        baselinePoints: round(window.reduce((total, sample) => total + sample.baselinePoints, 0)),
        seasonBaselinePoints: round(window.reduce((total, sample) => total + sample.seasonBaselinePoints, 0)),
        actualPoints: round(window.reduce((total, sample) => total + sample.actualPoints, 0))
      });
    }
  }
  return result.sort(compareSamples);
}

export function fantasyBacktestHoldoutStart(samples: FantasyBacktestSample[], holdoutFraction = FANTASY_PROJECTION_CALIBRATION.finalHoldoutFraction) {
  if (!Number.isFinite(holdoutFraction) || holdoutFraction <= 0 || holdoutFraction >= 1) {
    throw new Error(`holdoutFraction must be greater than 0 and less than 1; received ${holdoutFraction}.`);
  }
  const dates = [...new Set(samples.map((sample) => sample.matchDate))].sort();
  if (dates.length < 2) throw new Error("At least two evaluation dates are required.");
  return dates[Math.floor(dates.length * (1 - holdoutFraction))];
}

function trainCalibration(samples: FantasyBacktestSample[], collectPredictions: boolean) {
  const model: FantasyProjectionCalibrationModel = {
    configuration: FANTASY_PROJECTION_CALIBRATION,
    trainingSamples: 0,
    states: emptyPositionStates(),
    context: emptyContext(),
    coefficients: emptyPositionCoefficients()
  };
  const ordered = [...samples].sort(compareSamples);
  const predictions: FantasyBacktestSample[] = [];

  for (let index = 0; index < ordered.length; ) {
    const date = ordered[index].matchDate.slice(0, 10);
    const batch: Array<{ original: FantasyBacktestSample; features: number[] }> = [];

    while (index < ordered.length && ordered[index].matchDate.slice(0, 10) === date) {
      const sample = ordered[index];
      const state = model.states[sample.position];
      const features = ridgeFeatures(sample, state, model.context);
      if (collectPredictions) {
        predictions.push({
          ...sample,
          predictedPoints: round(
            clamp(
              predictFromState(state, features, sample),
              FANTASY_PROJECTION_CALIBRATION.predictionClamp.minimum,
              FANTASY_PROJECTION_CALIBRATION.predictionClamp.maximum
            )
          )
        });
      }
      batch.push({ original: sample, features });
      index += 1;
    }

    for (const row of batch) updateRidgeState(model.states[row.original.position], row.features, row.original.actualPoints);
    updateContext(model.context, batch.map((row) => row.original));
    model.trainingSamples += batch.length;
  }

  for (const position of FANTASY_BACKTEST_POSITION_GROUPS) {
    const state = model.states[position];
    model.coefficients[position] =
      state.count >= FANTASY_PROJECTION_CALIBRATION.minimumTrainingSamples
        ? solveRidge(state.xtx, state.xty, FANTASY_PROJECTION_CALIBRATION.lambda)
        : null;
  }

  return { model, predictions };
}

function predictFromState(state: PositionState, features: number[], sample: FantasyBacktestSample) {
  if (state.count < FANTASY_PROJECTION_CALIBRATION.minimumTrainingSamples) {
    const prior = positionMean(state, sample.baselinePoints);
    const historyWeight = Math.max(1, sample.historyMatchIds.length);
    return (sample.predictedPoints * historyWeight + prior * 3) / (historyWeight + 3);
  }
  const coefficients = solveRidge(state.xtx, state.xty, FANTASY_PROJECTION_CALIBRATION.lambda);
  return coefficients ? dot(coefficients, features) : sample.predictedPoints;
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

function updateRidgeState(state: PositionState, features: number[], actualPoints: number) {
  state.count += 1;
  state.sum += actualPoints;
  for (let row = 0; row < RIDGE_FEATURES; row += 1) {
    state.xty[row] += features[row] * actualPoints;
    for (let column = 0; column < RIDGE_FEATURES; column += 1) state.xtx[row][column] += features[row] * features[column];
  }
}

function updateContext(context: RidgeContext, samples: FantasyBacktestSample[]) {
  for (const sample of samples) {
    updateOutcome(context.teamPosition, teamPositionKey(sample.teamId, sample.position), sample.actualPoints);
    if (sample.opponentTeamId) updateOutcome(context.opponentAllowed, teamPositionKey(sample.opponentTeamId, sample.position), sample.actualPoints);
  }

  const matches = new Map<string, FantasyBacktestSample>();
  for (const sample of samples) {
    if (sample.homeTeamId && sample.awayTeamId && sample.homeScore !== null && sample.awayScore !== null && !matches.has(sample.matchId)) matches.set(sample.matchId, sample);
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

function emptyContext(): RidgeContext {
  return {
    teamPosition: new Map(),
    opponentAllowed: new Map(),
    teamGoals: new Map(),
    leagueGoals: { matches: 0, goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0 }
  };
}

function emptyPositionCoefficients() {
  return Object.fromEntries(FANTASY_BACKTEST_POSITION_GROUPS.map((position) => [position, null])) as Record<
    FantasyBacktestPositionGroup,
    number[] | null
  >;
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

function compareSamples(left: FantasyBacktestSample, right: FantasyBacktestSample) {
  return left.matchDate.localeCompare(right.matchDate) || left.matchId.localeCompare(right.matchId);
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
