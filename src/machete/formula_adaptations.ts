import generatedModels from "./formula-adaptation-models.generated.json";

import type { FantasyPositionGroup } from "./squad_logic";

export const FORMULA_ADAPTATION_VERSION = "retro-2024-26-ridge-v3-minutes-fnl-floor60";
export const FORMULA_ADAPTATION_STARTER_MINUTE_FLOOR = 60;
export const FORMULA_ADAPTATION_HYPOTHESES = {
  accepted: [
    "player_form",
    "recency_ewm",
    "team_style",
    "possession",
    "recovery_pass",
    "coach",
    "opponent",
    "rest_market"
  ],
  allWithoutWeather: [
    "player_form",
    "recency_ewm",
    "team_style",
    "possession",
    "recovery_pass",
    "coach",
    "formation",
    "opponent",
    "zones",
    "rest_market"
  ]
} as const;

export type FormulaAdaptationFeatureValue = number | string | boolean | null | undefined;
export type FormulaAdaptationFeatures = Record<string, FormulaAdaptationFeatureValue>;

export type FormulaAdaptationForecasts = {
  foPositionCalibratedFp: number | null;
  altPositionCalibratedFp: number | null;
  altJointAllFp: number | null;
  foJointAllFp: number | null;
  altJointAcceptedFp: number | null;
  foJointAcceptedFp: number | null;
};

export type FormulaAdaptationForecastKey = keyof FormulaAdaptationForecasts;
export type FormulaAdaptationBaseName = "fo_current" | "alt_current";
export type FormulaAdaptationProfile = "position" | "jointAll" | "jointAccepted";

export type FormulaAdaptationNumericTerm = {
  name: string;
  rawValue: number | null;
  usedValue: number;
  trainedMedian: number;
  valueSource: "raw" | "trained_median";
  coefficient: number;
  valueContribution: number;
  missingCoefficient: number | null;
  missingContribution: number;
  totalContribution: number;
};

export type FormulaAdaptationCategoricalTerm = {
  name: string;
  category: string;
  coefficientSource: "direct" | "infrequent" | "unmatched";
  coefficient: number;
  contribution: number;
};

export type FormulaAdaptationMinuteGuard = {
  expectedMinutes: number | null;
  starterFloorMinutes: number;
  factor: number;
  applied: boolean;
  beforeGuard: number;
  afterGuard: number;
};

export type FormulaAdaptationBreakdown = {
  version: string;
  baseName: FormulaAdaptationBaseName;
  profile: FormulaAdaptationProfile;
  position: Exclude<FantasyPositionGroup, "UNK">;
  baseValue: number;
  intercept: number;
  numericTerms: FormulaAdaptationNumericTerm[];
  categoricalTerms: FormulaAdaptationCategoricalTerm[];
  numericContributionTotal: number;
  categoricalContributionTotal: number;
  rawPrediction: number;
  predictionClamp: [number, number];
  clampedPrediction: number;
  minuteGuard: FormulaAdaptationMinuteGuard | null;
  minuteAdjustedPrediction: number;
  roundedPrediction: number;
  trainingSamples: number;
  weatherIncluded: false;
  roundFixtures?: FormulaAdaptationRoundFixtureBreakdown[];
};

export type FormulaAdaptationRoundFixtureBreakdown = {
  fixtureId: string;
  fixtureLabel: string;
  breakdown: FormulaAdaptationBreakdown;
};

export type FormulaAdaptationBreakdowns = Record<FormulaAdaptationForecastKey, FormulaAdaptationBreakdown | null>;

export type FormulaAdaptationPrediction = {
  forecasts: FormulaAdaptationForecasts;
  breakdowns: FormulaAdaptationBreakdowns;
};

const formulaAdaptationForecastKeys = [
  "foPositionCalibratedFp",
  "altPositionCalibratedFp",
  "altJointAllFp",
  "foJointAllFp",
  "altJointAcceptedFp",
  "foJointAcceptedFp"
] as const satisfies readonly FormulaAdaptationForecastKey[];

export type FormulaAdaptationPlayerMatch = {
  matchDate: Date | null;
  points: number | null;
  minutes: number | null;
  rating: number | null;
  xg: number | null;
  xa: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  recoveries: number | null;
  chancesCreated: number | null;
};

export type FormulaAdaptationMinuteContext = {
  expectedMinutes?: number | null;
  baseExpectedMinutes?: number | null;
  eventExposureMinutes?: number | null;
  appearanceProbability?: number | null;
  sixtyMinutesProbability?: number | null;
  fullMatchProbability?: number | null;
};

