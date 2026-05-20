import { Prisma, type PrismaClient } from "@prisma/client";

import { CoreMatchRepository, CoreShotRepository } from "@/core_data/repositories";
import { sourceIdToBigInt } from "@/core_data/models";
import { buildSideZoneSummary } from "@/providers/fotmob/shots";
import { matchWindowSeasonLabel, type MacheteMatchWindow } from "@/scoring/machete/match-window";

export type ShotMapShot = {
  id: string;
  fixture_id: string | null;
  match_id: string;
  team_id: string | null;
  opponent_team_id: string | null;
  player_id: string | null;
  provider_team_id: string | null;
  provider_opponent_team_id: string | null;
  provider_player_id: string | null;
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
  match_date: string | null;
  match_label: string | null;
};

type FixtureLike = {
  id: string;
  status: string | null;
  kickoffAt: Date | string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
};

type ShotLike =
  | ShotMapShot
  | {
      fixture_id?: string | null;
      fixtureId?: string | null;
      team_id?: string | null;
      teamId?: string | null;
      opponent_team_id?: string | null;
      opponentTeamId?: string | null;
      player_id?: string | null;
      playerId?: string | null;
    };

type ShotRecord = {
  id: bigint;
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
  match?: {
    id: bigint;
    matchDate: Date | null;
    homeTeam?: { id: bigint; name: string } | null;
    awayTeam?: { id: bigint; name: string } | null;
  } | null;
  team?: { id: bigint; name: string; rawRef: string | null } | null;
  opponentTeam?: { id: bigint; name: string; rawRef: string | null } | null;
  player?: { id: bigint; name: string; rawRef: string | null } | null;
};

