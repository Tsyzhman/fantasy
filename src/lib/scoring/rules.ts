export type FantasyRuleSeed = {
  positionGroup: string;
  metricKey: string;
  weight: number;
  transform?: string;
  enabled?: boolean;
};

export const seedRules: FantasyRuleSeed[] = [
  { positionGroup: "DEFAULT", metricKey: "minutes_played", weight: 0.01 },
  { positionGroup: "DEFAULT", metricKey: "matches_played", weight: 0.05 },
  { positionGroup: "DEFAULT", metricKey: "goals", weight: 5 },
  { positionGroup: "DEFAULT", metricKey: "assists", weight: 4 },
  { positionGroup: "DEFAULT", metricKey: "xg", weight: 1.5 },
  { positionGroup: "DEFAULT", metricKey: "xa", weight: 1.5 },
  { positionGroup: "DEFAULT", metricKey: "yellow_cards", weight: -1 },
  { positionGroup: "DEFAULT", metricKey: "red_cards", weight: -3 },
  { positionGroup: "FWD", metricKey: "shots_per_90", weight: 0.3 },
  { positionGroup: "FWD", metricKey: "shots_on_target_percent", weight: 0.02 },
  { positionGroup: "FWD", metricKey: "touches_in_box_per_90", weight: 0.4 },
  { positionGroup: "FWD", metricKey: "successful_attacking_actions_per_90", weight: 0.4 },
  { positionGroup: "FWD", metricKey: "goal_conversion_percent", weight: 0.03 },
  { positionGroup: "MID", metricKey: "key_passes_per_90", weight: 1 },
  { positionGroup: "MID", metricKey: "shot_assists_per_90", weight: 0.8 },
  { positionGroup: "MID", metricKey: "passes_to_final_third_per_90", weight: 0.2 },
  { positionGroup: "MID", metricKey: "accurate_passes_to_final_third_percent", weight: 0.02 },
  { positionGroup: "MID", metricKey: "progressive_passes_per_90", weight: 0.25 },
  { positionGroup: "MID", metricKey: "accurate_progressive_passes_percent", weight: 0.02 },
  { positionGroup: "MID", metricKey: "smart_passes_per_90", weight: 0.8 },
  { positionGroup: "DEF", metricKey: "successful_defensive_actions_per_90", weight: 0.5 },
  { positionGroup: "DEF", metricKey: "defensive_duels_won_percent", weight: 0.03 },
  { positionGroup: "DEF", metricKey: "aerial_duels_won_percent", weight: 0.02 },
  { positionGroup: "DEF", metricKey: "interceptions_per_90", weight: 0.6 },
  { positionGroup: "DEF", metricKey: "shots_blocked_per_90", weight: 0.8 },
  { positionGroup: "GK", metricKey: "clean_sheets", weight: 2.5 },
  { positionGroup: "GK", metricKey: "save_rate_percent", weight: 0.05 },
  { positionGroup: "GK", metricKey: "prevented_goals", weight: 1.5 },
  { positionGroup: "GK", metricKey: "conceded_goals", weight: -0.8 },
  { positionGroup: "GK", metricKey: "shots_against_per_90", weight: 0.1 },
  { positionGroup: "GK", metricKey: "exits_per_90", weight: 0.2 }
];