export type FormulaAdaptationTeamStat = {
  teamId: string;
  opponentTeamId?: string | null;
  isHome?: boolean | null;
  goals?: number | null;
  xg?: number | null;
  shots?: number | null;
  shotsOnTarget?: number | null;
  bigChances?: number | null;
  touchesInOppBox?: number | null;
  possession?: number | null;
  passes?: number | null;
  accuratePasses?: number | null;
  passAccuracy?: number | null;
};

export type FormulaAdaptationShot = {
  teamId: string | null;
  normalizedY: number | null;
  xg: number | null;
};

export type FormulaAdaptationTeamMatch = {
  matchDate?: Date | string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  teamStats: FormulaAdaptationTeamStat[];
  shots?: FormulaAdaptationShot[];
};

type NumericFeatureModel = {
  coefficient: number;
  median: number;
  missingCoefficient: number | null;
};

type CategoricalFeatureModel = {
  coefficients: Record<string, number>;
  infrequentCategories: string[];
  infrequentCoefficient: number | null;
};

type PositionModel = {
  intercept: number;
  numeric: Record<string, NumericFeatureModel>;
  categorical: Record<string, CategoricalFeatureModel>;
  trainingSamples: number;
};

type AdaptationArtifact = {
  predictionClamp: [number, number];
  weatherIncluded: boolean;
  models: Record<string, Record<Exclude<FantasyPositionGroup, "UNK">, PositionModel>>;
};

type TeamHistorySample = {
  matchDateMs: number | null;
  values: Record<string, number | null>;
  shotValues: Record<string, number | null>;
};

export type FormulaAdaptationTeamProfile = {
  features: FormulaAdaptationFeatures;
  lastMatchDateMs: number | null;
  matches: number;
};

export type FormulaAdaptationTeamProfiles = Map<string, FormulaAdaptationTeamProfile>;

export type PromotedFormulaAdaptationOptions = {
  strengthFactor: number;
  ratioExponent: number;
  priorMatches: number;
};

const artifact = generatedModels as unknown as AdaptationArtifact;
export const FORMULA_ADAPTATION_WEATHER_INCLUDED = artifact.weatherIncluded;
if (FORMULA_ADAPTATION_WEATHER_INCLUDED) {
  throw new Error("Formula-adaptation artifact must not contain weather features.");
}
const teamMetrics = [
  "goals",
  "xg",
  "shots",
  "shots_on_target",
  "big_chances",
  "touches_in_opp_box",
  "possession",
  "passes",
  "accurate_passes",
  "pass_accuracy"
] as const;
const shotZones = ["left", "center", "right"] as const;
const promotedVolumeMetrics = new Set([
  "goals",
  "xg",
  "shots",
  "shots_on_target",
  "big_chances",
  "touches_in_opp_box",
  "passes",
  "accurate_passes"
]);

export function predictFormulaAdaptations(input: {
  leagueId: string | number | bigint;
  position: FantasyPositionGroup;
  fo: number | null;
  alt: number | null;
  features?: FormulaAdaptationFeatures | null;
}): FormulaAdaptationForecasts {
  return predictFormulaAdaptationsWithBreakdowns(input).forecasts;
}

export function predictFormulaAdaptationsWithBreakdowns(input: {
  leagueId: string | number | bigint;
  position: FantasyPositionGroup;
  fo: number | null;
  alt: number | null;
  features?: FormulaAdaptationFeatures | null;
}): FormulaAdaptationPrediction {
  const shared = {
    ...(input.features ?? {}),
    league_id: String(input.leagueId)
  };
  const variants = {
    foPositionCalibratedFp: predictVariantWithBreakdown("fo_current", "position", input.fo, input.position, shared),
    altPositionCalibratedFp: predictVariantWithBreakdown("alt_current", "position", input.alt, input.position, shared),
    altJointAllFp: predictVariantWithBreakdown("alt_current", "jointAll", input.alt, input.position, shared),
    foJointAllFp: predictVariantWithBreakdown("fo_current", "jointAll", input.fo, input.position, shared),
    altJointAcceptedFp: predictVariantWithBreakdown("alt_current", "jointAccepted", input.alt, input.position, shared),
    foJointAcceptedFp: predictVariantWithBreakdown("fo_current", "jointAccepted", input.fo, input.position, shared)
  } satisfies Record<FormulaAdaptationForecastKey, FormulaAdaptationBreakdown | null>;
  return {
    forecasts: Object.fromEntries(
      Object.entries(variants).map(([key, breakdown]) => [key, breakdown?.roundedPrediction ?? null])
    ) as FormulaAdaptationForecasts,
    breakdowns: variants
  };
}

