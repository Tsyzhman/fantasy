export type FoontasyArchiveSample = {
  roundNumber: number;
  position: string | null;
  foontasyPoints: number;
  modelNextPoints: number;
};

export type FoontasyArchiveMetrics = {
  samples: number;
  mae: number;
  rmse: number;
  bias: number;
  correlation: number | null;
};

export type FoontasyArchiveFormula = {
  intercept: number;
  modelNextPointsWeight: number;
  expression: string;
};

export type FoontasyArchiveAnalysis = {
  ready: boolean;
  minimumRounds: number;
  rounds: number[];
  samples: number;
  baseline: FoontasyArchiveMetrics | null;
  crossValidated: FoontasyArchiveMetrics | null;
  proposedFormula: FoontasyArchiveFormula | null;
  byPosition: Record<string, {
    samples: number;
    baseline: FoontasyArchiveMetrics;
    crossValidated: FoontasyArchiveMetrics | null;
    proposedFormula: FoontasyArchiveFormula;
  }>;
};

export function analyzeFoontasyArchive(
  input: readonly FoontasyArchiveSample[],
  minimumRounds = 5
): FoontasyArchiveAnalysis {
  const samples = input.filter((sample) =>
    Number.isInteger(sample.roundNumber)
    && Number.isFinite(sample.foontasyPoints)
    && Number.isFinite(sample.modelNextPoints)
  );
  const rounds = [...new Set(samples.map((sample) => sample.roundNumber))].sort((left, right) => left - right);
  const ready = rounds.length >= minimumRounds;
  const baseline = samples.length === 0
    ? null
    : errorMetrics(samples.map((sample) => ({ predicted: sample.modelNextPoints, actual: sample.foontasyPoints })));
  const crossValidated = ready ? crossValidatedMetrics(samples) : null;
  const proposedFormula = ready ? formatFormula(fitLinear(samples)) : null;
  const byPosition = ready
    ? Object.fromEntries([...new Set(samples.map((sample) => sample.position ?? "UNKNOWN"))].sort().flatMap((position) => {
        const positionSamples = samples.filter((sample) => (sample.position ?? "UNKNOWN") === position);
        if (positionSamples.length < 10) return [];
        return [[position, {
          samples: positionSamples.length,
          baseline: errorMetrics(positionSamples.map((sample) => ({ predicted: sample.modelNextPoints, actual: sample.foontasyPoints }))),
          crossValidated: new Set(positionSamples.map((sample) => sample.roundNumber)).size >= minimumRounds
            ? crossValidatedMetrics(positionSamples)
            : null,
          proposedFormula: formatFormula(fitLinear(positionSamples))
        }]];
      }))
    : {};

  return {
    ready,
    minimumRounds,
    rounds,
    samples: samples.length,
    baseline,
    crossValidated,
    proposedFormula,
    byPosition
  };
}

function crossValidatedMetrics(samples: readonly FoontasyArchiveSample[]) {
  const predictions: Array<{ predicted: number; actual: number }> = [];
  for (const round of new Set(samples.map((sample) => sample.roundNumber))) {
    const training = samples.filter((sample) => sample.roundNumber !== round);
    const validation = samples.filter((sample) => sample.roundNumber === round);
    if (training.length < 2 || validation.length === 0) continue;
    const formula = fitLinear(training);
    for (const sample of validation) {
      predictions.push({
        predicted: formula.intercept + formula.slope * sample.modelNextPoints,
        actual: sample.foontasyPoints
      });
    }
  }
  return predictions.length === 0 ? null : errorMetrics(predictions);
}

function fitLinear(samples: readonly FoontasyArchiveSample[]) {
  const xMean = mean(samples.map((sample) => sample.modelNextPoints));
  const yMean = mean(samples.map((sample) => sample.foontasyPoints));
  const covariance = samples.reduce(
    (total, sample) => total + (sample.modelNextPoints - xMean) * (sample.foontasyPoints - yMean),
    0
  );
  const variance = samples.reduce(
    (total, sample) => total + (sample.modelNextPoints - xMean) ** 2,
    0
  );
  const slope = variance > 0 ? covariance / variance : 0;
  return { intercept: yMean - slope * xMean, slope };
}

function formatFormula(formula: { intercept: number; slope: number }): FoontasyArchiveFormula {
  const intercept = round(formula.intercept);
  const modelNextPointsWeight = round(formula.slope);
  return {
    intercept,
    modelNextPointsWeight,
    expression: `estimatedFFO = ${intercept} + ${modelNextPointsWeight} × modelNextPoints`
  };
}

function errorMetrics(values: Array<{ predicted: number; actual: number }>): FoontasyArchiveMetrics {
  const errors = values.map((value) => value.predicted - value.actual);
  const predicted = values.map((value) => value.predicted);
  const actual = values.map((value) => value.actual);
  return {
    samples: values.length,
    mae: round(mean(errors.map(Math.abs))),
    rmse: round(Math.sqrt(mean(errors.map((error) => error ** 2)))),
    bias: round(mean(errors)),
    correlation: correlation(predicted, actual)
  };
}

function correlation(left: number[], right: number[]) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((total, value, index) => total + (value - leftMean) * (right[index] - rightMean), 0);
  const leftVariance = left.reduce((total, value) => total + (value - leftMean) ** 2, 0);
  const rightVariance = right.reduce((total, value) => total + (value - rightMean) ** 2, 0);
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? round(numerator / denominator) : null;
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
