import type { PrismaClient } from "@prisma/client";

import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  type ActiveScoringModel,
  getActiveScoringModelForSource
} from "@/lib/scoring";

import { FantasyPointsRepository } from "./fantasy_repositories";

type FantasyRules = {
  points?: Record<string, number>;
};

export type FantasyMatchPlayerStatInput = {
  matchId: bigint;
  playerId: bigint;
  teamId: bigint | null;
  opponentTeamId?: bigint | null;
  isHome?: boolean | null;
  started?: boolean | null;
  substitutedIn?: boolean | null;
  minutes: number | null;
  position?: string | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  goalsConceded: number | null;
  cleanSheet: boolean | null;
  xg: number | null;
  xgot: number | null;
  xa: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
  tacklesWon: number | null;
  interceptions: number | null;
  clearances: number | null;
  recoveries?: number | null;
  rating?: number | null;
  match?: {
    homeTeamId: bigint | null;
    awayTeamId: bigint | null;
    homeScore: number | null;
    awayScore: number | null;
    homeXg?: number | null;
    awayXg?: number | null;
  } | null;
};

const defaultWeights: Record<string, number> = {
  minutes: 0.02,
  goals: 5,
  assists: 3,
  yellow_cards: -1,
  red_cards: -3,
  saves: 0.5,
  goals_conceded: -0.5,
  clean_sheet: 4,
  shots_on_target: 0.4,
  key_passes: 0.3,
  tackles_won: 0.2,
  interceptions: 0.2,
  clearances: 0.1,
  xg: 1,
  xa: 1,
  xgot: 0.5
};

export async function calculate_fantasy_points_for_match(prisma: PrismaClient, match_id: bigint | string | number, ruleset_id: bigint | string | number) {
  const matchId = toBigInt(match_id, "match_id");
  const rulesetId = toBigInt(ruleset_id, "ruleset_id");
  const repository = new FantasyPointsRepository(prisma);
  const ruleset = await repository.getRuleset(rulesetId);
  if (!ruleset) throw new Error(`Fantasy ruleset not found: ${String(ruleset_id)}`);

  const stats = await repository.getMatchPlayerStats(matchId);
  const rules = parseRules(ruleset.rules);
  const useWeightedRules = Boolean(rules.points && Object.keys(rules.points).length > 0);
  const activeModel = useWeightedRules ? null : await getActiveScoringModelForSource("MACHETE");
  let playersCalculated = 0;

  for (const stat of stats) {
    const result = useWeightedRules ? calculateWeightedFantasy(stat, rules) : calculateProjectModelFantasy(stat, activeModel);

    await repository.upsertPlayerPoints({
      matchId,
      playerId: stat.playerId,
      teamId: stat.teamId,
      rulesetId,
      points: result.points,
      minutes: stat.minutes,
      breakdown: result.breakdown
    });
    playersCalculated += 1;
  }

  return {
    matchId,
    rulesetId,
    playersCalculated
  };
}

export function build_fantasy_model_metrics_from_player_stat(stat: FantasyMatchPlayerStatInput) {
  const minutes = numericOrZero(stat.minutes);
  const played = minutes > 0 || stat.started === true || stat.substitutedIn === true || numericOrZero(stat.rating ?? null) > 0;
  const goalsConceded = stat.goalsConceded ?? deriveGoalsConceded(stat);
  const cleanSheets = cleanSheetValue(stat.cleanSheet, goalsConceded, minutes);
  const recoveries = numericOrZero(stat.recoveries ?? null);

  return {
    positionGroup: machetePositionGroup(stat.position),
    rawMetrics: {
      matches_played: played ? 1 : 0,
      minutes_played: minutes,
      appearances_60: minutes >= 60 ? 1 : 0,
      full_matches: minutes >= 90 ? 1 : 0,
      goals: numericOrZero(stat.goals),
      assists: numericOrZero(stat.assists),
      xg: numericOrZero(stat.xg),
      xa: numericOrZero(stat.xa),
      xgot: numericOrZero(stat.xgot),
      shots: numericOrZero(stat.shots),
      shots_on_target: numericOrZero(stat.shotsOnTarget),
      key_passes: numericOrZero(stat.keyPasses),
      tackles: numericOrZero(stat.tacklesWon),
      tackles_won: numericOrZero(stat.tacklesWon),
      interceptions: numericOrZero(stat.interceptions),
      clearances: numericOrZero(stat.clearances),
      recoveries,
      possession_recoveries: recoveries,
      saves: numericOrZero(stat.saves),
      goals_conceded: goalsConceded ?? 0,
      conceded_goals: goalsConceded ?? 0,
      clean_sheets: cleanSheets,
      clean_sheet: cleanSheets,
      yellow_cards: numericOrZero(stat.yellowCards),
      red_cards: numericOrZero(stat.redCards),
      average_rating: numericOrNull(stat.rating ?? null) ?? 0
    }
  };
}