export function aggregateFormulaAdaptationPredictions(
  fixtures: ReadonlyArray<{
    fixtureId: string;
    fixtureLabel: string;
    prediction: FormulaAdaptationPrediction;
  }>
): FormulaAdaptationPrediction {
  if (fixtures.length === 0) {
    const forecasts = Object.fromEntries(formulaAdaptationForecastKeys.map((key) => [key, null])) as FormulaAdaptationForecasts;
    const breakdowns = Object.fromEntries(formulaAdaptationForecastKeys.map((key) => [key, null])) as FormulaAdaptationBreakdowns;
    return { forecasts, breakdowns };
  }
  if (fixtures.length === 1) return fixtures[0].prediction;

  const forecasts = Object.fromEntries(formulaAdaptationForecastKeys.map((key) => {
    const values = fixtures.map((fixture) => fixture.prediction.forecasts[key]);
    return [key, values.every((value): value is number => typeof value === "number" && Number.isFinite(value))
      ? round(values.reduce((total, value) => total + value, 0))
      : null];
  })) as FormulaAdaptationForecasts;
  const breakdowns = Object.fromEntries(formulaAdaptationForecastKeys.map((key) => {
    const parts = fixtures.flatMap((fixture) => {
      const breakdown = fixture.prediction.breakdowns[key];
      return breakdown ? [{ fixtureId: fixture.fixtureId, fixtureLabel: fixture.fixtureLabel, breakdown }] : [];
    });
    if (parts.length !== fixtures.length || forecasts[key] === null) return [key, null];
    const first = parts[0].breakdown;
    return [key, {
      ...first,
      baseValue: round(parts.reduce((total, part) => total + part.breakdown.baseValue, 0)),
      intercept: round(parts.reduce((total, part) => total + part.breakdown.intercept, 0)),
      numericTerms: [],
      categoricalTerms: [],
      numericContributionTotal: round(parts.reduce((total, part) => total + part.breakdown.numericContributionTotal, 0)),
      categoricalContributionTotal: round(parts.reduce((total, part) => total + part.breakdown.categoricalContributionTotal, 0)),
      rawPrediction: round(parts.reduce((total, part) => total + part.breakdown.rawPrediction, 0)),
      predictionClamp: [
        round(parts.reduce((total, part) => total + part.breakdown.predictionClamp[0], 0)),
        round(parts.reduce((total, part) => total + part.breakdown.predictionClamp[1], 0))
      ],
      clampedPrediction: round(parts.reduce((total, part) => total + part.breakdown.clampedPrediction, 0)),
      minuteGuard: null,
      minuteAdjustedPrediction: round(parts.reduce((total, part) => total + part.breakdown.minuteAdjustedPrediction, 0)),
      roundedPrediction: forecasts[key],
      trainingSamples: Math.min(...parts.map((part) => part.breakdown.trainingSamples)),
      roundFixtures: parts
    } satisfies FormulaAdaptationBreakdown];
  })) as FormulaAdaptationBreakdowns;
  return { forecasts, breakdowns };
}

export function formulaAdaptationMinuteFeatures(
  prefix: "fo" | "alt",
  base: number | null,
  context: FormulaAdaptationMinuteContext | null | undefined
): FormulaAdaptationFeatures {
  const expectedMinutes = numericOrNull(context?.expectedMinutes);
  const eventExposureMinutes = numericOrNull(context?.eventExposureMinutes);
  const baseValue = numericOrNull(base);
  const baseName = `${prefix}_current`;
  return {
    [`${prefix}_expected_minutes`]: expectedMinutes,
    [`${prefix}_expected_minutes_squared`]: expectedMinutes === null ? null : expectedMinutes ** 2,
    [`${prefix}_base_expected_minutes`]: numericOrNull(context?.baseExpectedMinutes),
    [`${prefix}_event_exposure_minutes`]: eventExposureMinutes,
    [`${prefix}_event_exposure_ratio`]:
      expectedMinutes !== null && expectedMinutes > 0 && eventExposureMinutes !== null
        ? eventExposureMinutes / expectedMinutes
        : null,
    [`${prefix}_appearance_probability`]: numericOrNull(context?.appearanceProbability),
    [`${prefix}_sixty_probability`]: numericOrNull(context?.sixtyMinutesProbability),
    [`${prefix}_full_match_probability`]: numericOrNull(context?.fullMatchProbability),
    [`${baseName}_x_expected_minutes_ratio`]:
      baseValue === null || expectedMinutes === null ? null : baseValue * expectedMinutes / 90,
    [`${baseName}_x_event_exposure_ratio`]:
      baseValue === null || eventExposureMinutes === null ? null : baseValue * eventExposureMinutes / 90
  };
}

