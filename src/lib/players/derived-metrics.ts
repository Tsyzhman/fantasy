type SnapshotMetrics = {
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  xg: number | null;
  assists: number | null;
  xa: number | null;
  fantasyAssists?: number | null;
  cleanSheets?: number | null;
  saves?: number | null;
  penaltySaves?: number | null;
  recoveries?: number | null;
  penaltiesConceded?: number | null;
  missedPenalties?: number | null;
  ownGoals?: number | null;
  goalsConceded?: number | null;
  shotsOnTarget?: number | null;
  keyPasses?: number | null;
  tacklesWon?: number | null;
  interceptions?: number | null;
  clearances?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  averageRating?: number | null;
};

export function snapshotMetric(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function playerSnapshotScoringMetrics(snapshot: SnapshotMetrics, extra: Record<string, unknown> = {}) {
  const recoveries = snapshot.recoveries ?? 0;
  const goalsConceded = snapshot.goalsConceded ?? 0;
  const penaltySaves = snapshot.penaltySaves ?? 0;
  const penaltiesConceded = snapshot.penaltiesConceded ?? 0;
  const missedPenalties = snapshot.missedPenalties ?? 0;

  return {
    matches_played: snapshot.matchesPlayed ?? 0,
    minutes_played: snapshot.minutesPlayed ?? 0,
    goals: snapshot.goals ?? 0,
    xg: snapshot.xg ?? 0,
    assists: snapshot.assists ?? 0,
    xa: snapshot.xa ?? 0,
    fantasy_assists: snapshot.fantasyAssists ?? 0,
    clean_sheets: snapshot.cleanSheets ?? 0,
    clean_sheet: snapshot.cleanSheets ?? 0,
    saves: snapshot.saves ?? 0,
    penalty_saves: penaltySaves,
    penalties_saved: penaltySaves,
    recoveries,
    possession_recoveries: recoveries,
    penalties_conceded: penaltiesConceded,
    fouls_leading_to_penalty: penaltiesConceded,
    missed_penalties: missedPenalties,
    penalties_missed: missedPenalties,
    own_goals: snapshot.ownGoals ?? 0,
    goals_conceded: goalsConceded,
    conceded_goals: goalsConceded,
    shots_on_target: snapshot.shotsOnTarget ?? 0,
    key_passes: snapshot.keyPasses ?? 0,
    tackles_won: snapshot.tacklesWon ?? 0,
    tackles: snapshot.tacklesWon ?? 0,
    interceptions: snapshot.interceptions ?? 0,
    clearances: snapshot.clearances ?? 0,
    yellow_cards: snapshot.yellowCards ?? 0,
    red_cards: snapshot.redCards ?? 0,
    average_rating: snapshot.averageRating ?? 0,
    ...extra
  };
}

export function snapshotPer90(snapshot: SnapshotMetrics, totalKey: "goals" | "xg" | "assists" | "xa") {
  const raw = snapshotMetric(playerSnapshotScoringMetrics(snapshot), `${totalKey}_per_90`);
  if (raw !== null) return raw;

  const minutes = snapshot.minutesPlayed ?? 0;
  const total = snapshot[totalKey] ?? 0;
  if (minutes <= 0) return null;

  return (total / minutes) * 90;
}
