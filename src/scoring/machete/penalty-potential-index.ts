export const PENALTY_POTENTIAL_DEFAULTS = {
  minMinutes: 600,
  touchesInBoxBaseline: 4.6,
  foulsWonBaseline: 1.87,
  touchesInBoxWeight: 0.65,
  foulsWonWeight: 0.35
} as const;

export type PenaltyPotentialMetricKey = "touchesInBox" | "foulsWon" | "penaltiesWon";
export type PenaltyPotentialPositionCategory = "Forward" | "Midfielder" | "Defender" | "Unknown";
export type PenaltyPotentialTier = "very_strong" | "good" | "medium" | "weak";

export type PenaltyPotentialOptions = {
  minMinutes?: number;
  touchesInBoxBaseline?: number;
  foulsWonBaseline?: number;
  touchesInBoxWeight?: number;
  foulsWonWeight?: number;
  includePositionMultiplier?: boolean;
};

export type PenaltyPotentialInput = {
  player: string;
  team: string;
  league?: string | null;
  season?: string | null;
  position?: string | null;
  minutes: number | null | undefined;
  touchesInBox?: number | null;
  foulsWon?: number | null;
  penaltiesWon?: number | null;
  penaltiesWonAvailable?: boolean;
};

export type PenaltyPotentialRow = {
  player: string;
  team: string;
  league: string | null;
  season: string | null;
  position: string | null;
  positionCategory: PenaltyPotentialPositionCategory;
  minutes: number;
  touchesInBox: number;
  foulsWon: number;
  penaltiesWon: number | null;
  touchesInBox90: number;
  foulsWon90: number;
  penaltiesWon90: number | null;
  positionMultiplier: number;
  penaltyPotentialIndex: number;
  tier: PenaltyPotentialTier;
  interpretation: string;
};

export type PenaltyPotentialSourceStat = {
  playerId: string | number | bigint;
  player: string;
  teamId?: string | number | bigint | null;
  team: string;
  leagueId?: string | number | bigint | null;
  league?: string | null;
  season?: string | null;
  position?: string | null;
  minutes: number | null | undefined;
  touchesInBox?: number | null;
  foulsWon?: number | null;
  penaltiesWon?: number | null;
  statsPayload?: unknown;
};

export type PenaltyPotentialDiagnostics = {
  inputRows: number;
  usedRows: number;
  skippedForMinutes: number;
  nullTouchesInBoxTreatedAsZero: number;
  nullFoulsWonTreatedAsZero: number;
  negativeValuesClamped: number;
  penaltiesWonAvailable: boolean;
  fieldMatches: Record<PenaltyPotentialMetricKey, Record<string, number>>;
};

export type PenaltyPotentialAggregationResult = {
  rows: PenaltyPotentialRow[];
  diagnostics: PenaltyPotentialDiagnostics;
};

export type PenaltyPotentialResearch = {
  penaltiesWonAverage90: number | null;
  overall: {
    ppiVsPenaltiesWon90: number | null;
    touchesInBox90VsPenaltiesWon90: number | null;
    foulsWon90VsPenaltiesWon90: number | null;
    baseFormulaVsPenaltiesWon90: number | null;
  };
  byPosition: Array<{
    positionCategory: PenaltyPotentialPositionCategory;
    sampleSize: number;
    ppiVsPenaltiesWon90: number | null;
    touchesInBox90VsPenaltiesWon90: number | null;
    foulsWon90VsPenaltiesWon90: number | null;
  }>;
  formulaVariants: Array<{
    name: "A" | "B" | "C";
    touchesInBoxWeight: number;
    foulsWonWeight: number;
    baseCorrelation: number | null;
    positionAdjustedCorrelation: number | null;
  }>;
};

type MetricExtraction = {
  value: number | null;
  matchedLabel: string | null;
};

const FIELD_ALIASES: Record<PenaltyPotentialMetricKey, string[]> = {
  touchesInBox: [
    "Touches in opposition box",
    "Touches in opp box",
    "Touches in opponent box",
    "Touches in box",
    "Touches inside opposition box",
    "Touches in penalty area",
    "Opposition box touches",
    "Penalty area touches",
    "touchesInOppBox",
    "touchesInOppositionBox",
    "touchesInBox",
    "touches_in_opp_box",
    "touches_in_opposition_box",
    "touches_in_box",
    "touches_opp_box"
  ],
  foulsWon: [
    "Fouls won",
    "Fouls suffered",
    "Fouls drawn",
    "Was fouled",
    "Won fouls",
    "foulsWon",
    "fouls_won",
    "foulsSuffered",
    "fouls_suffered",
    "foulsDrawn",
    "fouls_drawn",
    "wasFouled",
    "was_fouled"
  ],
  penaltiesWon: [
    "Penalties won",
    "Penalty won",
    "Penalties awarded",
    "Penalty awarded",
    "Penalties earned",
    "Penalty earned",
    "penaltiesWon",
    "penalties_won",
    "penaltyWon",
    "penalty_won",
    "penaltiesAwarded",
    "penalties_awarded",
    "penaltiesEarned",
    "penalties_earned"
  ]
};

