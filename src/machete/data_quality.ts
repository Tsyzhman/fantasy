import { normalizeFantasyPosition } from "./squad_logic";

export type ForecastCoverageCandidate = {
  playerKey: string;
  playerName: string;
  teamName: string;
  position: string | null;
  matchesPlayed: number;
  fantasyScore: number | null;
  expectedMinutes: number | null;
  forecastConfidence: number | null;
  dataUpdatedAt: Date | string | null;
  hasBasicStats: boolean;
};

export type MatchDataCoverageInput = {
  matchId: string;
  hasPlayerStats: boolean;
  rawReceivedAt: Date | null;
  normalizedAt: Date | null;
};

export type BasicPlayerStatInput = {
  position?: string | null;
  minutes?: number | null;
  started?: boolean | null;
  substitutedIn?: boolean | null;
  rating?: number | null;
  goals?: number | null;
  assists?: number | null;
  xg?: number | null;
  xa?: number | null;
  shots?: number | null;
  shotsOnTarget?: number | null;
  keyPasses?: number | null;
  tacklesWon?: number | null;
  interceptions?: number | null;
  clearances?: number | null;
  recoveries?: number | null;
  saves?: number | null;
  goalsConceded?: number | null;
};

export type DataQualityThresholds = {
  coveragePercent?: number;
  maximumPromotionLatencyHours?: number;
};

export function evaluateFantasyDataQuality(
  candidates: ForecastCoverageCandidate[],
  matches: MatchDataCoverageInput[],
  statRows: BasicPlayerStatInput[],
  thresholds: DataQualityThresholds = {}
) {
  const coverageThreshold = nonNegativePercent(thresholds.coveragePercent, 98);
  const maximumPromotionLatencyHours = positiveNumber(thresholds.maximumPromotionLatencyHours, 6);
  const forecastEvaluations = candidates.map((candidate) => ({
    ...candidate,
    missing: forecastMissingReasons(candidate)
  }));
  const forecastsAvailable = forecastEvaluations.filter((candidate) => candidate.missing.length === 0).length;
  const playersWithBasicStats = candidates.filter((candidate) => candidate.hasBasicStats).length;
  const matchesWithPlayerStats = matches.filter((match) => match.hasPlayerStats).length;
  const completeStatRows = statRows.filter(isBasicPlayerStatComplete).length;
  const matchLatencies = matches.map((match) => promotionLatency(match, maximumPromotionLatencyHours));
  const timelyMatches = matchLatencies.filter((match) => match.timely).length;
  const forecastCoveragePercent = percentage(forecastsAvailable, candidates.length);
  const playerDataCoveragePercent = percentage(playersWithBasicStats, candidates.length);
  const matchDataCoveragePercent = percentage(matchesWithPlayerStats, matches.length);
  const statRowCoveragePercent = percentage(completeStatRows, statRows.length);
  const promotionLatencyCoveragePercent = percentage(timelyMatches, matches.length);
  const gateChecks = {
    forecastCoverage: forecastCoveragePercent >= coverageThreshold,
    playerDataCoverage: playerDataCoveragePercent >= coverageThreshold,
    matchDataCoverage: matchDataCoveragePercent >= coverageThreshold,
    statRowCoverage: statRowCoveragePercent >= coverageThreshold,
    promotionLatency: matches.length > 0 && timelyMatches === matches.length
  };
  const reasons: string[] = [];
  if (!gateChecks.forecastCoverage) reasons.push(`forecast coverage ${forecastCoveragePercent}% is below ${coverageThreshold}%`);
  if (!gateChecks.playerDataCoverage) reasons.push(`active-player data coverage ${playerDataCoveragePercent}% is below ${coverageThreshold}%`);
  if (!gateChecks.matchDataCoverage) reasons.push(`finished-match data coverage ${matchDataCoveragePercent}% is below ${coverageThreshold}%`);
  if (!gateChecks.statRowCoverage) reasons.push(`basic stat-row coverage ${statRowCoveragePercent}% is below ${coverageThreshold}%`);
  if (!gateChecks.promotionLatency) {
    reasons.push(`only ${timelyMatches}/${matches.length} finished matches have verifiable data promotion within ${maximumPromotionLatencyHours} hours`);
  }

  return {
    thresholds: {
      coveragePercent: coverageThreshold,
      maximumPromotionLatencyHours,
      promotionLatencyCoverageRequiredPercent: 100
    },
    forecasts: {
      activePlayers: candidates.length,
      available: forecastsAvailable,
      coveragePercent: forecastCoveragePercent,
      missing: forecastEvaluations
        .filter((candidate) => candidate.missing.length > 0)
        .map((candidate) => ({
          playerKey: candidate.playerKey,
          playerName: candidate.playerName,
          teamName: candidate.teamName,
          reasons: candidate.missing
        }))
    },
    players: {
      activePlayers: candidates.length,
      withBasicStats: playersWithBasicStats,
      coveragePercent: playerDataCoveragePercent
    },
    matches: {
      finishedMatches: matches.length,
      withPlayerStats: matchesWithPlayerStats,
      coveragePercent: matchDataCoveragePercent,
      promotedWithinLimit: timelyMatches,
      promotionLatencyCoveragePercent,
      latencyFailures: matchLatencies.filter((match) => !match.timely)
    },
    statRows: {
      total: statRows.length,
      complete: completeStatRows,
      coveragePercent: statRowCoveragePercent,
      fieldAvailabilityPercent: fieldAvailability(statRows)
    },
    betaGate: {
      checks: gateChecks,
      passed: Object.values(gateChecks).every(Boolean),
      reasons
    }
  };
}

