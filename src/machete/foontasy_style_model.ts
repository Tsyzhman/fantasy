import {
  projectTeamPlayers,
  type FantasyPosition,
  type PlayerFantasyPointComponents,
  type ProbableParticipantInput,
  type ProjectedTeamTotals
} from "@/machete/deterministic_fantasy_projection";

/**
 * XG_SHARE_V2 replaces the per-90 rate normalization with the spreadsheet
 * xg_share formula: a player receives team expected goals/assists in
 * proportion to their share of the team's observed xG/xA, blended between the
 * season window and the last `xgShareRecentMatches` matches. Shares are
 * fractions of actual team totals, so a part-time cameo can never be inflated
 * beyond the whole team's next-match expectation.
 */
export const FANTASY_MODEL_VERSION = "XG_SHARE_V2";

export type ModelConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
export type TeamProjectionSource = "ODDS" | "XG_FORM" | "GOALS_FALLBACK";

export type PlayerHistoryRow = {
  matchDate: Date;
  minutes: number;
  started: boolean | null;
  xg: number | null;
  xa: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  recoveries: number;
};

export type RateProfile = {
  expectedMinutes: number;
  appearance: number;
  sixtyMinutes: number;
  fullMatch: number;
  xg90: number;
  xa90: number;
  yellowCards90: number;
  redCards90: number;
  saves90: number;
  recoveries90: number;
};

export type TeamProjectionCandidate = {
  odds?: { over15Probability: number | null; cleanSheetProbability: number | null; fetchedAt: Date | null } | null;
  xgForm?: { expectedGoals: number; expectedGoalsAgainst: number; matches: number } | null;
  goalsForm?: { expectedGoals: number; expectedGoalsAgainst: number; matches: number } | null;
};

export type SelectedTeamProjection = {
  expectedGoals: number;
  expectedGoalsAgainst: number;
  cleanSheetProbability: number;
  source: TeamProjectionSource;
  reasonCodes: string[];
};

export type ModelFixture = {
  id: string;
  round: string | null;
  kickoffAt: Date;
  teamId: string;
  opponentId: string;
  opponentName: string;
  isHome: boolean;
  teamProjection: SelectedTeamProjection;
  expectedRecoveries: number;
  expectedSaves: number;
};

export type ModelPlayer = {
  playerId: string;
  teamId: string;
  position: FantasyPosition;
  history: PlayerHistoryRow[];
  teamPositionFallback: RateProfile | null;
  leaguePositionFallback: RateProfile;
  isRosterStarter: boolean;
};

export type FixtureBreakdown = {
  fixtureId: string;
  round: string | null;
  kickoffAt: string;
  opponentId: string;
  opponentName: string;
  isHome: boolean;
  teamProjection: SelectedTeamProjection;
  expectedMinutes: number;
  probabilities: { appearance: number; sixtyMinutes: number; fullMatch: number };
  rates: { xg90: number; xa90: number; yellowCards90: number; redCards90: number; saves90: number; recoveries90: number; source: string };
  xgShare: XgShareBreakdown | null;
  xaShare: XgShareBreakdown | null;
  components: PlayerFantasyPointComponents;
  points: number;
  reasonCodes: string[];
};

export type HorizonForecast = {
  playerId: string;
  horizon: 3 | 5;
  points: number | null;
  fixturesAvailable: number;
  fixturesRequired: number;
  status: ModelConfidence;
  breakdown: FixtureBreakdown[];
};

export type FantasyModelConfig = {
  priorMinutes: number;
  probabilityPriorMatches: number;
  expectedAssistsPerGoal: number;
  oddsMaxAgeDays: number;
  xgShareSeasonWeight: number;
  xgShareRecentMatches: number;
};

export const defaultFantasyModelConfig: FantasyModelConfig = {
  priorMinutes: 360,
  probabilityPriorMatches: 4,
  expectedAssistsPerGoal: 0.8,
  oddsMaxAgeDays: 30,
  xgShareSeasonWeight: 0.6,
  xgShareRecentMatches: 3
};

