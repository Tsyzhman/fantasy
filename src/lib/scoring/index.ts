import type { FantasyModel, FantasyModelRule } from "@prisma/client";

import { prisma } from "../db";
import { calculateCustomFormulaScore } from "./formula";
import { seedRules } from "./rules";

export type ScoringRule = Pick<FantasyModelRule, "positionGroup" | "metricKey" | "weight" | "transform" | "enabled">;
export type ScoringModelSource = "WYSCOUT" | "MACHETE";

export type ActiveScoringModel = Pick<
  FantasyModel,
  | "modelSource"
  | "customFormula"
  | "customFormulaGk"
  | "customFormulaDef"
  | "customFormulaMid"
  | "customFormulaFwd"
  | "customFormulaEnabled"
  | "scoringFormulaGk"
  | "scoringFormulaDef"
  | "scoringFormulaMid"
  | "scoringFormulaFwd"
  | "scoringFormulaEnabled"
  | "alternativeFormulaGk"
  | "alternativeFormulaDef"
  | "alternativeFormulaMid"
  | "alternativeFormulaFwd"
  | "alternativeFormulaEnabled"
> & {
  rules: ScoringRule[];
};

export async function getActiveScoringModel(): Promise<ActiveScoringModel> {
  return getActiveScoringModelForSource("WYSCOUT");
}

export async function getActiveScoringModelForSource(source: ScoringModelSource): Promise<ActiveScoringModel> {
  const model = await prisma.fantasyModel.findFirst({
    where: { modelSource: source, isDefault: true, isActive: true },
    include: {
      rules: {
        where: { enabled: true }
      }
    }
  });

  if (model) {
    return mapActiveModel(model, source);
  }

  if (source === "MACHETE") {
    const wyscoutModel = await prisma.fantasyModel.findFirst({
      where: { modelSource: "WYSCOUT", isDefault: true, isActive: true },
      include: {
        rules: {
          where: { enabled: true }
        }
      }
    });

    if (wyscoutModel) return mapActiveModel(wyscoutModel, "MACHETE");
  }

  return {
    modelSource: source,
    customFormula: null,
    customFormulaGk: null,
    customFormulaDef: null,
    customFormulaMid: null,
    customFormulaFwd: null,
    customFormulaEnabled: false,
    scoringFormulaGk: null,
    scoringFormulaDef: null,
    scoringFormulaMid: null,
    scoringFormulaFwd: null,
    scoringFormulaEnabled: false,
    alternativeFormulaGk: null,
    alternativeFormulaDef: null,
    alternativeFormulaMid: null,
    alternativeFormulaFwd: null,
    alternativeFormulaEnabled: false,
    rules: seedScoringRules()
  };
}

function mapActiveModel(
  model: FantasyModel & { rules: ScoringRule[] },
  source: ScoringModelSource
): ActiveScoringModel {
  return {
    modelSource: source,
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
    rules: model.rules.length ? model.rules : seedScoringRules()
  };
}

export async function getActiveScoringRules(): Promise<ScoringRule[]> {
  const model = await getActiveScoringModel();
  return model.rules;
}

function seedScoringRules() {
  return seedRules.map((rule) => ({
    positionGroup: rule.positionGroup,
    metricKey: rule.metricKey,
    weight: rule.weight,
    transform: rule.transform ?? "linear",
    enabled: rule.enabled ?? true
  }));
}

export function calculateFantasyScore(
  rawMetrics: Record<string, unknown>,
  positionGroup: string | null | undefined,
  modelOrRules: ActiveScoringModel | ScoringRule[]
) {
  if (!Array.isArray(modelOrRules) && modelOrRules.customFormulaEnabled) {
    const customFormula = selectCustomFormula(modelOrRules, positionGroup);
    if (customFormula) return round(calculateCustomFormulaScore(customFormula, enrichPredictedFormulaMetrics(rawMetrics)));
  }

  return calculatePredictedRoundScore(rawMetrics, positionGroup);
}

export function calculateAlternativeScore(
  rawMetrics: Record<string, unknown>,
  positionGroup: string | null | undefined,
  model: ActiveScoringModel
) {
  if (!model.alternativeFormulaEnabled) return null;

  const formula = selectAlternativeFormula(model, positionGroup);
  if (!formula) return null;

  return round(calculateCustomFormulaScore(formula, enrichFormulaMetrics(rawMetrics)));
}

