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
};

export type FplForecastResult = {
  points: number;
  breakdown: FplForecastBreakdown;
  status: "BETA_UNMODELED_BONUS_AND_DEFENSIVE_CONTRIBUTIONS";
  coverage: {
    bonus: number;
    defensiveContributions: number;
  };
};

/**
 * Converts the shared minutes/team-event projection into FPL points. The
 * official score adapter remains separate: bonus and defensive contribution
 * forecasts are explicitly zero until a legal historical training set exists.
 */
export function fplForecastPointsFromProjection(projection: PlayerFixtureProjection): FplForecastResult {
  const { position, probabilities, expectedEvents } = projection;
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
    bonus: 0,
    defensiveContributions: 0,
    total: 0
  };
  breakdown.total = Object.entries(breakdown)
    .filter(([key]) => key !== "total")
    .reduce((total, [, value]) => total + value, 0);
  return {
    points: breakdown.total,
    breakdown,
    status: "BETA_UNMODELED_BONUS_AND_DEFENSIVE_CONTRIBUTIONS",
    coverage: { bonus: 0, defensiveContributions: 0 }
  };
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