export function forecastMissingReasons(candidate: ForecastCoverageCandidate) {
  const reasons: string[] = [];
  if (candidate.matchesPlayed <= 0) reasons.push("NO_MATCH_HISTORY");
  if (normalizeFantasyPosition(candidate.position) === "UNK") reasons.push("UNKNOWN_POSITION");
  if (!isFiniteNumber(candidate.fantasyScore)) reasons.push("NO_FANTASY_SCORE");
  if (!isFiniteNumber(candidate.expectedMinutes)) reasons.push("NO_EXPECTED_MINUTES");
  if (!isFiniteNumber(candidate.forecastConfidence)) reasons.push("NO_CONFIDENCE");
  if (!validDate(candidate.dataUpdatedAt)) reasons.push("NO_DATA_UPDATE_DATE");
  return reasons;
}

export function isBasicPlayerStatComplete(stat: BasicPlayerStatInput) {
  if (normalizeFantasyPosition(stat.position) === "UNK") return false;
  if (stat.started === false && stat.substitutedIn !== true && (stat.minutes === null || stat.minutes === 0)) return true;
  if (!isFiniteNumber(stat.minutes)) return false;

  return [
    stat.rating,
    stat.goals,
    stat.assists,
    stat.xg,
    stat.xa,
    stat.shots,
    stat.shotsOnTarget,
    stat.keyPasses,
    stat.tacklesWon,
    stat.interceptions,
    stat.clearances,
    stat.recoveries,
    stat.saves,
    stat.goalsConceded
  ].some(isFiniteNumber);
}

function promotionLatency(match: MatchDataCoverageInput, maximumHours: number) {
  if (!match.hasPlayerStats) {
    return { matchId: match.matchId, hours: null, timely: false, reason: "NO_PLAYER_STATS" as const };
  }
  if (!match.rawReceivedAt) {
    return { matchId: match.matchId, hours: null, timely: false, reason: "NO_RAW_RECEIVED_AT" as const };
  }
  if (!match.normalizedAt) {
    return { matchId: match.matchId, hours: null, timely: false, reason: "NO_NORMALIZED_AT" as const };
  }

  const milliseconds = match.normalizedAt.getTime() - match.rawReceivedAt.getTime();
  if (milliseconds < 0) {
    return { matchId: match.matchId, hours: null, timely: false, reason: "TIMESTAMPS_NOT_COMPARABLE" as const };
  }
  const hours = round(milliseconds / 3_600_000);
  return {
    matchId: match.matchId,
    hours,
    timely: hours <= maximumHours,
    reason: hours <= maximumHours ? null : ("PROMOTION_TOO_SLOW" as const)
  };
}

function fieldAvailability(rows: BasicPlayerStatInput[]) {
  const keys: Array<keyof BasicPlayerStatInput> = [
    "position",
    "minutes",
    "rating",
    "goals",
    "assists",
    "xg",
    "xa",
    "shots",
    "shotsOnTarget",
    "keyPasses",
    "tacklesWon",
    "interceptions",
    "clearances",
    "recoveries",
    "saves",
    "goalsConceded"
  ];
  return Object.fromEntries(keys.map((key) => [key, percentage(rows.filter((row) => row[key] !== null && row[key] !== undefined).length, rows.length)]));
}

function validDate(value: Date | string | null) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return round((numerator / denominator) * 100);
}

function nonNegativePercent(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