export function calculateScoringScore(
  rawMetrics: Record<string, unknown>,
  positionGroup: string | null | undefined,
  model: ActiveScoringModel
) {
  if (model.scoringFormulaEnabled) {
    const formula = selectScoringFormula(model, positionGroup);
    if (formula) return round(calculateCustomFormulaScore(formula, enrichFormulaMetrics(rawMetrics)));
  }

  return calculateAggregateScoringScore(rawMetrics, positionGroup);
}

export function calculatePredictedRoundScore(rawMetrics: Record<string, unknown>, positionGroup: string | null | undefined) {
  const position = positionGroup ?? "UNKNOWN";
  const matches = readMetric(rawMetrics, "matches_played");
  const minutes = readMetric(rawMetrics, "minutes_played");
  const expectedMinutes = expectedMinutesFromMetrics(rawMetrics, matches, minutes);
  const minutesFactor = expectedMinutes / 90;
  const likelyAppearance = expectedMinutes > 0 ? 1 : 0;
  const likelySixty = expectedMinutes >= 60 ? 1 : 0;
  const likelyFullMatch = expectedMinutes >= 89.5 ? 1 : 0;

  let total = 0;

  total += likelyAppearance;
  total += likelySixty;
  if (position === "MID" || position === "FWD") total += likelyFullMatch;

  total += expectedOutcomePerMatch(rawMetrics, "xg", "xg_per_90", "goals", "goals_per_90", minutesFactor, matches, minutes) * goalWeight(position);
  total += expectedOutcomePerMatch(rawMetrics, "xa", "xa_per_90", "assists", "assists_per_90", minutesFactor, matches, minutes) * 3;
  total += perMatchFromTotal(rawMetrics, "fantasy_assists|fantasy_assist", matches) * 3;

  if (position === "GK" || position === "DEF" || position === "MID") {
    total += perMatchFromTotal(rawMetrics, "clean_sheets|clean_sheet", matches) * cleanSheetWeight(position);
  }

  if (position === "GK") {
    const saves = expectedSaves(rawMetrics, minutesFactor, matches);
    total += saves / 3;
    total += perMatchFromTotal(rawMetrics, "penalties_saved|penalty_saves", matches) * 5;
  }

  if (position === "DEF" || position === "MID" || position === "FWD") {
    total +=
      expectedPerMatch(
        rawMetrics,
        "recoveries|possession_recoveries",
        "recoveries_per_90|possession_recoveries_per_90",
        minutesFactor,
        matches
      ) / 3;
  }

  total -= perMatchFromTotal(rawMetrics, "fouls_leading_to_penalty|penalties_conceded", matches) * 2;
  total -= expectedMissedPenalties(rawMetrics, matches) * 2;
  total -= perMatchFromTotal(rawMetrics, "own_goals|own_goal", matches) * 2;

  if (position === "GK" || position === "DEF") {
    total -= expectedPerMatch(rawMetrics, "goals_conceded|conceded_goals", "goals_conceded_per_90|conceded_goals_per_90", minutesFactor, matches) / 2;
  }

  total -= expectedPerMatch(rawMetrics, "yellow_cards", "yellow_cards_per_90", minutesFactor, matches);
  total -= expectedPerMatch(rawMetrics, "red_cards", "red_cards_per_90", minutesFactor, matches) * 3;

  return round(total);
}

function selectCustomFormula(model: ActiveScoringModel, positionGroup: string | null | undefined) {
  const formula =
    positionGroup === "GK"
      ? model.customFormulaGk
      : positionGroup === "DEF"
        ? model.customFormulaDef
        : positionGroup === "MID"
          ? model.customFormulaMid
          : positionGroup === "FWD"
            ? model.customFormulaFwd
            : null;

  return formula?.trim() || model.customFormula?.trim() || null;
}

function selectAlternativeFormula(model: ActiveScoringModel, positionGroup: string | null | undefined) {
  const formula =
    positionGroup === "GK"
      ? model.alternativeFormulaGk
      : positionGroup === "DEF"
        ? model.alternativeFormulaDef
        : positionGroup === "MID"
          ? model.alternativeFormulaMid
          : positionGroup === "FWD"
            ? model.alternativeFormulaFwd
            : null;

  return formula?.trim() || null;
}

function selectScoringFormula(model: ActiveScoringModel, positionGroup: string | null | undefined) {
  const formula =
    positionGroup === "GK"
      ? model.scoringFormulaGk
      : positionGroup === "DEF"
        ? model.scoringFormulaDef
        : positionGroup === "MID"
          ? model.scoringFormulaMid
          : positionGroup === "FWD"
            ? model.scoringFormulaFwd
            : null;

  return formula?.trim() || null;
}