export function buildFormulaAdaptationPlayerFeatures(matches: FormulaAdaptationPlayerMatch[]): FormulaAdaptationFeatures {
  const ordered = matches
    .filter((match) => (match.minutes ?? 0) > 0)
    .sort((left, right) => dateMs(left.matchDate) - dateMs(right.matchDate));
  const result: FormulaAdaptationFeatures = {};

  for (const window of [3, 5, 10] as const) {
    const selected = ordered.slice(-window);
    const points = finiteValues(selected.map((match) => match.points));
    result[`player_target_h${window}`] = meanOrNull(points);
    result[`player_target_sd_h${window}`] = standardDeviationOrNull(points);
    result[`player_minutes_h${window}`] = meanOrNull(finiteValues(selected.map((match) => match.minutes)));
    result[`player_rating_h${window}`] = meanOrNull(finiteValues(selected.map((match) => match.rating)));
    result[`player_xg_per90_h${window}`] = meanOrNull(per90Values(selected, "xg"));
    result[`player_xa_per90_h${window}`] = meanOrNull(per90Values(selected, "xa"));
    result[`player_shots_per90_h${window}`] = meanOrNull(per90Values(selected, "shots"));
    result[`player_shots_on_target_per90_h${window}`] = meanOrNull(per90Values(selected, "shotsOnTarget"));
    result[`player_recoveries_per90_h${window}`] = meanOrNull(per90Values(selected, "recoveries"));
    result[`player_chances_created_per90_h${window}`] = meanOrNull(per90Values(selected, "chancesCreated"));
    result[`player_history_n_h${window}`] = selected.length;
  }

  for (const halfLife of [3, 5, 10] as const) {
    result[`player_target_points_ewm${halfLife}`] = ewm(ordered.map((match) => match.points), halfLife);
    result[`player_minutes_ewm${halfLife}`] = ewm(ordered.map((match) => match.minutes), halfLife);
    result[`player_rating_ewm${halfLife}`] = ewm(ordered.map((match) => match.rating), halfLife);
    result[`player_recoveries_per90_ewm${halfLife}`] = ewm(per90Nullable(ordered, "recoveries"), halfLife);
    result[`player_xg_per90_ewm${halfLife}`] = ewm(per90Nullable(ordered, "xg"), halfLife);
    result[`player_xa_per90_ewm${halfLife}`] = ewm(per90Nullable(ordered, "xa"), halfLife);
  }

  return result;
}

export function buildFormulaAdaptationTeamProfiles(matches: FormulaAdaptationTeamMatch[]): FormulaAdaptationTeamProfiles {
  const histories = new Map<string, TeamHistorySample[]>();
  const ordered = [...matches].sort((left, right) => dateMs(left.matchDate) - dateMs(right.matchDate));

  for (const match of ordered) {
    const shotValuesByTeam = formulaAdaptationShotValues(match.shots ?? []);
    for (const stat of match.teamStats) {
      const teamId = stat.teamId.trim();
      if (!teamId) continue;
      const opponent =
        match.teamStats.find((candidate) => candidate.teamId === stat.opponentTeamId) ??
        match.teamStats.find((candidate) => candidate.teamId !== teamId) ??
        null;
      const values: Record<string, number | null> = {
        goals: numericOrNull(stat.goals),
        xg: numericOrNull(stat.xg),
        shots: numericOrNull(stat.shots),
        shots_on_target: numericOrNull(stat.shotsOnTarget),
        big_chances: numericOrNull(stat.bigChances),
        touches_in_opp_box: numericOrNull(stat.touchesInOppBox),
        possession: percentOrNull(stat.possession),
        passes: numericOrNull(stat.passes),
        accurate_passes: numericOrNull(stat.accuratePasses),
        pass_accuracy: passAccuracy(stat),
        goals_against: numericOrNull(opponent?.goals),
        xg_against: numericOrNull(opponent?.xg),
        shots_against: numericOrNull(opponent?.shots),
        shots_on_target_against: numericOrNull(opponent?.shotsOnTarget),
        big_chances_against: numericOrNull(opponent?.bigChances),
        touches_in_opp_box_against: numericOrNull(opponent?.touchesInOppBox),
        possession_against: percentOrNull(opponent?.possession),
        passes_against: numericOrNull(opponent?.passes),
        accurate_passes_against: numericOrNull(opponent?.accuratePasses),
        pass_accuracy_against: opponent ? passAccuracy(opponent) : null
      };
      const shotValues = {
        ...(shotValuesByTeam.get(teamId) ?? emptyShotValues()),
        ...allowedShotValues(shotValuesByTeam.get(opponent?.teamId ?? "") ?? null)
      };
      const history = histories.get(teamId) ?? [];
      history.push({ matchDateMs: dateMsOrNull(match.matchDate), values, shotValues });
      histories.set(teamId, history);
    }
  }

  return new Map(
    [...histories].map(([teamId, history]) => {
      const features: FormulaAdaptationFeatures = {};
      for (const window of [3, 5, 10] as const) {
        const selected = history.slice(-window);
        for (const metric of teamMetrics) {
          features[`team_${metric}_h${window}`] = averageFeature(selected, metric, "values");
          features[`team_${metric}_against_h${window}`] = averageFeature(selected, `${metric}_against`, "values");
        }
      }
      for (const window of [5, 10] as const) {
        const selected = history.slice(-window);
        for (const zone of shotZones) {
          for (const prefix of ["shot", "shot_xg"] as const) {
            features[`${prefix}_${zone}_share_h${window}`] = averageFeature(selected, `${prefix}_${zone}_share`, "shotValues");
            features[`${prefix}_${zone}_share_allowed_h${window}`] = averageFeature(selected, `${prefix}_${zone}_share_allowed`, "shotValues");
          }
        }
      }
      return [
        teamId,
        {
          features,
          lastMatchDateMs: [...history].reverse().find((sample) => sample.matchDateMs !== null)?.matchDateMs ?? null,
          matches: history.length
        }
      ];
    })
  );
}

