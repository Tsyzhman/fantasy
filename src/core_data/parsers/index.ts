import { extract_match_shots } from "@/providers/fotmob/shots";
import { extract_team_match_stats } from "@/providers/fotmob/team-match-stats";

import {
  asRecord,
  type JsonRecord,
  type LeagueData,
  type MatchData,
  type MatchEventData,
  type MatchShotData,
  type ParsedMatchPayload,
  type PlayerData,
  type PlayerMatchStatsData,
  sourceFingerprint,
  sourceIdToBigInt,
  type TeamData,
  type TeamMatchStatsData
} from "../models";

export function parse_payload(payload: unknown): ParsedMatchPayload {
  const match = parse_match_metadata(payload);

  return {
    match,
    leagues: match.leagueId
      ? [
          {
            id: match.leagueId,
            name: firstString(getPath(rawPayloadFromDetails(payload), ["general", "leagueName"])) ?? firstString(asRecord(payload).leagueName) ?? `FotMob league ${match.leagueId}`,
            country: firstString(getPath(rawPayloadFromDetails(payload), ["general", "country"])) ?? null,
            rawRef: String(match.leagueId)
          }
        ]
      : [],
    teams: parse_teams(payload),
    players: parse_players(payload),
    teamStats: parse_team_stats(payload),
    playerStats: parse_player_stats(payload),
    events: parse_events(payload),
    shots: parse_shots(payload)
  };
}

export function parse_match_metadata(payload: unknown): MatchData {
  const details = asRecord(payload);
  const raw = rawPayloadFromDetails(payload);
  const general = asRecord(raw.general);
  const header = asRecord(raw.header);
  const statusRecord = asRecord(firstRecordValue(details.status, raw.status, header.status, general.status));
  const teams = extractTeams(payload);
  const matchRawId = firstString(details.id, raw.id, raw.matchId, raw.match_id, general.matchId, general.match_id, header.id);
  const matchId = sourceIdToBigInt(matchRawId, "match") ?? 0n;
  const normalizedStatus = normalizeStatus(firstString(details.status, statusRecord.reason, statusRecord.status, statusRecord.type));
  const finished = details.status === "FINISHED" || statusRecord.finished === true || normalizedStatus === "FINISHED";
  const started = finished || details.status === "LIVE" || statusRecord.started === true || statusRecord.ongoing === true || normalizedStatus === "LIVE";
  const cancelled = statusRecord.cancelled === true || normalizedStatus === "CANCELLED" || normalizedStatus === "POSTPONED";
  const matchDate = dateValue(firstString(details.kickoffAt, raw.matchDate, statusRecord.utcTime, header.utcTime, general.matchTimeUTC));

  return {
    id: matchId,
    leagueId: sourceIdToBigInt(firstString(details.leagueId, raw.leagueId, general.leagueId, header.leagueId), "league"),
    season: firstString(details.season, raw.season, general.season, header.season) ?? null,
    round: firstString(raw.round, general.roundName, general.round, header.round) ?? null,
    homeTeamId: teams.home?.id ?? sourceIdToBigInt(firstString(details.homeTeamId), "team"),
    awayTeamId: teams.away?.id ?? sourceIdToBigInt(firstString(details.awayTeamId), "team"),
    homeScore: numberValue(details.homeScore) ?? numberValue(asRecord(raw.home).score) ?? numberValue(asRecord(teams.home?.raw).score),
    awayScore: numberValue(details.awayScore) ?? numberValue(asRecord(raw.away).score) ?? numberValue(asRecord(teams.away?.raw).score),
    status: normalizedStatus,
    started,
    finished,
    cancelled,
    matchDate,
    utcTime: dateValue(firstString(statusRecord.utcTime, header.utcTime, general.matchTimeUTC)) ?? matchDate,
    sourceUrl: matchRawId ? `https://www.fotmob.com/matches/${matchRawId}` : null,
    rawRef: matchRawId ?? null
  };
}