function calculateProjectModelFantasy(stat: FantasyMatchPlayerStatInput, model: ActiveScoringModel | null) {
  if (!model) throw new Error("Machete fantasy model is not available.");

  const { rawMetrics, positionGroup } = build_fantasy_model_metrics_from_player_stat(stat);
  const points = calculateFantasyScore(rawMetrics, positionGroup, model);
  const scoringScore = calculateScoringScore(rawMetrics, positionGroup, model);
  const alternativeScore = calculateAlternativeScore(rawMetrics, positionGroup, model);
  const breakdown = model.customFormulaEnabled
    ? [{ category: "fantasy_score", value: points, points }]
    : buildPredictedRoundBreakdown(rawMetrics, positionGroup);

  return {
    points,
    breakdown: [
      ...breakdown,
      { category: "scoring_score", value: scoringScore, points: 0 },
      ...(alternativeScore === null ? [] : [{ category: "alternative_score", value: alternativeScore, points: 0 }])
    ]
  };
}

function calculateWeightedFantasy(stat: FantasyMatchPlayerStatInput, rules: FantasyRules) {
  const goalsConceded = stat.goalsConceded ?? deriveGoalsConceded(stat);
  const breakdown = buildWeightedBreakdown(
    [
      ["minutes", stat.minutes],
      ["goals", stat.goals],
      ["assists", stat.assists],
      ["yellow_cards", stat.yellowCards],
      ["red_cards", stat.redCards],
      ["saves", stat.saves],
      ["goals_conceded", goalsConceded],
      ["clean_sheet", cleanSheetValue(stat.cleanSheet, goalsConceded, numericOrZero(stat.minutes))],
      ["shots_on_target", stat.shotsOnTarget],
      ["key_passes", stat.keyPasses],
      ["tackles_won", stat.tacklesWon],
      ["interceptions", stat.interceptions],
      ["clearances", stat.clearances],
      ["xg", stat.xg],
      ["xa", stat.xa],
      ["xgot", stat.xgot]
    ],
    rules
  );

  return {
    points: round(breakdown.reduce((total, item) => total + item.points, 0)),
    breakdown
  };
}

function buildWeightedBreakdown(values: Array<[string, number | null]>, rules: FantasyRules) {
  return values
    .filter(([, value]) => value !== null)
    .map(([category, value]) => {
      const numericValue = value ?? 0;
      return {
        category,
        value: numericValue,
        points: round(numericValue * weightFor(category, rules))
      };
    });
}

function buildPredictedRoundBreakdown(rawMetrics: Record<string, number>, positionGroup: string) {
  const matches = metric(rawMetrics, "matches_played");
  const minutes = metric(rawMetrics, "minutes_played");
  const expectedMinutes = expectedMinutesFromMetrics(rawMetrics, matches, minutes);
  const minutesFactor = expectedMinutes / 90;
  const likelyAppearance = expectedMinutes > 0 ? 1 : 0;
  const likelySixty = expectedMinutes >= 60 ? 1 : 0;
  const likelyFullMatch = expectedMinutes >= 80 ? 1 : 0;
  const rows: Array<{ category: string; value: number; points: number }> = [];
  const add = (category: string, value: number, points: number) => {
    if (value !== 0 || points !== 0) rows.push({ category, value: round(value), points: round(points) });
  };

  add("appearance", likelyAppearance, likelyAppearance);
  add("sixty_minutes", likelySixty, likelySixty);
  if (positionGroup === "MID" || positionGroup === "FWD") add("full_match", likelyFullMatch, likelyFullMatch);

  const goals = expectedPerMatch(rawMetrics, "goals", "goals_per_90", minutesFactor, matches);
  const assists = expectedPerMatch(rawMetrics, "assists", "assists_per_90", minutesFactor, matches);
  const fantasyAssists = perMatchFromTotal(rawMetrics, "fantasy_assists", matches);
  add("goals", goals, goals * goalWeight(positionGroup));
  add("assists", assists, assists * 3);
  add("fantasy_assists", fantasyAssists, fantasyAssists * 3);

  if (positionGroup === "GK" || positionGroup === "DEF" || positionGroup === "MID") {
    const cleanSheets = perMatchFromTotal(rawMetrics, "clean_sheets", matches);
    add("clean_sheets", cleanSheets, cleanSheets * cleanSheetWeight(positionGroup));
  }

  if (positionGroup === "GK") {
    const saves = expectedSaves(rawMetrics, minutesFactor, matches);
    const penaltySaves = perMatchFromTotal(rawMetrics, "penalty_saves", matches);
    add("saves", saves, saves / 3);
    add("penalty_saves", penaltySaves, penaltySaves * 5);
  }

  if (positionGroup === "DEF" || positionGroup === "MID" || positionGroup === "FWD") {
    const recoveries = expectedPerMatch(rawMetrics, "recoveries", "recoveries_per_90", minutesFactor, matches);
    add("recoveries", recoveries, recoveries / 3);
  }

  const penaltiesConceded = perMatchFromTotal(rawMetrics, "penalties_conceded", matches);
  const missedPenalties = perMatchFromTotal(rawMetrics, "missed_penalties", matches);
  const ownGoals = perMatchFromTotal(rawMetrics, "own_goals", matches);
  add("penalties_conceded", penaltiesConceded, penaltiesConceded * -2);
  add("missed_penalties", missedPenalties, missedPenalties * -2);
  add("own_goals", ownGoals, ownGoals * -2);

  if (positionGroup === "GK" || positionGroup === "DEF") {
    const goalsConceded = expectedPerMatch(rawMetrics, "goals_conceded", "goals_conceded_per_90", minutesFactor, matches);
    add("goals_conceded", goalsConceded, goalsConceded / -2);
  }

  const yellowCards = expectedPerMatch(rawMetrics, "yellow_cards", "yellow_cards_per_90", minutesFactor, matches);
  const redCards = expectedPerMatch(rawMetrics, "red_cards", "red_cards_per_90", minutesFactor, matches);
  add("yellow_cards", yellowCards, -yellowCards);
  add("red_cards", redCards, redCards * -3);

  return rows;
}

