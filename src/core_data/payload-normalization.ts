import type { MatchEventData, MatchShotData, ParsedMatchPayload, PlayerMatchStatsData, TeamMatchStatsData } from "./models";

export type ParsedPayloadDataQuality = {
  repaired: {
    teamStatsTeamIds: number;
    teamStatsOpponentTeamIds: number;
    playerStatsTeamIds: number;
    playerStatsOpponentTeamIds: number;
    shotTeamIds: number;
    shotOpponentTeamIds: number;
    eventTeamIds: number;
  };
  dropped: {
    teamStats: number;
    playerStats: number;
  };
};

export function normalizeParsedMatchPayloadLinks(input: ParsedMatchPayload) {
  const quality = emptyDataQuality();
  const match = input.match;

  const teamStats = input.teamStats.map((row) => repairTeamStat(row, match, quality));
  const playerStatsWithSide = input.playerStats.map((row) => repairPlayerStatFromMatchSide(row, match, quality));
  const shotsWithSide = input.shots.map((row) => repairShotFromMatchSide(row, match, quality));
  const eventsWithSide = input.events.map((row) => repairEventFromKnownPlayer(row, new Map(), quality));

  const playerTeamIds = unambiguousPlayerTeamIds(playerStatsWithSide, shotsWithSide, eventsWithSide);
  const playerStats = playerStatsWithSide.map((row) => repairPlayerStatFromKnownPlayer(row, match, playerTeamIds, quality));
  const shots = shotsWithSide.map((row) => repairShotFromKnownPlayer(row, match, playerTeamIds, quality));
  const eventPlayerTeamIds = unambiguousPlayerTeamIds(playerStats, shots, eventsWithSide);
  const events = eventsWithSide.map((row) => repairEventFromKnownPlayer(row, eventPlayerTeamIds, quality));

  const filteredTeamStats = teamStats.filter((row) => isPositive(row.teamId));
  const filteredPlayerStats = playerStats.filter((row) => isPositive(row.playerId));
  quality.dropped.teamStats = teamStats.length - filteredTeamStats.length;
  quality.dropped.playerStats = playerStats.length - filteredPlayerStats.length;

  return {
    parsed: {
      ...input,
      teamStats: filteredTeamStats,
      playerStats: filteredPlayerStats,
      events,
      shots
    },
    dataQuality: quality
  };
}

export function mergeDataQualityTotals(current: unknown, next: ParsedPayloadDataQuality) {
  const base = dataQualityRecord(current);
  return {
    repaired: {
      teamStatsTeamIds: numberValue(base.repaired.teamStatsTeamIds) + next.repaired.teamStatsTeamIds,
      teamStatsOpponentTeamIds: numberValue(base.repaired.teamStatsOpponentTeamIds) + next.repaired.teamStatsOpponentTeamIds,
      playerStatsTeamIds: numberValue(base.repaired.playerStatsTeamIds) + next.repaired.playerStatsTeamIds,
      playerStatsOpponentTeamIds: numberValue(base.repaired.playerStatsOpponentTeamIds) + next.repaired.playerStatsOpponentTeamIds,
      shotTeamIds: numberValue(base.repaired.shotTeamIds) + next.repaired.shotTeamIds,
      shotOpponentTeamIds: numberValue(base.repaired.shotOpponentTeamIds) + next.repaired.shotOpponentTeamIds,
      eventTeamIds: numberValue(base.repaired.eventTeamIds) + next.repaired.eventTeamIds
    },
    dropped: {
      teamStats: numberValue(base.dropped.teamStats) + next.dropped.teamStats,
      playerStats: numberValue(base.dropped.playerStats) + next.dropped.playerStats
    }
  };
}

function repairTeamStat(row: TeamMatchStatsData, match: ParsedMatchPayload["match"], quality: ParsedPayloadDataQuality): TeamMatchStatsData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamFromSide(row.isHome, match);
  if (!originalTeamId && teamId) quality.repaired.teamStatsTeamIds += 1;

  const originalOpponentTeamId = positiveOrNull(row.opponentTeamId);
  const opponentTeamId = originalOpponentTeamId ?? opponentForTeam(teamId, match) ?? teamFromSide(oppositeSide(row.isHome), match);
  if (!originalOpponentTeamId && opponentTeamId) quality.repaired.teamStatsOpponentTeamIds += 1;

  return {
    ...row,
    teamId: teamId ?? 0n,
    opponentTeamId,
    isHome: row.isHome ?? isHomeTeam(teamId, match)
  };
}

function repairPlayerStatFromMatchSide(row: PlayerMatchStatsData, match: ParsedMatchPayload["match"], quality: ParsedPayloadDataQuality): PlayerMatchStatsData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamFromSide(row.isHome, match);
  if (!originalTeamId && teamId) quality.repaired.playerStatsTeamIds += 1;

  return repairPlayerStatOpponent(row, match, teamId, quality);
}

function repairPlayerStatFromKnownPlayer(
  row: PlayerMatchStatsData,
  match: ParsedMatchPayload["match"],
  playerTeamIds: Map<string, bigint>,
  quality: ParsedPayloadDataQuality
): PlayerMatchStatsData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamForPlayer(row.playerId, playerTeamIds);
  if (!originalTeamId && teamId) quality.repaired.playerStatsTeamIds += 1;

  return repairPlayerStatOpponent(row, match, teamId, quality);
}