export function parse_teams(payload: unknown): TeamData[] {
  const teams = extractTeams(payload);
  return uniqueById([teams.home, teams.away].filter((team): team is TeamCandidate => team !== null).map((team) => team.data));
}

export function parse_players(payload: unknown): PlayerData[] {
  const players = new Map<string, PlayerData>();

  for (const stat of directPlayerStats(payload)) {
    const record = asRecord(stat);
    addPlayer(players, {
      id: firstString(record.playerId, record.player_id, record.id),
      name: firstString(record.playerName, record.name, asRecord(record.player).name),
      country: firstString(record.country, record.nationality, record.cname),
      birthDate: dateValue(firstString(record.birthDate, record.dateOfBirth))
    });
  }

  for (const shot of extract_match_shots(payload)) {
    addPlayer(players, {
      id: shot.player_id,
      name: shot.player_name,
      country: null,
      birthDate: null
    });
  }

  for (const event of eventObjects(payload)) {
    addEventPlayers(players, event);
  }

  collectNestedPlayers(rawPayloadFromDetails(payload), players);
  return [...players.values()];
}

function addEventPlayers(players: Map<string, PlayerData>, value: unknown) {
  const event = asRecord(value);
  const player = asRecord(firstRecordValue(event.player, event.person, event.actor));
  const related = asRecord(firstRecordValue(event.assist, event.assistPlayer, event.relatedPlayer));
  addPlayer(players, {
    id: firstString(event.playerId, event.player_id, player.id, player.playerId),
    name: firstString(event.playerName, event.name, event.nameStr, event.fullName, player.name),
    country: null,
    birthDate: null
  });
  addPlayer(players, {
    id: firstString(event.relatedPlayerId, event.assistPlayerId, related.id, related.playerId),
    name: firstString(event.relatedPlayerName, event.assistPlayerName, related.name),
    country: null,
    birthDate: null
  });

  if (Array.isArray(event.swap)) {
    for (const swapPlayer of event.swap) {
      const record = asRecord(swapPlayer);
      addPlayer(players, {
        id: firstString(record.id, record.playerId, record.player_id),
        name: firstString(record.name, record.playerName, record.fullName),
        country: null,
        birthDate: null
      });
    }
  }
}

export function parse_team_stats(payload: unknown): TeamMatchStatsData[] {
  return extract_team_match_stats(payload)
    .filter((row) => row.match_id !== null)
    .map((row) => ({
      matchId: sourceIdToBigInt(row.match_id, "match") ?? 0n,
      teamId: sourceIdToBigInt(row.team_id, "team") ?? 0n,
      opponentTeamId: sourceIdToBigInt(row.opponent_team_id, "team"),
      isHome: row.is_home,
      goals: intOrNull(row.goals),
      xg: row.xg,
      xgot: row.xgot,
      xa: row.xa,
      shots: intOrNull(row.shots),
      shotsOnTarget: intOrNull(row.shots_on_target),
      shotsOffTarget: intOrNull(row.shots_off_target),
      blockedShots: intOrNull(row.blocked_shots),
      bigChances: intOrNull(row.big_chances),
      bigChancesMissed: intOrNull(row.big_chances_missed),
      touchesInOppBox: intOrNull(row.touches_in_opp_box),
      possession: row.possession,
      passes: intOrNull(row.passes),
      accuratePasses: intOrNull(row.accurate_passes),
      passAccuracy: row.pass_accuracy,
      corners: intOrNull(row.corners),
      offsides: intOrNull(row.offsides),
      fouls: intOrNull(row.fouls),
      yellowCards: intOrNull(row.yellow_cards),
      redCards: intOrNull(row.red_cards),
      tacklesWon: intOrNull(row.tackles_won),
      interceptions: intOrNull(row.interceptions),
      clearances: intOrNull(row.clearances),
      saves: intOrNull(row.saves),
      statsPayload: { raw_stats: row.raw_stats }
    }));
}

