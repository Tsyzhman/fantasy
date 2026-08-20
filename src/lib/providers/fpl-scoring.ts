import type { PlayerFixtureProjection } from "@/machete/deterministic_fantasy_projection";
import { expectedPoissonGroups } from "@/machete/deterministic_fantasy_projection";
import { fpl202627Rules, type FplMatchScoreInput } from "./fpl-rules";

export type FplForecastBreakdown = {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  penaltySaves: number;
  penaltyMisses: number;
  ownGoals: number;
  bonus: number;
  defensiveContributions: number;
  total: number;
  fixtureCount?: number;
};

export type FplForecastResult = {
  points: number;
  breakdown: FplForecastBreakdown;
  status:
    | "OFFICIAL_SCORING_WITH_ROLLING_BONUS_AND_DEFENSIVE_CONTRIBUTIONS"
    | "OFFICIAL_SCORING_WITH_PARTIAL_BONUS_AND_DEFENSIVE_CONTRIBUTIONS";
  coverage: {
    bonus: number;
    defensiveContributions: number;
  };
};

export type FplForecastAdjustments = {
  /** Expected 0..3 bonus points, conditional on appearing, from finalized official FPL matches. */
  expectedBonusPerAppearance?: number | null;
  /** Expected 0..2 defensive-contribution points, conditional on appearing, from finalized official FPL matches. */
  expectedDefensiveContributionPointsPerAppearance?: number | null;
  /** Share of the requested official history window available for this player. */
  bonusCoverage?: number | null;
  /** Share of the requested official history window containing the official DC field. */
  defensiveContributionCoverage?: number | null;
};

/**
 * Converts the shared minutes/team-event projection into FPL points. Generic
 * recoveries never score here: FPL defensive contributions are a separate,
 * capped threshold award and are supplied only from official FPL history.
 */
export function fplForecastPointsFromProjection(
  projection: PlayerFixtureProjection,
  adjustments: FplForecastAdjustments = {}
): FplForecastResult {
  const { position, probabilities, expectedEvents } = projection;
  const bonus = probabilities.appearance * clampExpectedPoints(adjustments.expectedBonusPerAppearance, 3);
  const defensiveContributions = position === "GK"
    ? 0
    : probabilities.appearance * clampExpectedPoints(adjustments.expectedDefensiveContributionPointsPerAppearance, 2);
  const bonusCoverage = clampCoverage(adjustments.bonusCoverage);
  const defensiveContributionCoverage = position === "GK"
    ? 1
    : clampCoverage(adjustments.defensiveContributionCoverage);
  const breakdown: FplForecastBreakdown = {
    appearance: probabilities.appearance * fpl202627Rules.scoring.appearance.upTo60Minutes
      + probabilities.sixtyMinutes * (fpl202627Rules.scoring.appearance.from60Minutes - fpl202627Rules.scoring.appearance.upTo60Minutes),
    goals: expectedEvents.goals * fpl202627Rules.scoring.goals[position],
    assists: expectedEvents.assists * fpl202627Rules.scoring.assists,
    cleanSheets: expectedEvents.cleanSheets * fpl202627Rules.scoring.cleanSheets[position],
    saves: position === "GK" ? expectedPoissonGroups(expectedEvents.saves, fpl202627Rules.scoring.savesPerPoint) : 0,
    goalsConceded: position === "GK" || position === "DEF"
      ? -expectedPoissonGroups(expectedEvents.goalsConceded, fpl202627Rules.scoring.goalsConcededPerPoint)
      : 0,
    yellowCards: -expectedEvents.yellowCards,
    redCards: -expectedEvents.redCards * 3,
    penaltySaves: 0,
    penaltyMisses: 0,
    ownGoals: 0,
    bonus,
    defensiveContributions,
    total: 0
  };
  breakdown.total = Object.entries(breakdown)
    .filter(([key]) => key !== "total")
    .reduce((total, [, value]) => total + value, 0);
  return {
    points: breakdown.total,
    breakdown,
    status: bonusCoverage === 1 && defensiveContributionCoverage === 1
      ? "OFFICIAL_SCORING_WITH_ROLLING_BONUS_AND_DEFENSIVE_CONTRIBUTIONS"
      : "OFFICIAL_SCORING_WITH_PARTIAL_BONUS_AND_DEFENSIVE_CONTRIBUTIONS",
    coverage: { bonus: bonusCoverage, defensiveContributions: defensiveContributionCoverage }
  };
}

export function aggregateFplForecastResults(
  results: readonly FplForecastResult[]
): FplForecastResult | null {
  if (results.length === 0) return null;
  const componentKeys = [
    "appearance",
    "goals",
    "assists",
    "cleanSheets",
    "saves",
    "goalsConceded",
    "yellowCards",
    "redCards",
    "penaltySaves",
    "penaltyMisses",
    "ownGoals",
    "bonus",
    "defensiveContributions"
  ] as const satisfies readonly (keyof FplForecastBreakdown)[];
  const breakdown = Object.fromEntries(componentKeys.map((key) => [
    key,
    results.reduce((total, result) => total + result.breakdown[key], 0)
  ])) as Omit<FplForecastBreakdown, "total">;
  const total = componentKeys.reduce((sum, key) => sum + breakdown[key], 0);
  return {
    points: total,
    breakdown: { ...breakdown, total, fixtureCount: results.length },
    status: results.every((result) => result.status === "OFFICIAL_SCORING_WITH_ROLLING_BONUS_AND_DEFENSIVE_CONTRIBUTIONS")
      ? "OFFICIAL_SCORING_WITH_ROLLING_BONUS_AND_DEFENSIVE_CONTRIBUTIONS"
      : "OFFICIAL_SCORING_WITH_PARTIAL_BONUS_AND_DEFENSIVE_CONTRIBUTIONS",
    coverage: {
      bonus: Math.min(...results.map((result) => result.coverage.bonus)),
      defensiveContributions: Math.min(...results.map((result) => result.coverage.defensiveContributions))
    }
  };
}

function clampExpectedPoints(value: number | null | undefined, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value))
    : 0;
}

function clampCoverage(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

export function fplOfficialScoreInputFromStats(
  position: FplMatchScoreInput["position"],
  stats: Record<string, number>
): FplMatchScoreInput {
  return {
    position,
    minutes: stats.minutes ?? 0,
    goals: stats.goals_scored ?? 0,
    assists: stats.assists ?? 0,
    cleanSheet: (stats.clean_sheets ?? 0) > 0,
    saves: stats.saves ?? 0,
    penaltySaves: stats.penalties_saved ?? 0,
    penaltyMisses: stats.penalties_missed ?? 0,
    ownGoals: stats.own_goals ?? 0,
    yellowCards: stats.yellow_cards ?? 0,
    redCards: stats.red_cards ?? 0,
    goalsConceded: stats.goals_conceded ?? 0,
    bonus: stats.bonus ?? 0,
    defensiveContributions: stats.defensive_contribution ?? 0
  };
}
