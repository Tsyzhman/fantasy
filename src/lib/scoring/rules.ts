export type FantasyRuleSeed = {
  positionGroup: string;
  metricKey: string;
  weight: number;
  transform?: string;
  enabled?: boolean;
};

export const seedRules: FantasyRuleSeed[] = [
  { positionGroup: "DEFAULT", metricKey: "matches_played", weight: 1 },
  { positionGroup: "DEFAULT", metricKey: "minutes_played", weight: 1, transform: "appearances_60" },
  { positionGroup: "MID", metricKey: "minutes_played", weight: 1, transform: "full_matches" },
  { positionGroup: "FWD", metricKey: "minutes_played", weight: 1, transform: "full_matches" },
  { positionGroup: "GK", metricKey: "goals", weight: 6 },
  { positionGroup: "DEF", metricKey: "goals", weight: 6 },
  { positionGroup: "MID", metricKey: "goals", weight: 5 },
  { positionGroup: "FWD", metricKey: "goals", weight: 4 },
  { positionGroup: "DEFAULT", metricKey: "assists", weight: 3 },
  { positionGroup: "DEFAULT", metricKey: "fantasy_assists", weight: 3 },
  { positionGroup: "GK", metricKey: "clean_sheets", weight: 4 },
  { positionGroup: "DEF", metricKey: "clean_sheets", weight: 4 },
  { positionGroup: "MID", metricKey: "clean_sheets", weight: 1 },
  { positionGroup: "GK", metricKey: "saves", weight: 1, transform: "floor_per_3" },
  { positionGroup: "DEF", metricKey: "recoveries|possession_recoveries", weight: 1, transform: "floor_per_3" },
  { positionGroup: "MID", metricKey: "recoveries|possession_recoveries", weight: 1, transform: "floor_per_3" },
  { positionGroup: "FWD", metricKey: "recoveries|possession_recoveries", weight: 1, transform: "floor_per_3" },
  { positionGroup: "GK", metricKey: "penalties_saved|penalty_saves", weight: 5 },
  { positionGroup: "DEFAULT", metricKey: "fouls_leading_to_penalty|penalties_conceded", weight: -2 },
  { positionGroup: "DEFAULT", metricKey: "missed_penalties|penalties_missed", weight: -2 },
  { positionGroup: "DEFAULT", metricKey: "own_goals", weight: -2 },
  { positionGroup: "GK", metricKey: "goals_conceded|conceded_goals", weight: -1, transform: "floor_per_2" },
  { positionGroup: "DEF", metricKey: "goals_conceded|conceded_goals", weight: -1, transform: "floor_per_2" },
  { positionGroup: "DEFAULT", metricKey: "yellow_cards", weight: -1 },
  { positionGroup: "DEFAULT", metricKey: "red_cards", weight: -3 }
];