export function parse_player_stats(payload: unknown): PlayerMatchStatsData[] {
  const match = parse_match_metadata(payload);
  const teams = extractTeams(payload);

  return directPlayerStats(payload)
    .map((value): PlayerMatchStatsData | null => {
      const stat = asRecord(value);
      const playerId = sourceIdToBigInt(firstString(stat.playerId, stat.player_id, stat.id), "player");
      if (!playerId) return null;
      const teamId = sourceIdToBigInt(firstString(stat.teamId, stat.team_id, stat._teamId, asRecord(stat.team).id), "team");
      const isHome = teamId !== null && teams.home?.id === teamId ? true : teamId !== null && teams.away?.id === teamId ? false : null;
      const opponentTeamId = teamId !== null && teams.home?.id === teamId ? teams.away?.id ?? null : teamId !== null && teams.away?.id === teamId ? teams.home?.id ?? null : null;

      return {
        matchId: match.id,
        playerId,
        teamId,
        opponentTeamId,
        isHome,
        started: booleanValue(stat.started ?? stat._started),
        substitutedIn: booleanValue(stat.substitutedIn ?? stat.substituted_in),
        substitutedOut: booleanValue(stat.substitutedOut ?? stat.substituted_out),
        minutes: intOrNull(readPlayerStatNumber(stat, ["minutes", "minutesPlayed", "minutes played", "mins"])),
        position: firstString(stat.position, stat.positionDescription) ?? fotMobPosition(stat),
        shirtNumber: intOrNull(readPlayerStatNumber(stat, ["shirtNumber", "shirt_number", "shirt number"])),
        goals: intOrNull(readPlayerStatNumber(stat, ["goals"])),
        assists: intOrNull(readPlayerStatNumber(stat, ["assists"])),
        yellowCards: intOrNull(readPlayerStatNumber(stat, ["yellowCards", "ycards", "yellow_cards", "yellow cards"])),
        redCards: intOrNull(readPlayerStatNumber(stat, ["redCards", "rcards", "red_cards", "red cards"])),
        saves: intOrNull(readPlayerStatNumber(stat, ["saves"])),
        goalsConceded: intOrNull(readPlayerStatNumber(stat, ["goalsConceded", "goals_conceded", "concededGoals", "conceded_goals", "goals conceded"])),
        cleanSheet: booleanValue(stat.cleanSheet ?? stat.clean_sheet),
        xg: readPlayerStatNumber(stat, ["xg", "expectedGoals", "expected_goals", "Expected goals (xG)", "expected goals"]),
        xgot: readPlayerStatNumber(stat, ["xgot", "expectedGoalsOnTarget", "expected_goals_on_target", "Expected goals on target (xGOT)"]),
        xa: readPlayerStatNumber(stat, ["xa", "expectedAssists", "expected_assists", "Expected assists (xA)", "expected assists"]),
        shots: intOrNull(readPlayerStatNumber(stat, ["shots", "total shots"])),
        shotsOnTarget: intOrNull(readPlayerStatNumber(stat, ["shotsOnTarget", "shots_on_target", "shots on target"])),
        keyPasses: intOrNull(readPlayerStatNumber(stat, ["keyPasses", "key_passes", "key passes", "chancesCreated", "chances_created", "chances created"])),
        chancesCreated: intOrNull(readPlayerStatNumber(stat, ["chancesCreated", "chances_created", "chances created"])),
        tacklesWon: intOrNull(readPlayerStatNumber(stat, ["tacklesWon", "tackles", "tackles_won", "tackles won"])),
        interceptions: intOrNull(readPlayerStatNumber(stat, ["interceptions"])),
        clearances: intOrNull(readPlayerStatNumber(stat, ["clearances"])),
        duelsWon: intOrNull(readPlayerStatNumber(stat, ["duelsWon", "duels_won", "duels won"])),
        aerialsWon: intOrNull(readPlayerStatNumber(stat, ["aerialsWon", "aerials_won", "aerials won", "aerial duels won"])),
        rating: readPlayerStatNumber(stat, ["rating", "fotmob rating"]),
        statsPayload: stat.raw ?? stat
      } satisfies PlayerMatchStatsData;
    })
    .filter((row): row is PlayerMatchStatsData => row !== null);
}

