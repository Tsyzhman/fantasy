import {
  FOTMOB_PITCH_LENGTH_METERS as FOTMOB_PITCH_LENGTH,
  FOTMOB_PITCH_WIDTH_METERS as FOTMOB_PITCH_WIDTH,
  normalize_fotmob_pitch_coordinates
} from "@/lib/shot-coordinates";

export type FotMobShotRow = {
  match_id: number | null;
  team_id: number | null;
  opponent_team_id: number | null;
  player_id: number | null;
  player_name: string | null;
  is_home: boolean | null;
  minute: number | null;
  added_time: number | null;
  x: number | null;
  y: number | null;
  normalized_x: number | null;
  normalized_y: number | null;
  event_type: string | null;
  shot_type: string | null;
  body_part: string | null;
  situation: string | null;
  is_goal: boolean;
  is_on_target: boolean | null;
  is_blocked: boolean | null;
  is_big_chance: boolean | null;
  xg: number | null;
  xgot: number | null;
  team_name: string | null;
  opponent_team_name: string | null;
  raw: Record<string, unknown>;
};

export type FotMobMatchContext = {
  match_id: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
};

type JsonRecord = Record<string, unknown>;

const coordinateKeys = ["x", "y", "coordinateX", "coordinateY", "xCoord", "yCoord", "shotX", "shotY"];

export function extract_match_shots(payload: unknown): FotMobShotRow[] {
  const sourcePayload = rawPayloadFromDetails(payload);
  const shots = findShotArray(sourcePayload);
  if (shots.length === 0) return [];

  const matchContext = extractMatchContext(sourcePayload);

  return shots
    .map((shot) => normalizeShot(shot, matchContext))
    .filter((shot): shot is FotMobShotRow => shot !== null);
}

export function normalize_shot_coordinates(
  shot: { x?: number | null; y?: number | null; raw?: JsonRecord },
  _matchContext: FotMobMatchContext
): [number | null, number | null] {
  const x = numberValue(shot.x);
  const y = numberValue(shot.y);
  if (x === null || y === null) return [x, y];
  const [scaledX, scaledY] = normalize_fotmob_pitch_coordinates(x, y);

  const direction = stringValue(pick(shot.raw ?? {}, ["attackingDirection", "attackDirection", "direction", "teamDirection"]));
  if (direction && /right.?to.?left|rtl/i.test(direction) && !/left.?to.?right|ltr/i.test(direction)) {
    return [flipPercentCoordinate(scaledX), flipPercentCoordinate(scaledY)];
  }

  // FotMob web shot maps expose coordinates on a 105 x 68 pitch. MiXerr stores normalized
  // percentages so drawing code and side-zone summaries can share one coordinate contract.
  if (!direction && process.env.MIXERR_DEBUG_SHOT_COORDS === "1") {
    console.debug("[mixerr] FotMob shot direction was not present; using scaled raw shot coordinates as normalized coordinates.");
  }

  return [scaledX, scaledY];
}

export function classify_shot_zone(normalized_x: number | null | undefined, normalized_y: number | null | undefined) {
  if (typeof normalized_x !== "number" || typeof normalized_y !== "number") return "unknown";
  if (normalized_y < 33.3) return "left";
  if (normalized_y <= 66.6) return "center";
  return "right";
}

export function classify_shot_depth_zone(normalized_x: number | null | undefined, normalized_y: number | null | undefined) {
  if (typeof normalized_x !== "number" || typeof normalized_y !== "number") return "unknown";
  const distanceToGoal = 100 - normalized_x;
  const central = normalized_y >= 37 && normalized_y <= 63;

  if (distanceToGoal <= 18 && central) return "central_box";
  if (distanceToGoal <= 18) return "box";
  if (distanceToGoal <= 30 && normalized_y < 50) return "left_half_space";
  if (distanceToGoal <= 30 && normalized_y >= 50) return "right_half_space";
  return "outside_box";
}