function weightFor(category: string, rules: FantasyRules) {
  return rules.points?.[category] ?? defaultWeights[category] ?? 0;
}

function parseRules(value: unknown): FantasyRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const rules = value as Record<string, unknown>;
  const points = rules.points;
  if (!points || typeof points !== "object" || Array.isArray(points)) return {};

  return {
    points: Object.fromEntries(
      Object.entries(points)
        .map(([key, rawValue]) => [key, typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null] as const)
        .filter((entry): entry is readonly [string, number] => entry[1] !== null)
    )
  };
}

function deriveGoalsConceded(stat: FantasyMatchPlayerStatInput) {
  const match = stat.match;
  if (!match || stat.teamId === null) return null;
  if (match.homeTeamId === stat.teamId) return match.awayScore ?? null;
  if (match.awayTeamId === stat.teamId) return match.homeScore ?? null;
  return null;
}

function cleanSheetValue(cleanSheet: boolean | null, goalsConceded: number | null, minutes: number) {
  if (minutes < 60) return 0;
  if (cleanSheet !== null) return cleanSheet ? 1 : 0;
  return goalsConceded === 0 ? 1 : 0;
}

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function expectedPerMatch(rawMetrics: Record<string, number>, totalKey: string, per90Key: string, minutesFactor: number, matches: number) {
  const per90 = metric(rawMetrics, per90Key);
  if (per90 > 0) return per90 * minutesFactor;
  return perMatchFromTotal(rawMetrics, totalKey, matches);
}

function expectedMinutesFromMetrics(rawMetrics: Record<string, number>, matches: number, minutes: number) {
  const expectedMinutes = metric(rawMetrics, "expected_minutes");
  if (expectedMinutes > 0) return clamp(expectedMinutes, 0, 90);
  return matches > 0 ? clamp(minutes / matches, 0, 90) : 0;
}

function perMatchFromTotal(rawMetrics: Record<string, number>, metricKey: string, matches: number) {
  if (matches <= 0) return 0;
  return metric(rawMetrics, metricKey) / matches;
}

function expectedSaves(rawMetrics: Record<string, number>, minutesFactor: number, matches: number) {
  const saves = perMatchFromTotal(rawMetrics, "saves", matches);
  if (saves > 0) return saves;

  const shotsAgainst = metric(rawMetrics, "shots_against_per_90") * minutesFactor;
  const saveRate = metric(rawMetrics, "save_rate_percent") / 100;
  return shotsAgainst * clamp(saveRate, 0, 1);
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

function metric(rawMetrics: Record<string, number>, key: string) {
  return rawMetrics[key] ?? 0;
}

function numericOrZero(value: number | null | undefined) {
  return numericOrNull(value) ?? 0;
}

function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toBigInt(value: bigint | string | number, label: string) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer-like value.`);
  }
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
