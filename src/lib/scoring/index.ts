import type { FantasyModelRule } from "@prisma/client";

import { prisma } from "@/lib/db";
import { seedRules } from "@/lib/scoring/rules";

export type ScoringRule = Pick<FantasyModelRule, "positionGroup" | "metricKey" | "weight" | "transform" | "enabled">;

export async function getActiveScoringRules(): Promise<ScoringRule[]> {
  const model = await prisma.fantasyModel.findFirst({
    where: { isDefault: true, isActive: true },
    include: {
      rules: {
        where: { enabled: true }
      }
    }
  });

  if (model?.rules.length) return model.rules;

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
  rules: ScoringRule[]
) {
  const activeRules = rules.filter(
    (rule) => rule.enabled && (rule.positionGroup === "DEFAULT" || rule.positionGroup === positionGroup)
  );

  const score = activeRules.reduce((total, rule) => {
    const value = numericMetric(rawMetrics[rule.metricKey]);
    return total + value * rule.weight;
  }, 0);

  return round(score);
}

export function calculateValueScore(fantasyScore: number | null, marketValue: number | null) {
  if (fantasyScore === null || marketValue === null || marketValue <= 0) return null;
  return round(fantasyScore / Math.max(marketValue / 1_000_000, 0.1));
}

function numericMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