export function calculateAggregateScoringScore(rawMetrics: Record<string, unknown>, positionGroup: string | null | undefined) {
  const position = positionGroup ?? "UNKNOWN";
  const matches = readMetric(rawMetrics, "matches_played");
  const minutes = readMetric(rawMetrics, "minutes_played");
  const appearances = matches > 0 ? matches : minutes > 0 ? 1 : 0;
  const sixtyMinuteBonuses =
    readOptionalMetric(rawMetrics, "appearances_60|sixty_minute_appearances|60_minute_appearances") ??
    clamp(Math.floor(minutes / 60), 0, appearances);
  const fullMatchBonuses =
    readOptionalMetric(rawMetrics, "full_matches|full_match_appearances") ??
    clamp(Math.floor(minutes / 90), 0, appearances);

  let total = 0;

  total += appearances;
  total += sixtyMinuteBonuses;
  if (position === "MID" || position === "FWD") total += fullMatchBonuses;

  total += readMetric(rawMetrics, "goals") * goalWeight(position);
  total += readMetric(rawMetrics, "assists") * 3;
  total += readMetric(rawMetrics, "fantasy_assists|fantasy_assist") * 3;

  if (position === "GK" || position === "DEF" || position === "MID") {
    total += readMetric(rawMetrics, "clean_sheets|clean_sheet") * cleanSheetWeight(position);
  }

  if (position === "GK") {
    total += Math.floor(readMetric(rawMetrics, "saves") / 3);
    total += readMetric(rawMetrics, "penalties_saved|penalty_saves") * 5;
  }

  if (position === "DEF" || position === "MID" || position === "FWD") {
    total += Math.floor(readMetric(rawMetrics, "recoveries|possession_recoveries") / 3);
  }

  total -= readMetric(rawMetrics, "fouls_leading_to_penalty|penalties_conceded") * 2;
  total -= readMetric(rawMetrics, "missed_penalties|penalties_missed") * 2;
  total -= readMetric(rawMetrics, "own_goals|own_goal") * 2;

  if (position === "GK" || position === "DEF") {
    total -= Math.floor(readMetric(rawMetrics, "goals_conceded|conceded_goals") / 2);
  }

  total -= readMetric(rawMetrics, "yellow_cards");
  total -= readMetric(rawMetrics, "red_cards") * 3;

  return round(total);
}