export function buildSideZoneSummary(shots: Array<{ normalized_x?: number | null; normalized_y?: number | null; xg?: number | null }>) {
  const summary = {
    left_shots: 0,
    center_shots: 0,
    right_shots: 0,
    left_xg: 0,
    center_xg: 0,
    right_xg: 0
  };

  for (const shot of shots) {
    const zone = classify_shot_zone(shot.normalized_x, shot.normalized_y);
    const xg = numberValue(shot.xg) ?? 0;
    if (zone === "left") {
      summary.left_shots += 1;
      summary.left_xg += xg;
    }
    if (zone === "center") {
      summary.center_shots += 1;
      summary.center_xg += xg;
    }
    if (zone === "right") {
      summary.right_shots += 1;
      summary.right_xg += xg;
    }
  }

  return {
    ...summary,
    left_xg: round(summary.left_xg),
    center_xg: round(summary.center_xg),
    right_xg: round(summary.right_xg)
  };
}

function normalizeShot(value: unknown, matchContext: FotMobMatchContext): FotMobShotRow | null {
  const shot = asRecord(value);
  if (Object.keys(shot).length === 0) return null;

  const nestedTeam = asRecord(pick(shot, ["team"]));
  const nestedPlayer = asRecord(pick(shot, ["player", "footballer"]));
  const teamId = numberValue(pick(shot, ["teamId", "team_id"], [nestedTeam, "id"], [nestedTeam, "teamId"]));
  const playerId = numberValue(pick(shot, ["playerId", "player_id"], [nestedPlayer, "id"], [nestedPlayer, "playerId"]));
  const x = numberValue(pick(shot, ["x", "coordinateX", "xCoord", "shotX"]));
  const y = numberValue(pick(shot, ["y", "coordinateY", "yCoord", "shotY"]));
  const eventType = stringValue(pick(shot, ["eventType", "type", "result"]));
  const isHome = booleanValue(pick(shot, ["isHome", "is_home", "isHomeTeam"])) ?? inferIsHome(teamId, matchContext);
  const opponent = opponentForTeam(teamId, matchContext);
  const isGoal = booleanValue(pick(shot, ["isGoal", "goal"])) ?? /(^|\s)goal($|\s)/i.test(eventType ?? "");

  const rowBase = {
    x,
    y,
    raw: shot
  };
  const [normalizedX, normalizedY] = normalize_shot_coordinates(rowBase, matchContext);

  return {
    match_id: numberValue(pick(shot, ["matchId", "match_id", "fixtureId"])) ?? matchContext.match_id,
    team_id: teamId,
    opponent_team_id: opponent.id,
    player_id: playerId,
    player_name: stringValue(pick(shot, ["playerName", "name"], [nestedPlayer, "name"])) ?? null,
    is_home: isHome,
    minute: numberValue(pick(shot, ["minute", "min", "eventMinute", "time"])) ?? null,
    added_time: numberValue(pick(shot, ["addedTime", "added_time", "stoppageTime", "injuryTime"])) ?? null,
    x,
    y,
    normalized_x: normalizedX,
    normalized_y: normalizedY,
    event_type: eventType,
    shot_type: stringValue(pick(shot, ["shotType", "shot_type"])) ?? null,
    body_part: stringValue(pick(shot, ["bodyPart", "body_part"])) ?? null,
    situation: shotSituation(shot),
    is_goal: isGoal,
    is_on_target: booleanValue(pick(shot, ["isOnTarget", "onTarget", "is_on_target"])) ?? inferOnTarget(eventType, isGoal),
    is_blocked: booleanValue(pick(shot, ["isBlocked", "blocked", "is_blocked"])) ?? inferBlocked(eventType),
    is_big_chance: booleanValue(pick(shot, ["isBigChance", "bigChance", "is_big_chance"])) ?? null,
    xg: numberValue(pick(shot, ["expectedGoals", "xG", "expected_goals"])) ?? null,
    xgot: numberValue(pick(shot, ["expectedGoalsOnTarget", "xGOT", "expected_goals_on_target"])) ?? null,
    team_name: stringValue(pick(shot, ["teamName", "team_name"], [nestedTeam, "name"], [nestedTeam, "teamName"])) ?? teamNameForId(teamId, matchContext),
    opponent_team_name: opponent.name,
    raw: shot
  };
}

function findShotArray(payload: unknown): JsonRecord[] {
  const exactPaths = [
    ["content", "shotmap", "shots"],
    ["shotmap", "shots"],
    ["shots"],
    ["raw", "content", "shotmap", "shots"],
    ["raw", "shotmap", "shots"],
    ["payload", "content", "shotmap", "shots"],
    ["payload", "shotmap", "shots"]
  ];

  for (const path of exactPaths) {
    const value = getPath(payload, path);
    if (isShotArray(value)) return value.map(asRecord);
  }

  const discovered = findNestedShotArray(payload);
  return discovered.map(asRecord);
}