export function calculatePenaltyPotentialRow(input: PenaltyPotentialInput, options: PenaltyPotentialOptions = {}): PenaltyPotentialRow | null {
  const settings = penaltyPotentialSettings(options);
  const minutes = nonNegativeNumber(input.minutes);
  if (minutes === null || minutes <= 0 || minutes < settings.minMinutes) return null;

  const touchesInBox = nonNegativeNumber(input.touchesInBox) ?? 0;
  const foulsWon = nonNegativeNumber(input.foulsWon) ?? 0;
  const penaltiesWonAvailable = input.penaltiesWonAvailable ?? input.penaltiesWon !== undefined;
  const penaltiesWon = penaltiesWonAvailable ? nonNegativeNumber(input.penaltiesWon) ?? 0 : null;
  const touchesInBox90 = per90(touchesInBox, minutes);
  const foulsWon90 = per90(foulsWon, minutes);
  const penaltiesWon90 = penaltiesWon === null ? null : per90(penaltiesWon, minutes);
  const position = penaltyPotentialPosition(input.position);
  const positionMultiplier = settings.includePositionMultiplier ? position.multiplier : 1;

  // This is a profile index, not a probability. Touches in the box carry more
  // weight because they are closer to penalty events than all-location fouls.
  const penaltyPotentialIndex =
    Math.pow(touchesInBox90 / settings.touchesInBoxBaseline, settings.touchesInBoxWeight) *
    Math.pow(foulsWon90 / settings.foulsWonBaseline, settings.foulsWonWeight) *
    positionMultiplier;
  const interpretation = interpretPenaltyPotentialIndex(penaltyPotentialIndex);

  return {
    player: input.player,
    team: input.team,
    league: input.league ?? null,
    season: input.season ?? null,
    position: input.position ?? null,
    positionCategory: position.category,
    minutes,
    touchesInBox,
    foulsWon,
    penaltiesWon,
    touchesInBox90,
    foulsWon90,
    penaltiesWon90,
    positionMultiplier,
    penaltyPotentialIndex,
    ...interpretation
  };
}

export function aggregatePenaltyPotentialRows(
  stats: PenaltyPotentialSourceStat[],
  options: PenaltyPotentialOptions = {}
): PenaltyPotentialAggregationResult {
  const grouped = new Map<string, AggregateBucket>();
  const diagnostics: PenaltyPotentialDiagnostics = {
    inputRows: stats.length,
    usedRows: 0,
    skippedForMinutes: 0,
    nullTouchesInBoxTreatedAsZero: 0,
    nullFoulsWonTreatedAsZero: 0,
    negativeValuesClamped: 0,
    penaltiesWonAvailable: false,
    fieldMatches: {
      touchesInBox: {},
      foulsWon: {},
      penaltiesWon: {}
    }
  };

  for (const stat of stats) {
    const minutes = nonNegativeNumber(stat.minutes);
    if (minutes === null || minutes <= 0) {
      diagnostics.skippedForMinutes += 1;
      continue;
    }

    const key = aggregateKey(stat);
    const bucket = grouped.get(key) ?? {
      player: stat.player,
      team: stat.team,
      league: stat.league ?? null,
      season: stat.season ?? null,
      position: stat.position ?? null,
      minutes: 0,
      touchesInBox: 0,
      foulsWon: 0,
      penaltiesWon: 0,
      penaltiesWonAvailable: false
    };

    bucket.position ??= stat.position ?? null;
    bucket.minutes += minutes;

    const touches = sourceMetricValue(stat, "touchesInBox");
    if (touches.value === null) diagnostics.nullTouchesInBoxTreatedAsZero += 1;
    if (touches.matchedLabel) incrementFieldMatch(diagnostics, "touchesInBox", touches.matchedLabel);
    bucket.touchesInBox += clampMetricValue(touches.value, diagnostics);

    const fouls = sourceMetricValue(stat, "foulsWon");
    if (fouls.value === null) diagnostics.nullFoulsWonTreatedAsZero += 1;
    if (fouls.matchedLabel) incrementFieldMatch(diagnostics, "foulsWon", fouls.matchedLabel);
    bucket.foulsWon += clampMetricValue(fouls.value, diagnostics);

    const penalties = sourceMetricValue(stat, "penaltiesWon");
    if (penalties.matchedLabel) incrementFieldMatch(diagnostics, "penaltiesWon", penalties.matchedLabel);
    if (penalties.value !== null) {
      diagnostics.penaltiesWonAvailable = true;
      bucket.penaltiesWonAvailable = true;
      bucket.penaltiesWon += clampMetricValue(penalties.value, diagnostics);
    }

    grouped.set(key, bucket);
    diagnostics.usedRows += 1;
  }

  const rows = [...grouped.values()]
    .map((bucket) =>
      calculatePenaltyPotentialRow(
        {
          ...bucket,
          penaltiesWon: bucket.penaltiesWon,
          penaltiesWonAvailable: diagnostics.penaltiesWonAvailable
        },
        options
      )
    )
    .filter((row): row is PenaltyPotentialRow => row !== null)
    .sort((left, right) => right.penaltyPotentialIndex - left.penaltyPotentialIndex || right.minutes - left.minutes || left.player.localeCompare(right.player));

  return { rows, diagnostics };
}