export function enrichFormulaMetrics(rawMetrics: Record<string, unknown>) {
  const metrics = { ...rawMetrics };
  const matches = readMetric(metrics, "matches_played");
  const minutes = readMetric(metrics, "minutes_played");
  const expectedMinutes = expectedMinutesFromMetrics(metrics, matches, minutes);
  const minutesFactor = expectedMinutes / 90;
  const appearances = matches > 0 ? matches : minutes > 0 ? 1 : 0;
  const sixtyMinuteCount =
    readOptionalMetric(metrics, "appearances_60|sixty_minute_appearances|60_minute_appearances") ??
    clamp(Math.floor(minutes / 60), 0, appearances);
  const fullMatchCount =
    readOptionalMetric(metrics, "full_matches|full_match_appearances") ?? clamp(Math.floor(minutes / 90), 0, appearances);

  setMetricIfMissing(metrics, "expected_minutes", expectedMinutes);
  setMetricIfMissing(metrics, "minutes_factor", minutesFactor);
  setMetricIfMissing(metrics, "appearance_bonus", expectedMinutes > 0 ? 1 : 0);
  setMetricIfMissing(metrics, "60min_bonus", expectedMinutes >= 60 ? 1 : 0);
  setMetricIfMissing(metrics, "full_match_bonus", expectedMinutes >= 89.5 ? 1 : 0);
  setMetricIfMissing(metrics, "appearance_count", appearances);
  setMetricIfMissing(metrics, "60min_count", sixtyMinuteCount);
  setMetricIfMissing(metrics, "full_match_count", fullMatchCount);
  setMetricIfMissing(metrics, "goals_per_match", perMatchFromTotal(metrics, "goals", matches));
  setMetricIfMissing(metrics, "xg_per_match", perMatchFromTotal(metrics, "xg", matches));
  setMetricIfMissing(metrics, "assists_per_match", perMatchFromTotal(metrics, "assists", matches));
  setMetricIfMissing(metrics, "xa_per_match", perMatchFromTotal(metrics, "xa", matches));
  setMetricIfMissing(metrics, "expected_goals_per_match", expectedOutcomePerMatch(metrics, "xg", "xg_per_90", "goals", "goals_per_90", minutesFactor, matches, minutes));
  setMetricIfMissing(metrics, "expected_assists_per_match", expectedOutcomePerMatch(metrics, "xa", "xa_per_90", "assists", "assists_per_90", minutesFactor, matches, minutes));
  setMetricIfMissing(metrics, "fantasy_assists", readMetric(metrics, "fantasy_assists|fantasy_assist"));
  setMetricIfMissing(metrics, "fantasy_assists_per_match", perMatchFromTotal(metrics, "fantasy_assists|fantasy_assist", matches));
  setMetricIfMissing(metrics, "clean_sheet_probability", perMatchFromTotal(metrics, "clean_sheets|clean_sheet", matches));
  setMetricIfMissing(metrics, "expected_saves", expectedSaves(metrics, minutesFactor, matches));
  setMetricIfMissing(metrics, "penalty_saves", readMetric(metrics, "penalties_saved|penalty_saves"));
  setMetricIfMissing(metrics, "penalty_saves_per_match", perMatchFromTotal(metrics, "penalties_saved|penalty_saves", matches));
  setMetricIfMissing(metrics, "penalties_conceded", readMetric(metrics, "fouls_leading_to_penalty|penalties_conceded"));
  setMetricIfMissing(metrics, "penalties_conceded_per_match", perMatchFromTotal(metrics, "fouls_leading_to_penalty|penalties_conceded", matches));
  setMetricIfMissing(metrics, "missed_penalties", readMetric(metrics, "missed_penalties|penalties_missed"));
  setMetricIfMissing(metrics, "missed_penalties_per_match", expectedMissedPenalties(metrics, matches));
  setMetricIfMissing(metrics, "own_goals_per_match", perMatchFromTotal(metrics, "own_goals|own_goal", matches));
  setMetricIfMissing(
    metrics,
    "expected_goals_conceded",
    expectedPerMatch(metrics, "goals_conceded|conceded_goals", "goals_conceded_per_90|conceded_goals_per_90", minutesFactor, matches)
  );
  setMetricIfMissing(metrics, "expected_yellow_cards", expectedPerMatch(metrics, "yellow_cards", "yellow_cards_per_90", minutesFactor, matches));
  setMetricIfMissing(metrics, "expected_red_cards", expectedPerMatch(metrics, "red_cards", "red_cards_per_90", minutesFactor, matches));
  setMetricIfMissing(
    metrics,
    "expected_recoveries",
    expectedPerMatch(metrics, "recoveries|possession_recoveries", "recoveries_per_90|possession_recoveries_per_90", minutesFactor, matches)
  );
  setMetricIfMissing(metrics, "recoveries", readMetric(metrics, "recoveries|possession_recoveries"));
  setMetricIfMissing(metrics, "goals_conceded", readMetric(metrics, "goals_conceded|conceded_goals"));
  setMetricIfMissing(metrics, "goals_per_90", per90FromTotal(metrics, "goals", minutes));
  setMetricIfMissing(metrics, "xg_per_90", per90FromTotal(metrics, "xg", minutes));
  setMetricIfMissing(metrics, "assists_per_90", per90FromTotal(metrics, "assists", minutes));
  setMetricIfMissing(metrics, "xa_per_90", per90FromTotal(metrics, "xa", minutes));

  return metrics;
}