function findNestedShotArray(payload: unknown): unknown[] {
  const queue = [payload];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      if (isShotArray(value)) return value;
      queue.push(...value);
      continue;
    }

    const record = asRecord(value);
    if (Object.keys(record).length === 0) continue;
    const shotmap = asRecord(record.shotmap);
    if (isShotArray(shotmap.shots)) return shotmap.shots;
    for (const nested of Object.values(record)) queue.push(nested);
  }

  return [];
}

function isShotArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.some((item) => {
    const record = asRecord(item);
    return coordinateKeys.some((key) => key in record) || "expectedGoals" in record || "playerId" in record || "teamId" in record;
  });
}

function extractMatchContext(payload: unknown): FotMobMatchContext {
  const data = asRecord(payload);
  const general = asRecord(data.general);
  const header = asRecord(data.header);
  const teams = Array.isArray(header.teams) ? header.teams.map(asRecord) : [];
  const home = firstRecord(
    data.home,
    data.homeTeam,
    general.homeTeam,
    teams.find((team) => stringValue(team.side)?.toLowerCase() === "home"),
    teams[0]
  );
  const away = firstRecord(
    data.away,
    data.awayTeam,
    general.awayTeam,
    teams.find((team) => stringValue(team.side)?.toLowerCase() === "away"),
    teams[1]
  );

  return {
    match_id: numberValue(pick(data, ["id", "matchId", "match_id"], [general, "matchId"], [header, "id"])) ?? null,
    home_team_id: numberValue(pick(home, ["id", "teamId", "team_id"])) ?? null,
    away_team_id: numberValue(pick(away, ["id", "teamId", "team_id"])) ?? null,
    home_team_name: stringValue(pick(home, ["name", "teamName", "shortName"])) ?? null,
    away_team_name: stringValue(pick(away, ["name", "teamName", "shortName"])) ?? null
  };
}

function rawPayloadFromDetails(payload: unknown) {
  const record = asRecord(payload);
  return Object.keys(asRecord(record.raw)).length > 0 ? record.raw : payload;
}

function opponentForTeam(teamId: number | null, context: FotMobMatchContext) {
  if (teamId !== null && context.home_team_id !== null && teamId === context.home_team_id) {
    return { id: context.away_team_id, name: context.away_team_name };
  }
  if (teamId !== null && context.away_team_id !== null && teamId === context.away_team_id) {
    return { id: context.home_team_id, name: context.home_team_name };
  }
  return { id: null, name: null };
}

function inferIsHome(teamId: number | null, context: FotMobMatchContext) {
  if (teamId !== null && context.home_team_id !== null && teamId === context.home_team_id) return true;
  if (teamId !== null && context.away_team_id !== null && teamId === context.away_team_id) return false;
  return null;
}

function teamNameForId(teamId: number | null, context: FotMobMatchContext) {
  if (teamId !== null && context.home_team_id === teamId) return context.home_team_name;
  if (teamId !== null && context.away_team_id === teamId) return context.away_team_name;
  return null;
}

function shotSituation(shot: JsonRecord) {
  const direct = stringValue(pick(shot, ["situation"]));
  if (direct) return direct;
  if (booleanValue(shot.isPenalty)) return "penalty";
  if (booleanValue(shot.isFromSetPiece)) return "set_piece";
  return null;
}

function inferOnTarget(eventType: string | null, isGoal: boolean) {
  if (isGoal) return true;
  if (!eventType) return null;
  if (/saved|on.?target|woodwork/i.test(eventType)) return true;
  if (/off.?target|miss/i.test(eventType)) return false;
  return null;
}

function inferBlocked(eventType: string | null) {
  if (!eventType) return null;
  if (/block/i.test(eventType)) return true;
  return null;
}

function pick(record: JsonRecord, keys: string[], ...nested: [JsonRecord, string][]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  for (const [source, key] of nested) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function getPath(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    const record = asRecord(current);
    current = record[segment];
  }
  return current;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
}

function flipPercentCoordinate(value: number | null) {
  if (value === null) return null;
  return 100 - value;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