function repairPlayerStatOpponent(
  row: PlayerMatchStatsData,
  match: ParsedMatchPayload["match"],
  teamId: bigint | null,
  quality: ParsedPayloadDataQuality
): PlayerMatchStatsData {
  const originalOpponentTeamId = positiveOrNull(row.opponentTeamId);
  const opponentTeamId = originalOpponentTeamId ?? opponentForTeam(teamId, match);
  if (!originalOpponentTeamId && opponentTeamId) quality.repaired.playerStatsOpponentTeamIds += 1;

  return {
    ...row,
    teamId,
    opponentTeamId,
    isHome: row.isHome ?? isHomeTeam(teamId, match)
  };
}

function repairShotFromMatchSide(row: MatchShotData, match: ParsedMatchPayload["match"], quality: ParsedPayloadDataQuality): MatchShotData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamFromSide(row.isHome, match);
  if (!originalTeamId && teamId) quality.repaired.shotTeamIds += 1;

  return repairShotOpponent(row, match, teamId, quality);
}

function repairShotFromKnownPlayer(
  row: MatchShotData,
  match: ParsedMatchPayload["match"],
  playerTeamIds: Map<string, bigint>,
  quality: ParsedPayloadDataQuality
): MatchShotData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamForPlayer(row.playerId, playerTeamIds);
  if (!originalTeamId && teamId) quality.repaired.shotTeamIds += 1;

  return repairShotOpponent(row, match, teamId, quality);
}

function repairShotOpponent(row: MatchShotData, match: ParsedMatchPayload["match"], teamId: bigint | null, quality: ParsedPayloadDataQuality): MatchShotData {
  const originalOpponentTeamId = positiveOrNull(row.opponentTeamId);
  const opponentTeamId = originalOpponentTeamId ?? opponentForTeam(teamId, match);
  if (!originalOpponentTeamId && opponentTeamId) quality.repaired.shotOpponentTeamIds += 1;

  return {
    ...row,
    teamId,
    opponentTeamId,
    isHome: row.isHome ?? isHomeTeam(teamId, match)
  };
}

function repairEventFromKnownPlayer(row: MatchEventData, playerTeamIds: Map<string, bigint>, quality: ParsedPayloadDataQuality): MatchEventData {
  const originalTeamId = positiveOrNull(row.teamId);
  const teamId = originalTeamId ?? teamForPlayer(row.playerId, playerTeamIds) ?? teamForPlayer(row.relatedPlayerId, playerTeamIds);
  if (!originalTeamId && teamId) quality.repaired.eventTeamIds += 1;

  return {
    ...row,
    teamId
  };
}

function unambiguousPlayerTeamIds(playerStats: PlayerMatchStatsData[], shots: MatchShotData[], events: MatchEventData[]) {
  const candidates = new Map<string, Set<string>>();
  const add = (playerId: bigint | null | undefined, teamId: bigint | null | undefined) => {
    const player = positiveOrNull(playerId);
    const team = positiveOrNull(teamId);
    if (!player || !team) return;
    const key = String(player);
    const set = candidates.get(key) ?? new Set<string>();
    set.add(String(team));
    candidates.set(key, set);
  };

  for (const row of playerStats) add(row.playerId, row.teamId);
  for (const row of shots) add(row.playerId, row.teamId);
  for (const row of events) {
    if (row.isOwnGoal) continue;
    add(row.playerId, row.teamId);
    add(row.relatedPlayerId, row.teamId);
  }

  const result = new Map<string, bigint>();
  for (const [playerId, teamIds] of candidates) {
    if (teamIds.size !== 1) continue;
    result.set(playerId, BigInt([...teamIds][0]));
  }
  return result;
}

function teamForPlayer(playerId: bigint | null | undefined, playerTeamIds: Map<string, bigint>) {
  const player = positiveOrNull(playerId);
  return player ? playerTeamIds.get(String(player)) ?? null : null;
}

function teamFromSide(isHome: boolean | null | undefined, match: ParsedMatchPayload["match"]) {
  if (isHome === true) return positiveOrNull(match.homeTeamId);
  if (isHome === false) return positiveOrNull(match.awayTeamId);
  return null;
}

function opponentForTeam(teamId: bigint | null | undefined, match: ParsedMatchPayload["match"]) {
  const team = positiveOrNull(teamId);
  if (!team) return null;
  const home = positiveOrNull(match.homeTeamId);
  const away = positiveOrNull(match.awayTeamId);
  if (home && team === home) return away;
  if (away && team === away) return home;
  return null;
}

function isHomeTeam(teamId: bigint | null | undefined, match: ParsedMatchPayload["match"]) {
  const team = positiveOrNull(teamId);
  if (!team) return null;
  const home = positiveOrNull(match.homeTeamId);
  const away = positiveOrNull(match.awayTeamId);
  if (home && team === home) return true;
  if (away && team === away) return false;
  return null;
}

function oppositeSide(isHome: boolean | null | undefined) {
  if (isHome === true) return false;
  if (isHome === false) return true;
  return null;
}

function positiveOrNull(value: bigint | null | undefined) {
  return isPositive(value) ? value : null;
}

function isPositive(value: bigint | null | undefined): value is bigint {
  return value !== null && value !== undefined && value > 0n;
}

function emptyDataQuality(): ParsedPayloadDataQuality {
  return {
    repaired: {
      teamStatsTeamIds: 0,
      teamStatsOpponentTeamIds: 0,
      playerStatsTeamIds: 0,
      playerStatsOpponentTeamIds: 0,
      shotTeamIds: 0,
      shotOpponentTeamIds: 0,
      eventTeamIds: 0
    },
    dropped: {
      teamStats: 0,
      playerStats: 0
    }
  };
}

function dataQualityRecord(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    repaired: recordValue(record.repaired),
    dropped: recordValue(record.dropped)
  };
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