function enrichPredictedFormulaMetrics(rawMetrics: Record<string, unknown>) {
  const metrics = enrichFormulaMetrics(rawMetrics);
  const matches = readMetric(metrics, "matches_played");
  const minutes = readMetric(metrics, "minutes_played");
  const expectedMinutes = expectedMinutesFromMetrics(metrics, matches, minutes);
  const minutesFactor = expectedMinutes / 90;
  const expectedGoals = expectedOutcomePerMatch(rawMetrics, "xg", "xg_per_90", "goals", "goals_per_90", minutesFactor, matches, minutes);
  const expectedXg = expectedExpectedPerMatch(rawMetrics, "xg", "xg_per_90", minutesFactor, matches, minutes) ?? 0;
  const expectedAssists = expectedOutcomePerMatch(rawMetrics, "xa", "xa_per_90", "assists", "assists_per_90", minutesFactor, matches, minutes);
  const expectedXa = expectedExpectedPerMatch(rawMetrics, "xa", "xa_per_90", minutesFactor, matches, minutes) ?? 0;
  const expectedFantasyAssists = perMatchFromTotal(metrics, "fantasy_assists|fantasy_assist", matches);
  const expectedCleanSheets = perMatchFromTotal(metrics, "clean_sheets|clean_sheet", matches);
  const expectedPenaltySaves = perMatchFromTotal(metrics, "penalties_saved|penalty_saves", matches);
  const expectedPenaltiesConceded = perMatchFromTotal(metrics, "fouls_leading_to_penalty|penalties_conceded", matches);
  const expectedMissed = expectedMissedPenalties(metrics, matches);
  const expectedOwnGoals = perMatchFromTotal(metrics, "own_goals|own_goal", matches);
  const expectedGoalsConceded = expectedPerMatch(
    metrics,
    "goals_conceded|conceded_goals",
    "goals_conceded_per_90|conceded_goals_per_90",
    minutesFactor,
    matches
  );
  const expectedYellowCards = expectedPerMatch(metrics, "yellow_cards", "yellow_cards_per_90", minutesFactor, matches);
  const expectedRedCards = expectedPerMatch(metrics, "red_cards", "red_cards_per_90", minutesFactor, matches);
  const expectedRecoveries = expectedPerMatch(
    metrics,
    "recoveries|possession_recoveries",
    "recoveries_per_90|possession_recoveries_per_90",
    minutesFactor,
    matches
  );

  setMetric(metrics, "matches_played", expectedMinutes > 0 ? 1 : 0);
  setMetric(metrics, "minutes_played", expectedMinutes);
  setMetric(metrics, "goals", expectedGoals);
  setMetric(metrics, "xg", expectedXg);
  setMetric(metrics, "assists", expectedAssists);
  setMetric(metrics, "xa", expectedXa);
  setMetric(metrics, "fantasy_assists", expectedFantasyAssists);
  setMetric(metrics, "clean_sheets", expectedCleanSheets);
  setMetric(metrics, "clean_sheet", expectedCleanSheets);
  setMetric(metrics, "saves", expectedSaves(metrics, minutesFactor, matches));
  setMetric(metrics, "penalties_saved", expectedPenaltySaves);
  setMetric(metrics, "penalty_saves", expectedPenaltySaves);
  setMetric(metrics, "fouls_leading_to_penalty", expectedPenaltiesConceded);
  setMetric(metrics, "penalties_conceded", expectedPenaltiesConceded);
  setMetric(metrics, "missed_penalties", expectedMissed);
  setMetric(metrics, "penalties_missed", expectedMissed);
  setMetric(metrics, "own_goals", expectedOwnGoals);
  setMetric(metrics, "own_goal", expectedOwnGoals);
  setMetric(metrics, "goals_conceded", expectedGoalsConceded);
  setMetric(metrics, "conceded_goals", expectedGoalsConceded);
  setMetric(metrics, "yellow_cards", expectedYellowCards);
  setMetric(metrics, "red_cards", expectedRedCards);
  setMetric(metrics, "recoveries", expectedRecoveries);
  setMetric(metrics, "possession_recoveries", expectedRecoveries);
  setProjectedTotalMetrics(metrics, minutesFactor, matches, [
    ["shots", "shots_per_90"],
    ["shots_on_target", "shots_on_target_per_90"],
    ["key_passes", "key_passes_per_90"],
    ["tackles", "tackles_per_90"],
    ["interceptions", "interceptions_per_90"],
    ["non_penalty_goals", "non_penalty_goals_per_90"],
    ["head_goals", "head_goals_per_90"],
    ["penalties_taken", ""]
  ]);

  return metrics;
}

function setProjectedTotalMetrics(
  metrics: Record<string, unknown>,
  minutesFactor: number,
  matches: number,
  metricKeys: Array<[totalKey: string, per90Key: string]>
) {
  for (const [totalKey, per90Key] of metricKeys) {
    setMetric(metrics, totalKey, per90Key ? expectedPerMatch(metrics, totalKey, per90Key, minutesFactor, matches) : perMatchFromTotal(metrics, totalKey, matches));
  }
}

function expectedPerMatch(
  rawMetrics: Record<string, unknown>,
  totalKey: string,
  per90Key: string,
  minutesFactor: number,
  matches: number
) {
  const per90 = readMetric(rawMetrics, per90Key);
  if (per90 > 0) return per90 * minutesFactor;

  return perMatchFromTotal(rawMetrics, totalKey, matches);
}