export function parse_events(payload: unknown): MatchEventData[] {
  const match = parse_match_metadata(payload);
  const teams = extractTeams(payload);

  return eventObjects(payload).map((value) => {
    const event = asRecord(value);
    const nestedPlayer = asRecord(firstRecordValue(event.player, event.person, event.actor));
    const nestedRelated = asRecord(firstRecordValue(event.assist, event.assistPlayer, event.relatedPlayer));
    const eventType = normalizeEventType(firstString(event.eventType, event.type, event.event, event.incidentType));
    const eventSubtype = firstString(event.eventSubtype, event.subtype, event.detail, event.card) ?? null;
    const isHomeEvent = booleanValue(event.isHome);

    return {
      matchId: match.id,
      teamId: sourceIdToBigInt(firstString(event.teamId, event.team_id, asRecord(event.team).id), "team") ?? (isHomeEvent === true ? teams.home?.id ?? null : isHomeEvent === false ? teams.away?.id ?? null : null),
      playerId: sourceIdToBigInt(firstString(event.playerId, event.player_id, nestedPlayer.id, nestedPlayer.playerId), "player"),
      relatedPlayerId: sourceIdToBigInt(firstString(event.relatedPlayerId, event.assistPlayerId, nestedRelated.id, nestedRelated.playerId), "player"),
      minute: intOrNull(numberValue(event.minute ?? event.time ?? event.eventMinute)),
      addedTime: intOrNull(numberValue(event.addedTime ?? event.added_time ?? event.injuryTime)),
      eventType,
      eventSubtype,
      isGoal: eventType === "goal" || booleanValue(event.isGoal) === true,
      isAssist: booleanValue(event.isAssist) === true || event.assist !== undefined || event.assistPlayer !== undefined,
      isOwnGoal: booleanValue(event.isOwnGoal ?? event.ownGoal) === true,
      isPenalty: booleanValue(event.isPenalty ?? event.penalty) === true || /penalty/i.test(eventSubtype ?? ""),
      isCard: eventType === "card" || /card/i.test(eventSubtype ?? ""),
      isSubstitution: eventType === "substitution",
      eventPayload: event
    };
  });
}

export function parse_shots(payload: unknown): MatchShotData[] {
  const match = parse_match_metadata(payload);
  return extract_match_shots(payload).map((shot) => {
    const matchId = sourceIdToBigInt(shot.match_id, "match") ?? match.id;
    const fingerprint = sourceFingerprint([
      matchId,
      shot.team_id,
      shot.player_id,
      shot.minute,
      shot.added_time,
      shot.x,
      shot.y,
      shot.event_type,
      shot.raw.id,
      shot.raw.eventId
    ]);

    return {
      matchId,
      teamId: sourceIdToBigInt(shot.team_id, "team"),
      opponentTeamId: sourceIdToBigInt(shot.opponent_team_id, "team"),
      playerId: sourceIdToBigInt(shot.player_id, "player"),
      isHome: shot.is_home,
      minute: shot.minute,
      addedTime: shot.added_time,
      x: shot.x,
      y: shot.y,
      normalizedX: shot.normalized_x,
      normalizedY: shot.normalized_y,
      eventType: shot.event_type,
      shotType: shot.shot_type,
      bodyPart: shot.body_part,
      situation: shot.situation,
      isGoal: shot.is_goal,
      isOnTarget: shot.is_on_target,
      isBlocked: shot.is_blocked,
      isBigChance: shot.is_big_chance,
      xg: shot.xg,
      xgot: shot.xgot,
      sourceFingerprint: fingerprint
    };
  });
}

type TeamCandidate = {
  id: bigint;
  raw: JsonRecord;
  data: TeamData;
};

