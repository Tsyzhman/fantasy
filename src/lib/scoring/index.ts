import type { FantasyModel, FantasyModelRule } from "@prisma/client";

import { prisma } from "../db";
import { calculateCustomFormulaScore } from "./formula";
import { seedRules } from "./rules";

export type ScoringRule = Pick<FantasyModelRule, "positionGroup" | "metricKey" | "weight" | "transform" | "enabled">;
export type ActiveScoringModel = Pick<
  FantasyModel,
  "customFormula" | "customFormulaGk" | "customFormulaDef" | "customFormulaMid" | "customFormulaFwd" | "customFormulaEnabled"
> & {
  rules: ScoringRule[];
};

export async function getActiveScoringModel(): Promise<ActiveScoringModel> {
  const model = await prisma.fantasyModel.findFirst({
    where: { isDefault: true, isActive: true },
    include: {
      rules: {
        where: { enabled: true }
      }
    }
  });

  if (model) {
    return {
      customFormula: model.customFormula,
      customFormulaGk: model.customFormulaGk,
      customFormulaDef: model.customFormulaDef,
      customFormulaMid: model.customFormulaMid,
      customFormulaFwd: model.customFormulaFwd,
      customFormulaEnabled: model.customFormulaEnabled,
      rules: model.rules.length ? model.rules : seedScoringRules()
    };
  }

  return {
    customFormula: null,
    customFormulaGk: null,
    customFormulaDef: null,
    customFormulaMid: null,
    customFormulaFwd: null,
    customFormulaEnabled: false,
    rules: seedScoringRules()
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
    if (customFormula) return round(calculateCustomFormulaScore(customFormula, rawMetrics));
  }

  return calculatePredictedRoundScore(rawMetrics, positionGroup);
}

export function calculatePredictedRoundScore(rawMetrics: Record<string, unknown>, positionGroup: string | null | undefined) {
  const position = positionGroup ?? "UNKNOWN";
  const matches = readMetric(rawMetrics, "matches_played");
  const minutes = readMetric(rawMetrics, "minutes_played");
  const expectedMinutes = matches > 0 ? clamp(minutes / matches, 0, 90) : 0;
  const minutesFactor = expectedMinutes / 90;
  const likelyAppearance = expectedMinutes > 0 ? 1 : 0;
  const likelySixty = expectedMinutes >= 60 ? 1 : 0;
  const likelyFullMatch = expectedMinutes >= 89.5 ? 1 : 0;

  let total = 0;

  total += likelyAppearance;
  total += likelySixty;
  if (position === "MID" || position === "FWD") total += likelyFullMatch;

  total += expectedPerMatch(rawMetrics, "goals", "goals_per_90", minutesFactor, matches) * goalWeight(position);
  total += expectedPerMatch(rawMetrics, "assists", "assists_per_90", minutesFactor, matches) * 3;
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

function perMatchFromTotal(rawMetrics: Record<string, unknown>, metricKey: string, matches: number) {
  if (matches <= 0) return 0;
  return readMetric(rawMetrics, metricKey) / matches;
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
  const aliases = metricKey.split("|").map((key) => key.trim()).filter(Boolean);

  for (const alias of aliases) {
    const value = rawMetrics[alias];
    if (value === null || value === undefined || value === "") continue;

    const numeric = numericMetric(value);
    if (numeric !== null) return numeric;
  }

  return 0;
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