function expectedOutcomePerMatch(
  rawMetrics: Record<string, unknown>,
  expectedTotalKey: string,
  expectedPer90Key: string,
  actualTotalKey: string,
  actualPer90Key: string,
  minutesFactor: number,
  matches: number,
  minutes: number
) {
  const expected = expectedExpectedPerMatch(rawMetrics, expectedTotalKey, expectedPer90Key, minutesFactor, matches, minutes);
  if (expected !== null) return expected;

  return expectedPerMatch(rawMetrics, actualTotalKey, actualPer90Key, minutesFactor, matches);
}

function expectedExpectedPerMatch(
  rawMetrics: Record<string, unknown>,
  totalKey: string,
  per90Key: string,
  minutesFactor: number,
  matches: number,
  minutes: number
) {
  const per90 = readOptionalMetric(rawMetrics, per90Key);
  if (per90 !== null) return per90 * minutesFactor;

  const total = readOptionalMetric(rawMetrics, totalKey);
  if (total === null) return null;
  if (minutes > 0) return (total / minutes) * 90 * minutesFactor;
  if (matches > 0) return total / matches;

  return null;
}

function expectedMinutesFromMetrics(rawMetrics: Record<string, unknown>, matches: number, minutes: number) {
  const expectedMinutes = readMetric(rawMetrics, "expected_minutes|projected_minutes");
  if (expectedMinutes > 0) return clamp(expectedMinutes, 0, 90);

  return matches > 0 ? clamp(minutes / matches, 0, 90) : 0;
}

function perMatchFromTotal(rawMetrics: Record<string, unknown>, metricKey: string, matches: number) {
  if (matches <= 0) return 0;
  return readMetric(rawMetrics, metricKey) / matches;
}

function per90FromTotal(rawMetrics: Record<string, unknown>, metricKey: string, minutes: number) {
  if (minutes <= 0) return 0;
  return (readMetric(rawMetrics, metricKey) / minutes) * 90;
}

function setMetricIfMissing(metrics: Record<string, unknown>, key: string, value: number) {
  if (metrics[key] === null || metrics[key] === undefined || metrics[key] === "") {
    metrics[key] = round(value);
  }
}

function setMetric(metrics: Record<string, unknown>, key: string, value: number) {
  metrics[key] = round(value);
}

function expectedSaves(rawMetrics: Record<string, unknown>, minutesFactor: number, matches: number) {
  const saves = perMatchFromTotal(rawMetrics, "saves", matches);
  if (saves > 0) return saves;

  const shotsAgainst = readMetric(rawMetrics, "shots_against_per_90") * minutesFactor;
  const saveRate = readMetric(rawMetrics, "save_rate_percent") / 100;
  return shotsAgainst * clamp(saveRate, 0, 1);
}

function expectedMissedPenalties(rawMetrics: Record<string, unknown>, matches: number) {
  const missed = perMatchFromTotal(rawMetrics, "missed_penalties|penalties_missed", matches);
  if (missed > 0) return missed;

  const penaltiesTaken = perMatchFromTotal(rawMetrics, "penalties_taken", matches);
  const conversion = readMetric(rawMetrics, "penalty_conversion_percent");
  if (penaltiesTaken > 0 && conversion > 0) return penaltiesTaken * (1 - clamp(conversion / 100, 0, 1));

  return 0;
}

function goalWeight(position: string) {
  if (position === "GK" || position === "DEF") return 6;
  if (position === "MID") return 5;
  if (position === "FWD") return 4;
  return 4;
}

function cleanSheetWeight(position: string) {
  if (position === "GK" || position === "DEF") return 4;
  if (position === "MID") return 1;
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateValueScore(fantasyScore: number | null, marketValue: number | null) {
  if (fantasyScore === null || marketValue === null || marketValue <= 0) return null;
  return round(fantasyScore / Math.max(marketValue / 1_000_000, 0.1));
}

function readMetric(rawMetrics: Record<string, unknown>, metricKey: string) {
  return readOptionalMetric(rawMetrics, metricKey) ?? 0;
}

function readOptionalMetric(rawMetrics: Record<string, unknown>, metricKey: string) {
  const aliases = metricKey.split("|").map((key) => key.trim()).filter(Boolean);

  for (const alias of aliases) {
    const value = rawMetrics[alias];
    if (value === null || value === undefined || value === "") continue;

    const numeric = numericMetric(value);
    if (numeric !== null) return numeric;
  }

  return null;
}

function numericMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
