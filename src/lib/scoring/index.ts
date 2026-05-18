import type { FantasyModel, FantasyModelRule } from "@prisma/client";

import { prisma } from "@/lib/db";
import { calculateCustomFormulaScore } from "@/lib/scoring/formula";
import { seedRules } from "@/lib/scoring/rules";

export type ScoringRule = Pick<FantasyModelRule, "positionGroup" | "metricKey" | "weight" | "transform" | "enabled">;
export type ActiveScoringModel = Pick<FantasyModel, "customFormula" | "customFormulaEnabled"> & {
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
      customFormulaEnabled: model.customFormulaEnabled,
      rules: model.rules.length ? model.rules : seedScoringRules()
    };
  }

  return {
    customFormula: null,
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
  if (!Array.isArray(modelOrRules) && modelOrRules.customFormulaEnabled && modelOrRules.customFormula?.trim()) {
    return round(calculateCustomFormulaScore(modelOrRules.customFormula, rawMetrics));
  }

  const rules = Array.isArray(modelOrRules) ? modelOrRules : modelOrRules.rules;
  const activeRules = rules.filter(
    (rule) => rule.enabled && (rule.positionGroup === "DEFAULT" || rule.positionGroup === positionGroup)
  );

  const score = activeRules.reduce((total, rule) => {
    const value = transformMetric(readMetric(rawMetrics, rule.metricKey), rule.transform, rawMetrics);
    return total + value * rule.weight;
  }, 0);

  return round(score);
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

function transformMetric(value: number, transform: string, rawMetrics: Record<string, unknown>) {
  switch (transform) {
    case "appearances_60":
      return capByAppearances(Math.floor(value / 60), rawMetrics);
    case "full_matches":
      return capByAppearances(Math.floor(value / 90), rawMetrics);
    case "floor_per_2":
      return Math.floor(value / 2);
    case "floor_per_3":
      return Math.floor(value / 3);
    case "linear":
    default:
      return value;
  }
}

function capByAppearances(value: number, rawMetrics: Record<string, unknown>) {
  const matches = readMetric(rawMetrics, "matches_played");
  return matches > 0 ? Math.min(value, matches) : value;
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
