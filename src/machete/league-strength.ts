/** @spec spec://modules/machete/FEAT-015-league-strength#model */

export type LeagueStrengthTeam = { id: string; name: string };

export type LeagueStrengthMatch = {
  id: string;
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeXg: number | null;
  awayXg: number | null;
};

type StrengthValues = {
  rating: number | null;
  xgDifference: number | null;
  schedule: number | null;
};

export type LeagueStrengthRow = LeagueStrengthTeam & StrengthValues & {
  played: number;
  pairedXg: number;
  ratingRank: number | null;
  xgRank: number | null;
  scheduleRank: number | null;
};

const RATING_PENALTY = 2;

export function calculateLeagueStrength(teams: readonly LeagueStrengthTeam[], matches: readonly LeagueStrengthMatch[]) {
  const teamIndices = new Map(teams.map((team, index) => [team.id, index]));
  const intercept = teams.length;
  const matrix = Array.from({ length: intercept + 1 }, () => new Float64Array(intercept + 1));
  const target = new Float64Array(intercept + 1);
  const totals = teams.map(() => ({ played: 0, pairedXg: 0, xgDifference: 0, schedule: 0 }));
  const seen = new Set<string>();
  const opponents: Array<[home: number, away: number]> = [];
  let pairedXgMatches = 0;

  for (let team = 0; team < intercept; team += 1) matrix[team][team] = RATING_PENALTY;

  for (const match of matches) {
    const home = teamIndices.get(match.homeId);
    const away = teamIndices.get(match.awayId);
    if (home === undefined || away === undefined || home === away || seen.has(match.id)) continue;
    if (!isGoalCount(match.homeGoals) || !isGoalCount(match.awayGoals)) continue;

    seen.add(match.id);
    opponents.push([home, away]);
    totals[home].played += 1;
    totals[away].played += 1;

    let margin = match.homeGoals - match.awayGoals;
    if (isExpectedGoals(match.homeXg) && isExpectedGoals(match.awayXg)) {
      const xgMargin = match.homeXg - match.awayXg;
      margin = (margin + xgMargin) / 2;
      totals[home].xgDifference += xgMargin;
      totals[away].xgDifference -= xgMargin;
      totals[home].pairedXg += 1;
      totals[away].pairedXg += 1;
      pairedXgMatches += 1;
    }

    // The design row has +1 for home and the venue intercept, and -1 for away.
    matrix[home][home] += 1;
    matrix[away][away] += 1;
    matrix[home][away] -= 1;
    matrix[away][home] -= 1;
    matrix[home][intercept] += 1;
    matrix[intercept][home] += 1;
    matrix[away][intercept] -= 1;
    matrix[intercept][away] -= 1;
    matrix[intercept][intercept] += 1;
    target[home] += margin;
    target[away] -= margin;
    target[intercept] += margin;
  }

  const coefficients = opponents.length ? solveNormalEquations(matrix, target) : target;
  const homeAdvantage = coefficients[intercept];
  for (const [home, away] of opponents) {
    totals[home].schedule += coefficients[away] - homeAdvantage;
    totals[away].schedule += coefficients[home] + homeAdvantage;
  }

  const values = teams.map((team, index) => {
    const { played, pairedXg, xgDifference, schedule } = totals[index];
    return {
      ...team,
      played,
      pairedXg,
      rating: played ? roundRating(coefficients[index]) : null,
      xgDifference: pairedXg ? roundRating(xgDifference / pairedXg) : null,
      schedule: played ? roundRating(schedule / played) : null
    };
  });
  const ratings = rankBy(values, "rating");
  const xgRanks = rankBy(values, "xgDifference");
  const schedules = rankBy(values, "schedule");
  const rows: LeagueStrengthRow[] = values.map((row) => ({
    ...row,
    ratingRank: ratings.get(row.id) ?? null,
    xgRank: xgRanks.get(row.id) ?? null,
    scheduleRank: schedules.get(row.id) ?? null
  }));
  rows.sort((a, b) => (a.ratingRank ?? Infinity) - (b.ratingRank ?? Infinity) || a.name.localeCompare(b.name));

  return { rows, matches: opponents.length, pairedXgMatches, homeAdvantage: opponents.length ? homeAdvantage : null };
}

function isGoalCount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function isExpectedGoals(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function roundRating(value: number) {
  return Math.round(value * 100) / 100 || 0;
}

function rankBy(rows: readonly (LeagueStrengthTeam & StrengthValues)[], metric: keyof StrengthValues) {
  const ranked = rows
    .map((row) => ({ id: row.id, value: row[metric] }))
    .filter((row): row is { id: string; value: number } => row.value !== null)
    .sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  let rank = 0;
  ranked.forEach((row, index) => {
    if (row.value !== ranked[index - 1]?.value) rank = index + 1;
    ranks.set(row.id, rank);
  });
  return ranks;
}

function solveNormalEquations(matrix: Float64Array[], target: Float64Array) {
  // The team penalty and at least one match make the matrix positive definite.
  for (let pivot = 0; pivot < target.length; pivot += 1) {
    for (let row = pivot + 1; row < target.length; row += 1) {
      const factor = matrix[row][pivot] / matrix[pivot][pivot];
      if (factor === 0) continue;
      for (let col = pivot + 1; col < target.length; col += 1) {
        matrix[row][col] -= factor * matrix[pivot][col];
      }
      target[row] -= factor * target[pivot];
    }
  }
  for (let row = target.length - 1; row >= 0; row -= 1) {
    for (let col = row + 1; col < target.length; col += 1) target[row] -= matrix[row][col] * target[col];
    target[row] /= matrix[row][row];
  }
  return target;
}