export function penaltyPotentialPosition(position: string | null | undefined): {
  category: PenaltyPotentialPositionCategory;
  multiplier: number;
} {
  const value = position?.trim().toLowerCase() ?? "";
  if (!value) return { category: "Unknown", multiplier: 0.85 };
  if (value.includes("winger")) return { category: "Midfielder", multiplier: 0.85 };
  if (value === "forward" || value === "fwd" || value === "fw" || value.includes("forward") || value.includes("striker") || value.includes("attacker")) {
    return { category: "Forward", multiplier: 1.15 };
  }
  if (value === "midfielder" || value === "mid" || value.includes("midfield")) return { category: "Midfielder", multiplier: 0.85 };
  if (value === "defender" || value === "def" || value.includes("defender") || value.includes("back")) return { category: "Defender", multiplier: 0.6 };
  return { category: "Unknown", multiplier: 0.85 };
}

export function interpretPenaltyPotentialIndex(value: number): {
  tier: PenaltyPotentialTier;
  interpretation: string;
} {
  if (value >= 1.3) return { tier: "very_strong", interpretation: "very strong penalty-winning profile" };
  if (value >= 1) return { tier: "good", interpretation: "good penalty-winning profile" };
  if (value >= 0.75) return { tier: "medium", interpretation: "medium or situational profile" };
  return { tier: "weak", interpretation: "weak penalty-winning profile" };
}

export function extractPenaltyPotentialMetric(payload: unknown, metric: PenaltyPotentialMetricKey): MetricExtraction {
  return findNestedMetricNumber(payload, new Set(FIELD_ALIASES[metric].map(normalizeStatLabel)));
}

export function analyzePenaltyPotentialRows(rows: PenaltyPotentialRow[]): PenaltyPotentialResearch | null {
  const sample = rows.filter((row) => row.penaltiesWon90 !== null);
  if (sample.length < 3) return null;

  const penaltiesWon90 = sample.map((row) => row.penaltiesWon90 ?? 0);
  const formulaVariantInputs = [
    { name: "A", touchesInBoxWeight: 0.65, foulsWonWeight: 0.35, baseCorrelation: null, positionAdjustedCorrelation: null },
    { name: "B", touchesInBoxWeight: 0.7, foulsWonWeight: 0.3, baseCorrelation: null, positionAdjustedCorrelation: null },
    { name: "C", touchesInBoxWeight: 0.6, foulsWonWeight: 0.4, baseCorrelation: null, positionAdjustedCorrelation: null }
  ] as const;
  const formulaVariants: PenaltyPotentialResearch["formulaVariants"] = formulaVariantInputs.map((variant) => {
    const baseValues = sample.map((row) => penaltyPotentialFormulaValue(row.touchesInBox90, row.foulsWon90, variant, false, row.positionMultiplier));
    const adjustedValues = sample.map((row) => penaltyPotentialFormulaValue(row.touchesInBox90, row.foulsWon90, variant, true, row.positionMultiplier));
    return {
      ...variant,
      baseCorrelation: pearsonCorrelation(baseValues, penaltiesWon90),
      positionAdjustedCorrelation: pearsonCorrelation(adjustedValues, penaltiesWon90)
    };
  });

  return {
    penaltiesWonAverage90: mean(penaltiesWon90),
    overall: {
      ppiVsPenaltiesWon90: pearsonCorrelation(sample.map((row) => row.penaltyPotentialIndex), penaltiesWon90),
      touchesInBox90VsPenaltiesWon90: pearsonCorrelation(sample.map((row) => row.touchesInBox90), penaltiesWon90),
      foulsWon90VsPenaltiesWon90: pearsonCorrelation(sample.map((row) => row.foulsWon90), penaltiesWon90),
      baseFormulaVsPenaltiesWon90: formulaVariants[0]?.baseCorrelation ?? null
    },
    byPosition: (["Forward", "Midfielder", "Defender"] as const).map((positionCategory) => {
      const positionSample = sample.filter((row) => row.positionCategory === positionCategory);
      const y = positionSample.map((row) => row.penaltiesWon90 ?? 0);
      return {
        positionCategory,
        sampleSize: positionSample.length,
        ppiVsPenaltiesWon90: pearsonCorrelation(positionSample.map((row) => row.penaltyPotentialIndex), y),
        touchesInBox90VsPenaltiesWon90: pearsonCorrelation(positionSample.map((row) => row.touchesInBox90), y),
        foulsWon90VsPenaltiesWon90: pearsonCorrelation(positionSample.map((row) => row.foulsWon90), y)
      };
    }),
    formulaVariants
  };
}

