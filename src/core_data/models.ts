import { createHash } from "node:crypto";

export const FOTMOB_SOURCE = "fotmob";
export const CORE_SCHEMA_VERSION = "2026-05-shared-football-v1";
export const DEFAULT_PARSER_VERSION = "fotmob-parser-v1";

export type JsonRecord = Record<string, unknown>;

export type MatchData = {
  id: bigint;
  leagueId: bigint | null;
  season: string | null;
  round: string | null;
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  started: boolean;
  finished: boolean;
  cancelled: boolean;
  matchDate: Date | null;
  utcTime: Date | null;
  sourceUrl: string | null;
  rawRef: string | null;
};

export type LeagueData = {
  id: bigint;
  name: string;
  country: string | null;
  rawRef: string | null;
};

export type TeamData = {
  id: bigint;
  name: string;
  country: string | null;
  ccode: string | null;
  rawRef: string | null;
};

export type PlayerData = {
  id: bigint;
  name: string;
  country: string | null;
  birthDate: Date | null;
  rawRef: string | null;
};

export type LeagueSeasonData = {
  leagueId: bigint;
  season: string;
  calendarType: string | null;
  isCurrent: boolean;
  providerSeason: string | null;
  name: string | null;
  country: string | null;
  metadata: unknown;
};

export type LeagueSeasonTeamData = {
  leagueId: bigint;
  season: string;
  teamId: bigint;
  active: boolean;
  metadata: unknown;
};

export type TeamPlayerSeasonData = {
  leagueId: bigint;
  season: string;
  teamId: bigint;
  playerId: bigint;
  active: boolean;
  position: string | null;
  shirtNumber: number | null;
  nationality: string | null;
  age: number | null;
  photoUrl: string | null;
};

export type TeamMatchStatsData = {
  matchId: bigint;
  teamId: bigint;
  opponentTeamId: bigint | null;
  isHome: boolean | null;
  goals: number | null;
  xg: number | null;
  xgot: number | null;
  xa: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  shotsOffTarget: number | null;
  blockedShots: number | null;
  bigChances: number | null;
  bigChancesMissed: number | null;
  touchesInOppBox: number | null;
  possession: number | null;
  passes: number | null;
  accuratePasses: number | null;
  passAccuracy: number | null;
  corners: number | null;
  offsides: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  tacklesWon: number | null;
  interceptions: number | null;
  clearances: number | null;
  saves: number | null;
};

export type PlayerMatchStatsData = {
  matchId: bigint;
  playerId: bigint;
  teamId: bigint | null;
  opponentTeamId: bigint | null;
  isHome: boolean | null;
  started: boolean | null;
  substitutedIn: boolean | null;
  substitutedOut: boolean | null;
  minutes: number | null;
  position: string | null;
  shirtNumber: number | null;
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
  chancesCreated: number | null;
  tacklesWon: number | null;
  interceptions: number | null;
  clearances: number | null;
  duelsWon: number | null;
  aerialsWon: number | null;
  recoveries: number | null;
  touchesInOppBox: number | null;
  foulsWon: number | null;
  penaltiesWon: number | null;
  rating: number | null;
};

export type MatchEventData = {
  matchId: bigint;
  teamId: bigint | null;
  playerId: bigint | null;
  relatedPlayerId: bigint | null;
  minute: number | null;
  addedTime: number | null;
  eventType: string | null;
  eventSubtype: string | null;
  isGoal: boolean;
  isAssist: boolean;
  isOwnGoal: boolean;
  isPenalty: boolean;
  isCard: boolean;
  isSubstitution: boolean;
};

export type MatchShotData = {
  matchId: bigint;
  teamId: bigint | null;
  opponentTeamId: bigint | null;
  playerId: bigint | null;
  isHome: boolean | null;
  minute: number | null;
  addedTime: number | null;
  x: number | null;
  y: number | null;
  normalizedX: number | null;
  normalizedY: number | null;
  eventType: string | null;
  shotType: string | null;
  bodyPart: string | null;
  situation: string | null;
  isGoal: boolean;
  isOnTarget: boolean | null;
  isBlocked: boolean | null;
  isBigChance: boolean | null;
  xg: number | null;
  xgot: number | null;
  sourceFingerprint: string;
};

export type ParsedMatchPayload = {
  match: MatchData;
  leagues: LeagueData[];
  teams: TeamData[];
  players: PlayerData[];
  teamStats: TeamMatchStatsData[];
  playerStats: PlayerMatchStatsData[];
  events: MatchEventData[];
  shots: MatchShotData[];
};

export function sourceIdToBigInt(value: string | number | bigint | null | undefined, namespace: string): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return BigInt(raw);

  const digest = createHash("sha1").update(`${namespace}:${raw}`).digest("hex").slice(0, 15);
  return BigInt(`0x${digest}`);
}

export function payloadHash(payload: unknown) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function sourceFingerprint(parts: unknown[]) {
  return createHash("sha1").update(parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("|")).digest("hex");
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;

  return Object.keys(value)
    .sort()
    .reduce<JsonRecord>((acc, key) => {
      acc[key] = sortJson(value[key]);
      return acc;
    }, {});
}

export function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