function extractTeams(payload: unknown): { home: TeamCandidate | null; away: TeamCandidate | null } {
  const details = asRecord(payload);
  const raw = rawPayloadFromDetails(payload);
  const general = asRecord(raw.general);
  const header = asRecord(raw.header);
  const headerTeams = Array.isArray(header.teams) ? header.teams.map(asRecord) : [];

  const home = teamCandidate(
    firstRecordValue(details.home, details.homeTeam, raw.home, raw.homeTeam, general.homeTeam, header.home, header.homeTeam, headerTeams[0]),
    firstString(details.homeTeamId)
  );
  const away = teamCandidate(
    firstRecordValue(details.away, details.awayTeam, raw.away, raw.awayTeam, general.awayTeam, header.away, header.awayTeam, headerTeams[1]),
    firstString(details.awayTeamId)
  );

  return { home, away };
}

function teamCandidate(value: unknown, fallbackId?: string): TeamCandidate | null {
  const raw = asRecord(value);
  const rawId = firstString(raw.id, raw.teamId, raw.team_id, fallbackId);
  const id = sourceIdToBigInt(rawId, "team");
  if (!id) return null;

  return {
    id,
    raw,
    data: {
      id,
      name: firstString(raw.name, raw.teamName, raw.shortName) ?? `FotMob team ${rawId ?? id}`,
      country: firstString(raw.country, raw.cname) ?? null,
      ccode: firstString(raw.ccode, raw.countryCode) ?? null,
      rawRef: rawId ?? String(id)
    }
  };
}

function directPlayerStats(payload: unknown): unknown[] {
  const details = asRecord(payload);
  const detailRows = playerStatsFromCollection(details.playerStats, playerLineupContext(rawPayloadFromDetails(payload)));
  if (detailRows.length > 0) return detailRows;

  const raw = rawPayloadFromDetails(payload);
  const lineupContext = playerLineupContext(raw);
  const exactPaths = [
    ["playerStats"],
    ["content", "playerStats"],
    ["content", "lineup", "playerStats"],
    ["content", "lineup", "lineup"],
    ["content", "lineups"],
    ["lineups"]
  ];

  for (const path of exactPaths) {
    const value = getPath(raw, path);
    const rows = playerStatsFromCollection(value, lineupContext);
    if (rows.length > 0) return rows;
  }

  return [];
}

function playerStatsFromCollection(value: unknown, lineupContext: Map<string, JsonRecord>): unknown[] {
  const values = Array.isArray(value) ? value : playerStatMapValues(value);
  return values.length > 0 ? flattenPlayerStatArray(values, {}, lineupContext) : [];
}

function playerStatMapValues(value: unknown): unknown[] {
  const record = asRecord(value);
  const values = Object.values(record);
  if (values.length === 0) return [];
  return values.some(isLikelyPlayerStat) ? values : [];
}

function isLikelyPlayerStat(value: unknown) {
  const record = asRecord(value);
  return firstString(record.playerId, record.player_id, record.id) !== undefined && (record.name !== undefined || record.stats !== undefined || record.teamId !== undefined);
}

function flattenPlayerStatArray(values: unknown[], context: JsonRecord = {}, lineupContext: Map<string, JsonRecord> = new Map()): unknown[] {
  return values.flatMap((value) => {
    const record = asRecord(value);
    const nextContext = {
      ...context,
      _teamId: firstString(record.teamId, record.team_id, asRecord(record.team).id, context._teamId)
    };
    if (Array.isArray(record.players)) return flattenPlayerStatArray(record.players, nextContext, lineupContext);
    if (Array.isArray(record.members)) return flattenPlayerStatArray(record.members, nextContext, lineupContext);
    if (Array.isArray(record.lineup)) return flattenPlayerStatArray(record.lineup, nextContext, lineupContext);
    if (Array.isArray(record.starters)) return flattenPlayerStatArray(record.starters, { ...nextContext, _started: true }, lineupContext);
    if (Array.isArray(record.substitutes)) return flattenPlayerStatArray(record.substitutes, nextContext, lineupContext);
    if (Array.isArray(record.subs)) return flattenPlayerStatArray(record.subs, nextContext, lineupContext);
    const playerId = firstString(record.playerId, record.player_id, record.id);
    const lineup = playerId ? playerLineupContextValue(lineupContext, playerId) : {};
    return {
      ...lineup,
      ...nextContext,
      ...record,
      _teamId: firstString(record.teamId, record.team_id, asRecord(record.team).id, nextContext._teamId, lineup._teamId)
    };
  });
}