export function inversePoissonOver15(probability: number) {
  const target = clamp(probability, 0, 0.999999);
  let low = 0;
  let high = 12;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    const calculated = 1 - Math.exp(-middle) * (1 + middle);
    if (calculated < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function selectTeamProjection(candidate: TeamProjectionCandidate, fixtureDate: Date, config = defaultFantasyModelConfig, asOf = fixtureDate): SelectedTeamProjection {
  const odds = candidate.odds;
  const oddsFresh = odds?.fetchedAt
    ? odds.fetchedAt.getTime() <= asOf.getTime()
      && asOf.getTime() - odds.fetchedAt.getTime() <= config.oddsMaxAgeDays * 86_400_000
    : false;
  if (oddsFresh && validProbability(odds?.over15Probability) && validProbability(odds?.cleanSheetProbability)) {
    const expectedGoals = inversePoissonOver15(odds.over15Probability);
    const expectedGoalsAgainst = -Math.log(Math.max(1e-6, odds.cleanSheetProbability));
    return { expectedGoals, expectedGoalsAgainst, cleanSheetProbability: odds.cleanSheetProbability, source: "ODDS", reasonCodes: [] };
  }
  if (candidate.xgForm && candidate.xgForm.matches > 0) {
    return {
      expectedGoals: Math.max(0, candidate.xgForm.expectedGoals),
      expectedGoalsAgainst: Math.max(0, candidate.xgForm.expectedGoalsAgainst),
      cleanSheetProbability: Math.exp(-Math.max(0, candidate.xgForm.expectedGoalsAgainst)),
      source: "XG_FORM",
      reasonCodes: [odds ? "ODDS_STALE_OR_INCOMPLETE" : "ODDS_MISSING"]
    };
  }
  const goals = candidate.goalsForm ?? { expectedGoals: 1.25, expectedGoalsAgainst: 1.25, matches: 0 };
  return {
    expectedGoals: Math.max(0, goals.expectedGoals),
    expectedGoalsAgainst: Math.max(0, goals.expectedGoalsAgainst),
    cleanSheetProbability: Math.exp(-Math.max(0, goals.expectedGoalsAgainst)),
    source: "GOALS_FALLBACK",
    reasonCodes: ["ODDS_UNAVAILABLE", "XG_FORM_UNAVAILABLE", ...(goals.matches === 0 ? ["LEAGUE_GOALS_PRIOR"] : [])]
  };
}

export function historyBeforeFixture(history: readonly PlayerHistoryRow[], fixtureDate: Date) {
  return history.filter((row) => row.matchDate.getTime() < fixtureDate.getTime()).sort((left, right) => right.matchDate.getTime() - left.matchDate.getTime());
}

export function estimateParticipant(
  player: ModelPlayer,
  fixtureDate: Date,
  config = defaultFantasyModelConfig
): { participant: ProbableParticipantInput; source: string; historyMatches: number } {
  const history = historyBeforeFixture(player.history, fixtureDate);
  const fallback = rosterAdjustedProfile(player.teamPositionFallback ?? player.leaguePositionFallback, player.isRosterStarter);
  if (history.length === 0) return { participant: profileParticipant(player, fallback), source: player.teamPositionFallback ? "TEAM_POSITION_FALLBACK" : "LEAGUE_POSITION_FALLBACK", historyMatches: 0 };

  const last5 = history.slice(0, 5);
  const averageLast5 = average(last5.map((row) => row.minutes));
  const averageSeason = average(history.map((row) => row.minutes));
  const startsKnown = last5.filter((row) => row.started !== null);
  const startRate = startsKnown.length > 0 ? startsKnown.filter((row) => row.started).length / startsKnown.length : fallback.appearance;
  const rawExpectedMinutes = 0.55 * averageLast5 + 0.30 * averageSeason + 0.15 * 90 * startRate;
  const minuteWeight = history.length / (history.length + config.probabilityPriorMatches);
  const historicalExpectedMinutes = clamp(minuteWeight * rawExpectedMinutes + (1 - minuteWeight) * fallback.expectedMinutes, 0, 90);
  const expectedMinutes = player.isRosterStarter ? Math.max(80, historicalExpectedMinutes) : historicalExpectedMinutes;
  const historicalAppearance = smoothProbability(history.filter((row) => row.minutes > 0).length, history.length, fallback.appearance, config.probabilityPriorMatches);
  const appearance = player.isRosterStarter ? Math.max(0.9, historicalAppearance) : historicalAppearance;
  const historicalSixtyMinutes = Math.min(appearance, smoothProbability(history.filter((row) => row.minutes >= 60).length, history.length, fallback.sixtyMinutes, config.probabilityPriorMatches));
  const sixtyMinutes = player.isRosterStarter ? Math.max(0.8, historicalSixtyMinutes) : historicalSixtyMinutes;
  const historicalFullMatch = Math.min(sixtyMinutes, smoothProbability(history.filter((row) => row.minutes >= 85).length, history.length, fallback.fullMatch, config.probabilityPriorMatches));
  const fullMatch = player.isRosterStarter ? Math.max(0.5, historicalFullMatch) : historicalFullMatch;
  const playerMinutes = history.reduce((sum, row) => sum + row.minutes, 0);
  const xgTotal = history.reduce((sum, row) => sum + (row.xg ?? row.goals), 0);
  const xaTotal = history.reduce((sum, row) => sum + (row.xa ?? row.assists), 0);
  const smoothed = (total: number, priorRate: number) => (total + config.priorMinutes * priorRate / 90) / (playerMinutes + config.priorMinutes) * 90;
  const rate = (selector: (row: PlayerHistoryRow) => number, priorRate: number) => smoothed(history.reduce((sum, row) => sum + selector(row), 0), priorRate);
  const profile: RateProfile = {
    expectedMinutes,
    appearance: Math.max(appearance, expectedMinutes / 90),
    sixtyMinutes,
    fullMatch,
    xg90: smoothed(xgTotal, fallback.xg90),
    xa90: smoothed(xaTotal, fallback.xa90),
    yellowCards90: rate((row) => row.yellowCards, fallback.yellowCards90),
    redCards90: rate((row) => row.redCards, fallback.redCards90),
    saves90: rate((row) => row.saves, fallback.saves90),
    recoveries90: rate((row) => row.recoveries, fallback.recoveries90)
  };
  return { participant: profileParticipant(player, profile), source: "PLAYER_HISTORY_SMOOTHED", historyMatches: history.length };
}

function rosterAdjustedProfile(profile: RateProfile, isRosterStarter: boolean): RateProfile {
  return isRosterStarter
    ? {
        ...profile,
        expectedMinutes: Math.max(profile.expectedMinutes, 80),
        appearance: Math.max(profile.appearance, 0.9),
        sixtyMinutes: Math.max(profile.sixtyMinutes, 0.8),
        fullMatch: Math.max(profile.fullMatch, 0.5)
      }
    : {
        ...profile,
        expectedMinutes: Math.min(profile.expectedMinutes, 30),
        appearance: Math.min(profile.appearance, 0.65),
        sixtyMinutes: Math.min(profile.sixtyMinutes, 0.3),
        fullMatch: Math.min(profile.fullMatch, 0.15)
      };
}

export type XgShareBreakdown = {
  season: number;
  recent: number | null;
  blended: number;
};

export type PlayerXgShares = { xg: XgShareBreakdown | null; xa: XgShareBreakdown | null };

/**
 * Spreadsheet xg_share formula: the player's share of the team's observed
 * xG/xA over the season window and the recent window (last
 * `xgShareRecentMatches` distinct team matches), linearly blended with
 * `xgShareSeasonWeight` on the season side. Shares are fractions of actual
 * team totals and therefore always lie in [0, 1].
 */
export function playerXgShares(
  player: ModelPlayer,
  fixtureDate: Date,
  teamHistoryRows: readonly PlayerHistoryRow[],
  config = defaultFantasyModelConfig
): PlayerXgShares {
  const ownRows = historyBeforeFixture(player.history, fixtureDate);
  return {
    xg: windowedShare(ownRows, teamHistoryRows, (row) => row.xg ?? row.goals, config),
    xa: windowedShare(ownRows, teamHistoryRows, (row) => row.xa ?? row.assists, config)
  };
}

function windowedShare(
  ownRows: readonly PlayerHistoryRow[],
  teamRows: readonly PlayerHistoryRow[],
  selector: (row: PlayerHistoryRow) => number,
  config: FantasyModelConfig
): XgShareBreakdown | null {
  const seasonDenominator = teamRows.reduce((sum, row) => sum + Math.max(0, selector(row)), 0);
  if (!(seasonDenominator > 0)) return null;
  const season = clamp01(ownRows.reduce((sum, row) => sum + Math.max(0, selector(row)), 0) / seasonDenominator);
  const recentRows = recentMatchRows(teamRows, config.xgShareRecentMatches);
  let recent: number | null = null;
  if (recentRows.length > 0) {
    const recentDenominator = recentRows.reduce((sum, row) => sum + Math.max(0, selector(row)), 0);
    if (recentDenominator > 0) {
      const recentDates = new Set(recentRows.map((row) => row.matchDate.getTime()));
      const ownRecent = ownRows.filter((row) => recentDates.has(row.matchDate.getTime()))
        .reduce((sum, row) => sum + Math.max(0, selector(row)), 0);
      recent = clamp01(ownRecent / recentDenominator);
    }
  }
  const blended = recent === null ? season : clamp01(config.xgShareSeasonWeight * season + (1 - config.xgShareSeasonWeight) * recent);
  return { season, recent, blended };
}

function recentMatchRows(rows: readonly PlayerHistoryRow[], count: number): PlayerHistoryRow[] {
  if (count <= 0 || rows.length === 0) return [];
  const dates = [...new Set(rows.map((row) => row.matchDate.getTime()))].sort((left, right) => right - left).slice(0, count);
  const selected = new Set(dates);
  return rows.filter((row) => selected.has(row.matchDate.getTime()));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function calculatePlayerHorizons(
  players: readonly ModelPlayer[],
  fixtures: readonly ModelFixture[],
  config = defaultFantasyModelConfig
): HorizonForecast[] {
  const fixtureBreakdowns = new Map<string, FixtureBreakdown[]>();
  const playersByTeam = new Map<string, ModelPlayer[]>();
  for (const player of players) playersByTeam.set(player.teamId, [...(playersByTeam.get(player.teamId) ?? []), player]);
  for (const fixture of [...fixtures].sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime())) {
    const teamPlayers = playersByTeam.get(fixture.teamId) ?? [];
    if (teamPlayers.length === 0) continue;
    const estimates = teamPlayers.map((player) => ({ player, estimate: estimateParticipant(player, fixture.kickoffAt, config) }));
    const teamHistoryRows = teamPlayers.flatMap((player) => historyBeforeFixture(player.history, fixture.kickoffAt));
    const sharesByPlayer = new Map<string, PlayerXgShares>(
      estimates.map(({ player }) => [player.playerId, playerXgShares(player, fixture.kickoffAt, teamHistoryRows, config)])
    );
    const shareSum = (metric: "xg" | "xa") => [...sharesByPlayer.values()].reduce(
      (sum, shares) => sum + (shares[metric]?.blended ?? 0),
      0
    );
    const usableShares = { xg: shareSum("xg") > 0, xa: shareSum("xa") > 0 };
    const participants = estimates.map(({ player, estimate }) => {
      const participant = estimate.participant;
      const shares = sharesByPlayer.get(player.playerId)!;
      const allocationWeights: ProbableParticipantInput["allocationWeights"] = {};
      if (usableShares.xg && shares.xg) allocationWeights.goals = shares.xg.blended;
      if (usableShares.xa && shares.xa) allocationWeights.assists = shares.xa.blended;
      return Object.keys(allocationWeights).length > 0 ? { ...participant, allocationWeights } : participant;
    });
    const hasGoalkeeperExposure = estimates.some(({ player, estimate }) =>
      player.position === "GK"
      && (estimate.participant.expectedMinutes ?? 0) > 0
      && (estimate.participant.ratesPer90.saves ?? 0) > 0
    );
    const team: ProjectedTeamTotals = {
      teamId: fixture.teamId,
      expectedGoals: fixture.teamProjection.expectedGoals,
      expectedGoalsAgainst: fixture.teamProjection.expectedGoalsAgainst,
      expectedAssists: fixture.teamProjection.expectedGoals * config.expectedAssistsPerGoal,
      expectedRecoveries: fixture.expectedRecoveries,
      expectedSaves: hasGoalkeeperExposure ? fixture.expectedSaves : 0,
      cleanSheetProbability: fixture.teamProjection.cleanSheetProbability
    };
    const projection = projectTeamPlayers(team, participants);
    for (const playerProjection of projection.players) {
      const estimate = estimates.find((item) => item.player.playerId === playerProjection.playerId)!.estimate;
      const shares = sharesByPlayer.get(playerProjection.playerId)!;
      const breakdown: FixtureBreakdown = {
        fixtureId: fixture.id,
        round: fixture.round,
        kickoffAt: fixture.kickoffAt.toISOString(),
        opponentId: fixture.opponentId,
        opponentName: fixture.opponentName,
        isHome: fixture.isHome,
        teamProjection: fixture.teamProjection,
        expectedMinutes: playerProjection.expectedMinutes,
        probabilities: playerProjection.probabilities,
        rates: { ...playerProjectionRates(estimate.participant), source: estimate.source },
        xgShare: shares.xg,
        xaShare: shares.xa,
        components: playerProjection.components,
        points: playerProjection.components.total,
        reasonCodes: [...fixture.teamProjection.reasonCodes, ...(estimate.historyMatches === 0 ? ["NO_PLAYER_HISTORY"] : [])]
      };
      fixtureBreakdowns.set(playerProjection.playerId, [...(fixtureBreakdowns.get(playerProjection.playerId) ?? []), breakdown]);
    }
  }
  return players.flatMap((player) => ([3, 5] as const).map((horizon) => {
    const breakdown = (fixtureBreakdowns.get(player.playerId) ?? []).slice(0, horizon);
    const fixturesAvailable = breakdown.length;
    const fallbackCount = breakdown.filter((item) => item.reasonCodes.length > 0).length;
    const status: ModelConfidence = fixturesAvailable === 0 ? "INSUFFICIENT_DATA"
      : fixturesAvailable < horizon ? "LOW"
        : fallbackCount === 0 ? "HIGH"
          : fallbackCount <= Math.floor(horizon / 2) ? "MEDIUM" : "LOW";
    return {
      playerId: player.playerId,
      horizon,
      points: fixturesAvailable === 0 ? null : breakdown.reduce((sum, item) => sum + item.points, 0),
      fixturesAvailable,
      fixturesRequired: horizon,
      status,
      breakdown
    };
  }));
}

function profileParticipant(player: ModelPlayer, profile: RateProfile): ProbableParticipantInput {
  const appearance = Math.max(clamp(profile.appearance, 0, 1), clamp(profile.expectedMinutes / 90, 0, 1));
  const sixtyMinutes = Math.min(appearance, clamp(profile.sixtyMinutes, 0, 1));
  return {
    playerId: player.playerId,
    position: player.position,
    expectedMinutes: clamp(profile.expectedMinutes, 0, 90),
    probabilities: {
      appearance,
      sixtyMinutes,
      fullMatch: Math.min(sixtyMinutes, clamp(profile.fullMatch, 0, 1))
    },
    ratesPer90: {
      xg: Math.max(0, profile.xg90), xa: Math.max(0, profile.xa90),
      yellowCards: Math.max(0, profile.yellowCards90), redCards: Math.max(0, profile.redCards90),
      saves: Math.max(0, profile.saves90), recoveries: Math.max(0, profile.recoveries90)
    }
  };
}

function playerProjectionRates(player: ProbableParticipantInput) {
  return {
    xg90: player.ratesPer90.xg ?? 0, xa90: player.ratesPer90.xa ?? 0,
    yellowCards90: player.ratesPer90.yellowCards ?? 0, redCards90: player.ratesPer90.redCards ?? 0,
    saves90: player.ratesPer90.saves ?? 0, recoveries90: player.ratesPer90.recoveries ?? 0
  };
}

function smoothProbability(successes: number, matches: number, prior: number, priorMatches: number) {
  return (successes + prior * priorMatches) / (matches + priorMatches);
}

function validProbability(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;
}

function average(values: readonly number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