export function addPromotedFormulaAdaptationTeamProfiles(
  topLeague: FormulaAdaptationTeamProfiles,
  feederLeague: FormulaAdaptationTeamProfiles,
  options: PromotedFormulaAdaptationOptions
): FormulaAdaptationTeamProfiles {
  const result = new Map(topLeague);
  const topAverages = formulaAdaptationLeagueAverages(topLeague);
  const feederAverages = formulaAdaptationLeagueAverages(feederLeague);
  for (const [teamId, source] of feederLeague) {
    if (result.has(teamId)) continue;
    result.set(teamId, {
      features: Object.fromEntries(
        Object.entries(source.features).map(([name, value]) => [
          name,
          promotedFormulaAdaptationFeature(
            name,
            value,
            feederAverages[name],
            topAverages[name],
            source.matches,
            options
          )
        ])
      ),
      lastMatchDateMs: source.lastMatchDateMs,
      matches: source.matches
    });
  }
  return result;
}

export function formulaAdaptationFixtureFeatures(input: {
  profiles: FormulaAdaptationTeamProfiles | null | undefined;
  teamId: string;
  opponentTeamId: string | null;
  kickoffAt: Date | null;
  side: "H" | "A" | null;
}): FormulaAdaptationFeatures {
  const own = input.profiles?.get(input.teamId) ?? null;
  const opponent = input.opponentTeamId ? input.profiles?.get(input.opponentTeamId) ?? null : null;
  const features: FormulaAdaptationFeatures = {
    team_id: input.teamId,
    opponent_team_id: input.opponentTeamId,
    is_home: input.side === null ? null : input.side === "H" ? "True" : "False",
    role_side: "unknown"
  };
  copyWithPrefix(features, own?.features, "team_", "own_team_");
  copyWithPrefix(features, opponent?.features, "team_", "opponent_team_");
  copyWithPrefix(features, own?.features, "shot_", "shot_");
  copyWithPrefix(features, opponent?.features, "shot_", "opponent_shot_");

  for (const window of [3, 5, 10] as const) {
    const ownPossession = numericFeature(features, `own_team_possession_h${window}`);
    const ownPossessionAgainst = numericFeature(features, `own_team_possession_against_h${window}`);
    const opponentPossession = numericFeature(features, `opponent_team_possession_h${window}`);
    const opponentPossessionAgainst = numericFeature(features, `opponent_team_possession_against_h${window}`);
    features[`expected_possession_h${window}`] =
      ownPossession === null || opponentPossessionAgainst === null
        ? null
        : (ownPossession + (100 - opponentPossessionAgainst)) / 2;
    features[`expected_opponent_possession_h${window}`] =
      opponentPossession === null || ownPossessionAgainst === null
        ? null
        : (opponentPossession + (100 - ownPossessionAgainst)) / 2;
    features[`expected_opponent_pass_accuracy_h${window}`] =
      numericFeature(features, `opponent_team_pass_accuracy_h${window}`);
  }

  const ownRest = restDays(input.kickoffAt, own?.lastMatchDateMs ?? null);
  const opponentRest = restDays(input.kickoffAt, opponent?.lastMatchDateMs ?? null);
  features.own_days_rest = ownRest;
  features.opponent_days_rest = opponentRest;
  features.rest_advantage = ownRest === null || opponentRest === null ? null : ownRest - opponentRest;
  return features;
}