export async function get_player_shots_last_team_matches(
  prisma: PrismaClient,
  player_id: string | number | bigint,
  team_id: string | number | bigint,
  limit_matches = 5
) {
  const team = await resolveTeamReference(prisma, team_id);
  const player = await resolvePlayerReference(prisma, player_id);
  const matchIds = await new CoreMatchRepository(prisma).latestTeamMatchIds(team.coreId, limit_matches);
  const shots = await new CoreShotRepository(prisma).findPlayerShotsForTeamMatches(player.coreId, team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_team_shots_for_last_matches(prisma: PrismaClient, team_id: string | number | bigint, limit_matches = 5) {
  const team = await resolveTeamReference(prisma, team_id);
  const matchIds = await new CoreMatchRepository(prisma).latestTeamMatchIds(team.coreId, limit_matches);
  const shots = await new CoreShotRepository(prisma).findTeamShotsForMatches(team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_team_conceded_shots_for_last_matches(prisma: PrismaClient, team_id: string | number | bigint, limit_matches = 5) {
  const team = await resolveTeamReference(prisma, team_id);
  const matchIds = await new CoreMatchRepository(prisma).latestTeamMatchIds(team.coreId, limit_matches);
  const shots = await new CoreShotRepository(prisma).findTeamConcededShotsForMatches(team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_shot_map_comparison(
  prisma: PrismaClient,
  attacking_team_id: string | number | bigint,
  defending_team_id: string | number | bigint,
  attacking_limit_matches = 5,
  defending_limit_matches = 5
) {
  const attacking_shots = await get_team_shots_for_last_matches(prisma, attacking_team_id, attacking_limit_matches);
  const defending_conceded_shots = await get_team_conceded_shots_for_last_matches(prisma, defending_team_id, defending_limit_matches);

  return buildShotMapComparisonFromShots(String(attacking_team_id), String(defending_team_id), attacking_shots, defending_conceded_shots);
}

export async function get_player_shots_for_team_window(
  prisma: PrismaClient,
  player_id: string | number | bigint,
  team_id: string | number | bigint,
  window: MacheteMatchWindow,
  context: ShotWindowContext = {}
) {
  const team = await resolveTeamReference(prisma, team_id, context);
  const player = await resolvePlayerReference(prisma, player_id);
  const matchIds = await teamMatchIdsForShotWindow(prisma, team, window);
  const shots = await new CoreShotRepository(prisma).findPlayerShotsForTeamMatches(player.coreId, team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_team_shots_for_window(prisma: PrismaClient, team_id: string | number | bigint, window: MacheteMatchWindow, context: ShotWindowContext = {}) {
  const team = await resolveTeamReference(prisma, team_id, context);
  const matchIds = await teamMatchIdsForShotWindow(prisma, team, window);
  const shots = await new CoreShotRepository(prisma).findTeamShotsForMatches(team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_team_conceded_shots_for_window(
  prisma: PrismaClient,
  team_id: string | number | bigint,
  window: MacheteMatchWindow,
  context: ShotWindowContext = {}
) {
  const team = await resolveTeamReference(prisma, team_id, context);
  const matchIds = await teamMatchIdsForShotWindow(prisma, team, window);
  const shots = await new CoreShotRepository(prisma).findTeamConcededShotsForMatches(team.coreId, matchIds);
  return shots.map(serializeShot);
}

export async function get_shot_map_comparison_for_windows(
  prisma: PrismaClient,
  attacking_team_id: string | number | bigint,
  defending_team_id: string | number | bigint,
  attacking_window: MacheteMatchWindow,
  defending_window: MacheteMatchWindow,
  context: ShotWindowContext = {},
  defendingContext: ShotWindowContext = context
) {
  const attacking_shots = await get_team_shots_for_window(prisma, attacking_team_id, attacking_window, context);
  const defending_conceded_shots = await get_team_conceded_shots_for_window(prisma, defending_team_id, defending_window, defendingContext);

  return buildShotMapComparisonFromShots(String(attacking_team_id), String(defending_team_id), attacking_shots, defending_conceded_shots);
}

export class ShotmapCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(cacheKey: string) {
    const row = await this.prisma.shotmapComparisonsCache.findUnique({ where: { cacheKey } });
    if (!row || row.expiresAt <= new Date()) return null;
    return row.result;
  }

  async set(input: { cacheKey: string; queryParams: unknown; result: unknown; expiresAt: Date; sourceMatchIds: Array<string | bigint>; payloadHashes?: string[] }) {
    return this.prisma.shotmapComparisonsCache.upsert({
      where: { cacheKey: input.cacheKey },
      update: {
        queryParams: jsonValue(input.queryParams),
        result: jsonValue(input.result),
        expiresAt: input.expiresAt,
        sourceMatchIds: jsonValue(input.sourceMatchIds.map(String)),
        payloadHashes: jsonValue(input.payloadHashes ?? [])
      },
      create: {
        cacheKey: input.cacheKey,
        queryParams: jsonValue(input.queryParams),
        result: jsonValue(input.result),
        expiresAt: input.expiresAt,
        sourceMatchIds: jsonValue(input.sourceMatchIds.map(String)),
        payloadHashes: jsonValue(input.payloadHashes ?? [])
      }
    });
  }
}

export function latestTeamMatchIds(fixtures: FixtureLike[], teamId: string | number, limitMatches = 5) {
  const team = String(teamId);
  return fixtures
    .filter((fixture) => fixture.status === "FINISHED")
    .filter((fixture) => fixture.homeTeamId === team || fixture.awayTeamId === team)
    .sort((left, right) => dateMs(right.kickoffAt) - dateMs(left.kickoffAt))
    .slice(0, limitMatches)
    .map((fixture) => fixture.id);
}

export function selectPlayerShotsForTeamMatches<TShot extends ShotLike>(
  shots: TShot[],
  fixtures: FixtureLike[],
  playerId: string | number,
  teamId: string | number,
  limitMatches = 5
) {
  const orderedFixtureIds = latestTeamMatchIds(fixtures, teamId, limitMatches);
  const fixtureIds = new Set(orderedFixtureIds);
  const fixtureRank = new Map(orderedFixtureIds.map((id, index) => [id, index]));
  const player = String(playerId);
  const team = String(teamId);
  return shots
    .filter((shot) => fixtureIds.has(shotFixtureId(shot)) && shotPlayerId(shot) === player && shotTeamId(shot) === team)
    .sort((left, right) => (fixtureRank.get(shotFixtureId(left)) ?? 0) - (fixtureRank.get(shotFixtureId(right)) ?? 0));
}

export function selectTeamConcededShotsForMatches<TShot extends ShotLike>(
  shots: TShot[],
  fixtures: FixtureLike[],
  teamId: string | number,
  limitMatches = 5
) {
  const orderedFixtureIds = latestTeamMatchIds(fixtures, teamId, limitMatches);
  const fixtureIds = new Set(orderedFixtureIds);
  const fixtureRank = new Map(orderedFixtureIds.map((id, index) => [id, index]));
  const team = String(teamId);
  return shots
    .filter((shot) => {
      if (!fixtureIds.has(shotFixtureId(shot))) return false;
      if (shotOpponentTeamId(shot) === team) return true;
      return !shotOpponentTeamId(shot) && shotTeamId(shot) !== team;
    })
    .sort((left, right) => (fixtureRank.get(shotFixtureId(left)) ?? 0) - (fixtureRank.get(shotFixtureId(right)) ?? 0));
}

export function buildShotMapComparisonFromShots(
  attacking_team_id: string,
  defending_team_id: string,
  attacking_shots: ShotMapShot[],
  defending_conceded_shots: ShotMapShot[]
) {
  return {
    attacking_team_id,
    defending_team_id,
    attacking_shots,
    defending_conceded_shots,
    summary: {
      attacking_shots_count: attacking_shots.length,
      attacking_xg: round(sumXg(attacking_shots)),
      attacking_goals: attacking_shots.filter((shot) => shot.is_goal).length,
      conceded_shots_count: defending_conceded_shots.length,
      conceded_xg: round(sumXg(defending_conceded_shots)),
      conceded_goals: defending_conceded_shots.filter((shot) => shot.is_goal).length,
      zones: {
        attacking: buildSideZoneSummary(attacking_shots),
        conceded: buildSideZoneSummary(defending_conceded_shots)
      }
    }
  };
}

type TeamReference = {
  coreId: bigint;
  leagueId: bigint | null;
  season: string | null;
  providerLeagueId: string | null;
  competitionScopes: ShotCompetitionScope[];
};

type ShotCompetitionScope = {
  leagueId: bigint;
  season: string;
};

type ShotWindowContext = {
  leagueId?: string | number | bigint | null;
  season?: string | null;
  competitionScopes?: ShotCompetitionScope[];
};

async function resolveTeamReference(prisma: PrismaClient, teamId: string | number | bigint, context: ShotWindowContext = {}): Promise<TeamReference> {
  const raw = String(teamId);
  const macheteTeam = await prisma.macheteTeam.findUnique({
    where: { id: raw },
    select: {
      providerTeamId: true,
      league: {
        select: {
          season: true,
          providerLeagueId: true
        }
      }
    }
  });

  const coreId = sourceIdToBigInt(macheteTeam?.providerTeamId ?? raw, "team");
  if (!coreId) throw new Error(`Cannot resolve team id for shot map: ${raw}`);
  const contextLeagueId = sourceIdToBigInt(context.leagueId, "league");
  const macheteLeagueId = sourceIdToBigInt(macheteTeam?.league.providerLeagueId, "league");

  return {
    coreId,
    leagueId: contextLeagueId ?? macheteLeagueId,
    season: context.season ?? macheteTeam?.league.season ?? null,
    providerLeagueId: macheteTeam?.league.providerLeagueId ?? null,
    competitionScopes: context.competitionScopes ?? []
  };
}

async function resolvePlayerReference(prisma: PrismaClient, playerId: string | number | bigint) {
  const raw = String(playerId);
  const machetePlayer = await prisma.machetePlayer.findUnique({
    where: { id: raw },
    select: { providerPlayerId: true }
  });
  const coreId = sourceIdToBigInt(machetePlayer?.providerPlayerId ?? raw, "player");
  if (!coreId) throw new Error(`Cannot resolve player id for shot map: ${raw}`);
  return { coreId };
}

async function teamMatchIdsForShotWindow(prisma: PrismaClient, team: TeamReference, window: MacheteMatchWindow) {
  if (team.competitionScopes.length > 0) {
    const matches = await prisma.coreMatch.findMany({
      where: {
        finished: true,
        OR: team.competitionScopes.map((scope) => ({
          leagueId: scope.leagueId,
          ...(window.kind === "season"
            ? { season: matchWindowSeasonLabel(scope.season, window.offset, String(scope.leagueId)) }
            : window.kind === "last"
              ? { season: scope.season }
              : {}),
          OR: [{ homeTeamId: team.coreId }, { awayTeamId: team.coreId }]
        }))
      },
      orderBy: { matchDate: "desc" },
      take: window.kind === "last" ? window.matches : undefined,
      select: {
        id: true,
        status: true
      }
    });

    return matches.map((match) => match.id);
  }

  const season = window.kind === "season" ? matchWindowSeasonLabel(team.season, window.offset, team.providerLeagueId) : window.kind === "last" ? team.season : null;

  const matches = await prisma.coreMatch.findMany({
    where: {
      finished: true,
      ...(team.leagueId ? { leagueId: team.leagueId } : {}),
      ...(season ? { season } : {}),
      OR: [{ homeTeamId: team.coreId }, { awayTeamId: team.coreId }]
    },
    orderBy: { matchDate: "desc" },
    take: window.kind === "last" ? window.matches : undefined,
    select: {
      id: true,
      status: true
    }
  });

  return matches.map((match) => match.id);
}

function serializeShot(shot: ShotRecord): ShotMapShot {
  return {
    id: String(shot.id),
    fixture_id: String(shot.matchId),
    match_id: String(shot.matchId),
    team_id: shot.teamId === null ? null : String(shot.teamId),
    opponent_team_id: shot.opponentTeamId === null ? null : String(shot.opponentTeamId),
    provider_team_id: shot.team?.rawRef ?? null,
    provider_opponent_team_id: shot.opponentTeam?.rawRef ?? null,
    provider_player_id: shot.player?.rawRef ?? null,
    player_id: shot.playerId === null ? null : String(shot.playerId),
    player_name: shot.player?.name ?? null,
    is_home: shot.isHome,
    minute: shot.minute,
    added_time: shot.addedTime,
    x: shot.x,
    y: shot.y,
    normalized_x: shot.normalizedX,
    normalized_y: shot.normalizedY,
    event_type: shot.eventType,
    shot_type: shot.shotType,
    body_part: shot.bodyPart,
    situation: shot.situation,
    is_goal: shot.isGoal,
    is_on_target: shot.isOnTarget,
    is_blocked: shot.isBlocked,
    is_big_chance: shot.isBigChance,
    xg: shot.xg,
    xgot: shot.xgot,
    team_name: shot.team?.name ?? null,
    opponent_team_name: shot.opponentTeam?.name ?? null,
    match_date: shot.match?.matchDate?.toISOString() ?? null,
    match_label: [shot.match?.homeTeam?.name, shot.match?.awayTeam?.name].filter(Boolean).join(" vs ") || null
  };
}

function sumXg(shots: Array<{ xg: number | null }>) {
  return shots.reduce((total, shot) => total + (shot.xg ?? 0), 0);
}

function dateMs(value: Date | string | null) {
  if (!value) return 0;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function shotFixtureId(shot: ShotLike) {
  return String("fixture_id" in shot ? shot.fixture_id ?? "" : shot.fixtureId ?? "");
}

function shotTeamId(shot: ShotLike) {
  return String("team_id" in shot ? shot.team_id ?? "" : shot.teamId ?? "");
}

function shotOpponentTeamId(shot: ShotLike) {
  return String("opponent_team_id" in shot ? shot.opponent_team_id ?? "" : shot.opponentTeamId ?? "");
}

function shotPlayerId(shot: ShotLike) {
  return String("player_id" in shot ? shot.player_id ?? "" : shot.playerId ?? "");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}