function playerLineupContext(raw: unknown) {
  const lineup = asRecord(getPath(raw, ["content", "lineup"]));
  const context = new Map<string, JsonRecord>();
  for (const sideKey of ["homeTeam", "awayTeam"]) {
    const team = asRecord(lineup[sideKey]);
    const teamId = firstString(team.id, team.teamId);
    addLineupPlayers(context, team.starters, teamId, true);
    addLineupPlayers(context, team.subs, teamId, false);
    addLineupPlayers(context, team.substitutes, teamId, false);
  }
  return context;
}

function addLineupPlayers(context: Map<string, JsonRecord>, players: unknown, teamId: string | undefined, started: boolean) {
  if (!Array.isArray(players)) return;
  for (const value of players) {
    const player = asRecord(value);
    const playerId = firstString(player.id, player.playerId, player.player_id);
    if (!playerId) continue;
    context.set(playerId, {
      _teamId: firstString(player.teamId, player.team_id, teamId),
      _started: started,
      position: fotMobPosition(player),
      shirtNumber: firstString(player.shirtNumber, player.shirt_number, player.number),
      country: firstString(player.countryName, player.country, player.nationality),
      name: firstString(player.name)
    });
  }
}

function playerLineupContextValue(context: Map<string, JsonRecord>, playerId: string) {
  return context.get(playerId) ?? context.get(String(Number(playerId))) ?? {};
}

function fotMobPosition(record: JsonRecord) {
  if (booleanValue(record.isGoalkeeper) === true) return "Goalkeeper";
  const usualPosition = intOrNull(numberValue(record.usualPosition ?? record.usualPlayingPositionId));
  if (usualPosition === 0) return "Goalkeeper";
  if (usualPosition === 1) return "Defender";
  if (usualPosition === 2) return "Midfielder";
  if (usualPosition === 3) return "Forward";
  return null;
}

function readPlayerStatNumber(record: JsonRecord, aliases: string[]) {
  for (const alias of aliases) {
    const direct = numberValue(record[alias]);
    if (direct !== null) return direct;
  }

  return findNestedStatNumber(record.stats, new Set(aliases.map(normalizeStatLabel)));
}

function normalizeStatLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function findNestedStatNumber(value: unknown, normalizedAliases: Set<string>, depth = 0): number | null {
  if (depth > 6) return null;
  const direct = statNumberValue(value);
  if (direct !== null && (typeof value === "number" || typeof value === "string")) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNestedStatNumber(item, normalizedAliases, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) return null;

  const label = firstString(record.key, record.name, record.title, record.label, record.statName);
  if (label && statLabelMatches(label, normalizedAliases)) {
    const parsed = statNumberValue(record);
    if (parsed !== null) return parsed;
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    if (statLabelMatches(key, normalizedAliases)) {
      const parsed = statNumberValue(nestedValue);
      if (parsed !== null) return parsed;
    }
  }

  for (const key of ["stats", "groups", "items", "children", "sections"]) {
    const nested = findNestedStatNumber(record[key], normalizedAliases, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

function statLabelMatches(label: string, normalizedAliases: Set<string>) {
  const normalized = normalizeStatLabel(label);
  for (const alias of normalizedAliases) {
    if (normalized === alias) return true;
    if (alias.length >= 8 && normalized.includes(alias)) return true;
  }
  return false;
}

function statNumberValue(value: unknown): number | null {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  const record = asRecord(value);
  const stat = asRecord(record.stat);
  return numberValue(record.value) ?? numberValue(record.displayValue) ?? numberValue(record.total) ?? numberValue(stat.value) ?? numberValue(stat.displayValue) ?? numberValue(stat.total);
}

function eventObjects(payload: unknown): unknown[] {
  const raw = rawPayloadFromDetails(payload);
  const exactPaths = [
    ["content", "matchFacts", "events", "events"],
    ["content", "matchFacts", "events"],
    ["content", "events", "events"],
    ["content", "events"],
    ["events"],
    ["incidents"]
  ];

  for (const path of exactPaths) {
    const value = getPath(raw, path);
    if (Array.isArray(value) && value.some(isEventObject)) return value.filter(isEventObject);
  }

  return [];
}

function isEventObject(value: unknown) {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return false;
  if (record.x !== undefined && record.y !== undefined) return false;
  return ["minute", "time", "eventMinute"].some((key) => record[key] !== undefined) && ["eventType", "type", "incidentType", "event"].some((key) => record[key] !== undefined);
}

function collectNestedPlayers(value: unknown, players: Map<string, PlayerData>, depth = 0) {
  if (depth > 5) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNestedPlayers(item, players, depth + 1);
    return;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) return;
  if ((record.playerId !== undefined || record.id !== undefined) && record.name !== undefined) {
    addPlayer(players, {
      id: firstString(record.playerId, record.player_id, record.id),
      name: firstString(record.name, record.playerName),
      country: firstString(record.country, record.nationality, record.cname),
      birthDate: dateValue(firstString(record.birthDate, record.dateOfBirth))
    });
  }

  for (const key of ["players", "members", "lineup", "substitutes", "subs", "bench", "starters", "events", "swap", "player", "person", "actor", "assist", "assistPlayer", "relatedPlayer"]) {
    collectNestedPlayers(record[key], players, depth + 1);
  }
}

function addPlayer(
  players: Map<string, PlayerData>,
  input: { id: string | number | bigint | null | undefined; name: string | null | undefined; country: string | null | undefined; birthDate: Date | null | undefined }
) {
  const id = sourceIdToBigInt(input.id, "player");
  if (!id) return;
  const key = String(id);
  const existing = players.get(key);
  players.set(key, {
    id,
    name: input.name ?? existing?.name ?? `FotMob player ${input.id ?? id}`,
    country: input.country ?? existing?.country ?? null,
    birthDate: input.birthDate ?? existing?.birthDate ?? null,
    rawRef: input.id === null || input.id === undefined ? existing?.rawRef ?? String(id) : String(input.id)
  });
}

function normalizeEventType(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, "_") ?? "";
  if (!normalized) return null;
  if (normalized.includes("substitution")) return "substitution";
  if (normalized.includes("card")) return "card";
  if (normalized.includes("goal")) return "goal";
  return normalized;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[\s_-]+/g, "_") ?? "";
  if (!normalized) return null;
  if (normalized.includes("FINISH")) return "FINISHED";
  if (normalized.includes("LIVE") || normalized.includes("ONGOING")) return "LIVE";
  if (normalized.includes("CANCEL")) return "CANCELLED";
  if (normalized.includes("POSTPONE")) return "POSTPONED";
  if (normalized.includes("SCHEDULE")) return "SCHEDULED";
  return normalized;
}

function uniqueById<T extends { id: bigint }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) map.set(String(item.id), item);
  return [...map.values()];
}

function rawPayloadFromDetails(payload: unknown) {
  const record = asRecord(payload);
  const raw = asRecord(record.raw);
  return Object.keys(raw).length > 0 ? raw : record;
}

function getPath(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    current = asRecord(current)[segment];
  }
  return current;
}

function firstRecordValue(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const normalized = value.trim().replace("%", "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function intOrNull(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function dateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