export function addFormulaAdaptationInteractions(features: FormulaAdaptationFeatures): FormulaAdaptationFeatures {
  const result = { ...features };
  for (const window of [3, 5, 10] as const) {
    const recoveries = numericFeature(result, `player_recoveries_per90_h${window}`);
    const opponentPossession = numericFeature(result, `expected_opponent_possession_h${window}`);
    const opponentPassAccuracy = numericFeature(result, `expected_opponent_pass_accuracy_h${window}`);
    const xg = numericFeature(result, `player_xg_per90_h${window}`);
    const xa = numericFeature(result, `player_xa_per90_h${window}`);
    const possession = numericFeature(result, `expected_possession_h${window}`);
    result[`recovery_x_opp_possession_h${window}`] =
      recoveries === null || opponentPossession === null ? null : recoveries * (opponentPossession - 50) / 10;
    result[`recovery_x_opp_pass_accuracy_h${window}`] =
      recoveries === null || opponentPassAccuracy === null ? null : recoveries * (opponentPassAccuracy - 80) / 10;
    result[`xg_x_own_possession_h${window}`] =
      xg === null || possession === null ? null : xg * (possession - 50) / 10;
    result[`xa_x_own_possession_h${window}`] =
      xa === null || possession === null ? null : xa * (possession - 50) / 10;
  }
  const roleSide = result.role_side;
  if (roleSide === "left" || roleSide === "center" || roleSide === "right") {
    const oppositeSide = roleSide === "left" ? "right" : roleSide === "right" ? "left" : "center";
    const ownAttackShare = numericFeature(result, `shot_${roleSide}_share_h10`);
    const opponentAttackShare = numericFeature(result, `opponent_shot_${oppositeSide}_share_h10`);
    const opponentAllowedShare = numericFeature(result, `opponent_shot_${oppositeSide}_share_allowed_h10`);
    const recoveries = numericFeature(result, "player_recoveries_per90_h10");
    const xg = numericFeature(result, "player_xg_per90_h10");
    result.own_attack_role_share_h10 = ownAttackShare;
    result.opponent_attack_role_share_h10 = opponentAttackShare;
    result.opponent_allowed_role_share_h10 = opponentAllowedShare;
    result.recovery_zone_exposure_h10 =
      recoveries === null || opponentAttackShare === null ? null : recoveries * opponentAttackShare;
    result.scoring_zone_fit_h10 =
      xg === null || ownAttackShare === null || opponentAllowedShare === null
        ? null
        : xg * (ownAttackShare + opponentAllowedShare);
  }
  return result;
}

function predictVariantWithBreakdown(
  baseName: FormulaAdaptationBaseName,
  profile: FormulaAdaptationProfile,
  base: number | null,
  position: FantasyPositionGroup,
  shared: FormulaAdaptationFeatures
): FormulaAdaptationBreakdown | null {
  if (base === null || !Number.isFinite(base) || position === "UNK") return null;
  const model = artifact.models[`${baseName}:${profile}`]?.[position];
  if (!model) return null;
  const features: FormulaAdaptationFeatures = {
    ...shared,
    [baseName]: base,
    [`${baseName}_squared`]: base ** 2,
    [`${baseName}_gk`]: position === "GK" ? base : 0,
    [`${baseName}_def`]: position === "DEF" ? base : 0,
    [`${baseName}_mid`]: position === "MID" ? base : 0,
    [`${baseName}_fwd`]: position === "FWD" ? base : 0
  };
  let prediction = model.intercept;
  const numericTerms: FormulaAdaptationNumericTerm[] = [];
  for (const [name, definition] of Object.entries(model.numeric)) {
    const raw = numericFeature(features, name);
    const usedValue = raw ?? definition.median;
    const valueContribution = definition.coefficient * usedValue;
    const missingContribution = raw === null && definition.missingCoefficient !== null
      ? definition.missingCoefficient
      : 0;
    const totalContribution = valueContribution + missingContribution;
    prediction += totalContribution;
    numericTerms.push({
      name,
      rawValue: raw,
      usedValue,
      trainedMedian: definition.median,
      valueSource: raw === null ? "trained_median" : "raw",
      coefficient: definition.coefficient,
      valueContribution,
      missingCoefficient: definition.missingCoefficient,
      missingContribution,
      totalContribution
    });
  }
  const categoricalTerms: FormulaAdaptationCategoricalTerm[] = [];
  for (const [name, definition] of Object.entries(model.categorical)) {
    const raw = features[name];
    const category = raw === null || raw === undefined ? "__missing__" : String(raw);
    const direct = definition.coefficients[category];
    const coefficientSource = direct !== undefined
      ? "direct"
      : definition.infrequentCategories.includes(category) && definition.infrequentCoefficient !== null
        ? "infrequent"
        : "unmatched";
    const coefficient = direct
      ?? (coefficientSource === "infrequent" ? definition.infrequentCoefficient ?? 0 : 0);
    prediction += coefficient;
    categoricalTerms.push({
      name,
      category,
      coefficientSource,
      coefficient,
      contribution: coefficient
    });
  }
  const [minimum, maximum] = artifact.predictionClamp;
  const clampedPrediction = Math.min(maximum, Math.max(minimum, prediction));
  const minuteGuard = profile === "position"
    ? null
    : formulaAdaptationMinuteGuard(baseName, features, clampedPrediction);
  const minuteAdjustedPrediction = minuteGuard?.afterGuard ?? clampedPrediction;
  return {
    version: FORMULA_ADAPTATION_VERSION,
    baseName,
    profile,
    position,
    baseValue: base,
    intercept: model.intercept,
    numericTerms,
    categoricalTerms,
    numericContributionTotal: numericTerms.reduce((sum, term) => sum + term.totalContribution, 0),
    categoricalContributionTotal: categoricalTerms.reduce((sum, term) => sum + term.contribution, 0),
    rawPrediction: prediction,
    predictionClamp: [minimum, maximum],
    clampedPrediction,
    minuteGuard,
    minuteAdjustedPrediction,
    roundedPrediction: round(minuteAdjustedPrediction),
    trainingSamples: model.trainingSamples,
    weatherIncluded: false
  };
}