export function findUnderratedPenaltyCandidates(
  rows: PenaltyPotentialRow[],
  options: { minPenaltyPotentialIndex?: number; maxPenaltiesWon?: number } = {}
) {
  const minPenaltyPotentialIndex = options.minPenaltyPotentialIndex ?? 1;
  const maxPenaltiesWon = options.maxPenaltiesWon ?? 1;
  const penaltiesSample = rows.filter((row) => row.penaltiesWon90 !== null);
  const penaltiesAverage90 = penaltiesSample.length > 0 ? mean(penaltiesSample.map((row) => row.penaltiesWon90 ?? 0)) : null;
  const hasPenaltyData = penaltiesAverage90 !== null;

  return rows
    .filter((row) => row.penaltyPotentialIndex >= minPenaltyPotentialIndex)
    .filter((row) => {
      if (!hasPenaltyData) return true;
      return (row.penaltiesWon ?? 0) <= maxPenaltiesWon || (row.penaltiesWon90 ?? Number.POSITIVE_INFINITY) < penaltiesAverage90;
    })
    .sort((left, right) => right.penaltyPotentialIndex - left.penaltyPotentialIndex || (left.penaltiesWon ?? 0) - (right.penaltiesWon ?? 0));
}

function sourceMetricValue(stat: PenaltyPotentialSourceStat, metric: PenaltyPotentialMetricKey): MetricExtraction {
  const explicit = metric === "touchesInBox" ? stat.touchesInBox : metric === "foulsWon" ? stat.foulsWon : stat.penaltiesWon;
  const direct = numericOrNull(explicit);
  if (direct !== null) return { value: direct, matchedLabel: "explicit" };
  return extractPenaltyPotentialMetric(stat.statsPayload, metric);
}

function aggregateKey(stat: PenaltyPotentialSourceStat) {
  return [
    idPart(stat.leagueId),
    stat.season ?? "",
    idPart(stat.teamId),
    idPart(stat.playerId)
  ].join(":");
}