function formulaAdaptationMinuteGuard(
  baseName: FormulaAdaptationBaseName,
  features: FormulaAdaptationFeatures,
  prediction: number
): FormulaAdaptationMinuteGuard {
  const prefix = baseName === "fo_current" ? "fo" : "alt";
  const expectedMinutes = numericFeature(features, `${prefix}_expected_minutes`);
  const factor = expectedMinutes === null
    ? 1
    : Math.min(1, Math.max(0, expectedMinutes) / FORMULA_ADAPTATION_STARTER_MINUTE_FLOOR);
  return {
    expectedMinutes,
    starterFloorMinutes: FORMULA_ADAPTATION_STARTER_MINUTE_FLOOR,
    factor,
    applied: factor < 1,
    beforeGuard: prediction,
    afterGuard: prediction * factor
  };
}

function formulaAdaptationShotValues(shots: FormulaAdaptationShot[]) {
  const grouped = new Map<string, FormulaAdaptationShot[]>();
  for (const shot of shots) {
    if (!shot.teamId) continue;
    const rows = grouped.get(shot.teamId) ?? [];
    rows.push(shot);
    grouped.set(shot.teamId, rows);
  }
  return new Map(
    [...grouped].map(([teamId, rows]) => {
      const totalXg = rows.reduce((sum, row) => sum + (numericOrNull(row.xg) ?? 0), 0);
      const output: Record<string, number | null> = {};
      for (const zone of shotZones) {
        const selected = rows.filter((row) => shotZone(row.normalizedY) === zone);
        const zoneXg = selected.reduce((sum, row) => sum + (numericOrNull(row.xg) ?? 0), 0);
        output[`shot_${zone}_share`] = rows.length > 0 ? selected.length / rows.length : null;
        output[`shot_xg_${zone}_share`] = totalXg > 0 ? zoneXg / totalXg : null;
      }
      return [teamId, output];
    })
  );
}

function formulaAdaptationLeagueAverages(profiles: FormulaAdaptationTeamProfiles) {
  const valuesByFeature = new Map<string, number[]>();
  for (const profile of profiles.values()) {
    for (const [name, raw] of Object.entries(profile.features)) {
      const value = numericOrNull(raw);
      if (value === null) continue;
      const values = valuesByFeature.get(name) ?? [];
      values.push(value);
      valuesByFeature.set(name, values);
    }
  }
  return Object.fromEntries(
    [...valuesByFeature].map(([name, values]) => [name, meanOrNull(values)])
  ) as Record<string, number | null>;
}

function promotedFormulaAdaptationFeature(
  name: string,
  rawValue: FormulaAdaptationFeatureValue,
  feederAverageValue: number | null | undefined,
  topAverageValue: number | null | undefined,
  matches: number,
  options: PromotedFormulaAdaptationOptions
) {
  const value = numericOrNull(rawValue);
  const feederAverage = numericOrNull(feederAverageValue);
  const topAverage = numericOrNull(topAverageValue);
  const match = /^team_(.+)_h(3|5|10)$/.exec(name);
  if (value === null || feederAverage === null || topAverage === null || !match) return rawValue;
  const metric = match[1];
  const window = Number(match[2]);
  const sampleMatches = Math.min(Math.max(0, matches), window);
  if (promotedVolumeMetrics.has(metric)) {
    if (feederAverage <= 0) return rawValue;
    return topAverage * promotedFormulaStrengthRatio(value / feederAverage, sampleMatches, options);
  }
  if (metric.endsWith("_against") && promotedVolumeMetrics.has(metric.slice(0, -"_against".length))) {
    if (value <= 0) return rawValue;
    return topAverage / promotedFormulaStrengthRatio(feederAverage / value, sampleMatches, options);
  }
  const priorMatches = Math.max(0, options.priorMatches);
  const reliability = sampleMatches + priorMatches > 0 ? sampleMatches / (sampleMatches + priorMatches) : 0;
  const adjusted = topAverage + (value - feederAverage) * reliability;
  return metric === "possession" || metric === "possession_against" || metric === "pass_accuracy" || metric === "pass_accuracy_against"
    ? Math.min(100, Math.max(0, adjusted))
    : adjusted;
}

function promotedFormulaStrengthRatio(
  ratio: number,
  matches: number,
  options: PromotedFormulaAdaptationOptions
) {
  const priorMatches = Math.max(0, options.priorMatches);
  const safeRatio = Math.min(2, Math.max(0.5, ratio));
  const shrunkRatio = matches + priorMatches > 0
    ? (matches * safeRatio + priorMatches) / (matches + priorMatches)
    : 1;
  return Math.max(Number.EPSILON, options.strengthFactor) * shrunkRatio ** options.ratioExponent;
}

function emptyShotValues() {
  return Object.fromEntries(
    shotZones.flatMap((zone) => [
      [`shot_${zone}_share`, null],
      [`shot_xg_${zone}_share`, null]
    ])
  ) as Record<string, number | null>;
}

function allowedShotValues(values: Record<string, number | null> | null) {
  return Object.fromEntries(
    Object.entries(values ?? emptyShotValues()).map(([key, value]) => [`${key}_allowed`, value])
  );
}

function shotZone(value: number | null) {
  const y = numericOrNull(value);
  if (y === null) return "center";
  if (y < 100 / 3) return "right";
  if (y > 200 / 3) return "left";
  return "center";
}

function passAccuracy(stat: FormulaAdaptationTeamStat) {
  const direct = percentOrNull(stat.passAccuracy);
  if (direct !== null) return direct;
  const passes = numericOrNull(stat.passes);
  const accurate = numericOrNull(stat.accuratePasses);
  return passes && accurate !== null ? accurate / passes * 100 : null;
}

function copyWithPrefix(
  target: FormulaAdaptationFeatures,
  source: FormulaAdaptationFeatures | null | undefined,
  sourcePrefix: string,
  targetPrefix: string
) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (key.startsWith(sourcePrefix)) target[`${targetPrefix}${key.slice(sourcePrefix.length)}`] = value;
  }
}

function averageFeature(
  samples: TeamHistorySample[],
  key: string,
  source: "values" | "shotValues"
) {
  return meanOrNull(finiteValues(samples.map((sample) => sample[source][key])));
}

function per90Values(
  matches: FormulaAdaptationPlayerMatch[],
  key: "xg" | "xa" | "shots" | "shotsOnTarget" | "recoveries" | "chancesCreated"
) {
  return finiteValues(per90Nullable(matches, key));
}

function per90Nullable(
  matches: FormulaAdaptationPlayerMatch[],
  key: "xg" | "xa" | "shots" | "shotsOnTarget" | "recoveries" | "chancesCreated"
) {
  return matches.map((match) => {
    const value = numericOrNull(match[key]);
    const minutes = numericOrNull(match.minutes);
    return value === null || minutes === null || minutes <= 0 ? null : value * 90 / minutes;
  });
}

function ewm(values: Array<number | null>, halfLife: number) {
  const alpha = 1 - Math.exp(-Math.log(2) / halfLife);
  let result: number | null = null;
  for (const raw of values) {
    const value = numericOrNull(raw);
    if (value === null) continue;
    result = result === null ? value : (1 - alpha) * result + alpha * value;
  }
  return result;
}

function restDays(kickoffAt: Date | null, lastMatchDateMs: number | null) {
  if (!kickoffAt || lastMatchDateMs === null) return null;
  return Math.min(30, Math.max(0, (kickoffAt.getTime() - lastMatchDateMs) / 86_400_000));
}

function numericFeature(features: FormulaAdaptationFeatures, key: string) {
  return numericOrNull(features[key]);
}

function finiteValues(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function meanOrNull(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviationOrNull(values: number[]) {
  if (values.length === 0) return null;
  const average = meanOrNull(values) ?? 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function numericOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentOrNull(value: unknown) {
  const number = numericOrNull(value);
  if (number === null) return null;
  return number >= 0 && number <= 1 ? number * 100 : number;
}

function dateMs(value: Date | string | null | undefined) {
  return dateMsOrNull(value) ?? Number.NEGATIVE_INFINITY;
}

function dateMsOrNull(value: Date | string | null | undefined) {
  const parsed = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