function idPart(value: string | number | bigint | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function penaltyPotentialSettings(options: PenaltyPotentialOptions) {
  return {
    minMinutes: options.minMinutes ?? PENALTY_POTENTIAL_DEFAULTS.minMinutes,
    touchesInBoxBaseline: positiveNumberOrDefault(options.touchesInBoxBaseline, PENALTY_POTENTIAL_DEFAULTS.touchesInBoxBaseline),
    foulsWonBaseline: positiveNumberOrDefault(options.foulsWonBaseline, PENALTY_POTENTIAL_DEFAULTS.foulsWonBaseline),
    touchesInBoxWeight: positiveNumberOrDefault(options.touchesInBoxWeight, PENALTY_POTENTIAL_DEFAULTS.touchesInBoxWeight),
    foulsWonWeight: positiveNumberOrDefault(options.foulsWonWeight, PENALTY_POTENTIAL_DEFAULTS.foulsWonWeight),
    includePositionMultiplier: options.includePositionMultiplier ?? true
  };
}

function positiveNumberOrDefault(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function per90(value: number, minutes: number) {
  return minutes > 0 ? (value / minutes) * 90 : 0;
}

function nonNegativeNumber(value: unknown) {
  const parsed = numericOrNull(value);
  if (parsed === null) return null;
  return Math.max(0, parsed);
}

function clampMetricValue(value: number | null, diagnostics: PenaltyPotentialDiagnostics) {
  if (value === null) return 0;
  if (value < 0) {
    diagnostics.negativeValuesClamped += 1;
    return 0;
  }
  return value;
}

function incrementFieldMatch(diagnostics: PenaltyPotentialDiagnostics, metric: PenaltyPotentialMetricKey, label: string) {
  diagnostics.fieldMatches[metric][label] = (diagnostics.fieldMatches[metric][label] ?? 0) + 1;
}

function findNestedMetricNumber(value: unknown, normalizedAliases: Set<string>, depth = 0): MetricExtraction {
  if (depth > 7) return { value: null, matchedLabel: null };

  const direct = metricNumberValue(value);
  if (direct !== null && (typeof value === "number" || typeof value === "string")) {
    return { value: direct, matchedLabel: null };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findNestedMetricNumber(item, normalizedAliases, depth + 1);
      if (result.value !== null) return result;
    }
    return { value: null, matchedLabel: null };
  }

  const record = recordValue(value);
  if (Object.keys(record).length === 0) return { value: null, matchedLabel: null };

  const label = firstString(record.key, record.name, record.title, record.label, record.statName, record.statKey);
  if (label && statLabelMatches(label, normalizedAliases)) {
    const parsed = metricNumberValue(record);
    if (parsed !== null) return { value: parsed, matchedLabel: label };
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    if (statLabelMatches(key, normalizedAliases)) {
      const parsed = metricNumberValue(nestedValue);
      if (parsed !== null) return { value: parsed, matchedLabel: key };
    }
  }

  for (const key of ["stats", "groups", "items", "children", "sections", "values", "raw_stats", "rawStats"]) {
    const result = findNestedMetricNumber(record[key], normalizedAliases, depth + 1);
    if (result.value !== null) return result;
  }

  return { value: null, matchedLabel: null };
}

function statLabelMatches(label: string, normalizedAliases: Set<string>) {
  const normalized = normalizeStatLabel(label);
  for (const alias of normalizedAliases) {
    if (normalized === alias) return true;
    if (alias.length >= 8 && normalized.includes(alias)) return true;
  }
  return false;
}

function normalizeStatLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function metricNumberValue(value: unknown): number | null {
  const direct = numericOrNull(value);
  if (direct !== null) return direct;
  const record = recordValue(value);
  const stat = recordValue(record.stat);
  return (
    numericOrNull(record.value) ??
    numericOrNull(record.displayValue) ??
    numericOrNull(record.total) ??
    numericOrNull(record.count) ??
    numericOrNull(stat.value) ??
    numericOrNull(stat.displayValue) ??
    numericOrNull(stat.total) ??
    numericOrNull(stat.count)
  );
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return String(value);
  }
  return null;
}

function penaltyPotentialFormulaValue(
  touchesInBox90: number,
  foulsWon90: number,
  weights: Pick<PenaltyPotentialOptions, "touchesInBoxWeight" | "foulsWonWeight">,
  includePositionMultiplier: boolean,
  positionMultiplier: number
) {
  const settings = penaltyPotentialSettings({
    touchesInBoxWeight: weights.touchesInBoxWeight,
    foulsWonWeight: weights.foulsWonWeight,
    includePositionMultiplier
  });
  return (
    Math.pow(touchesInBox90 / settings.touchesInBoxBaseline, settings.touchesInBoxWeight) *
    Math.pow(foulsWon90 / settings.foulsWonBaseline, settings.foulsWonWeight) *
    (includePositionMultiplier ? positionMultiplier : 1)
  );
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const xMean = mean(x);
  const yMean = mean(y);
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;

  for (let index = 0; index < x.length; index += 1) {
    const xDelta = x[index] - xMean;
    const yDelta = y[index] - yMean;
    numerator += xDelta * yDelta;
    xDenominator += xDelta * xDelta;
    yDenominator += yDelta * yDelta;
  }

  const denominator = Math.sqrt(xDenominator * yDenominator);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

type AggregateBucket = Omit<PenaltyPotentialInput, "penaltiesWonAvailable"> & {
  minutes: number;
  touchesInBox: number;
  foulsWon: number;
  penaltiesWon: number;
  penaltiesWonAvailable: boolean;
};
