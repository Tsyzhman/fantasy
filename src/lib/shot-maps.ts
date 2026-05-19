import type { PrismaClient } from "@prisma/client";

import { buildSideZoneSummary } from "@/providers/fotmob/shots";
import type { MacheteMatchWindow } from "@/scoring/machete/match-window";
import { teamFixtureIdsForWindow } from "@/scoring/machete/recent-match-stats";

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

type ShotLike = ShotMapShot | {
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
  id: string;
  fixtureId: string | null;
  providerMatchId: string;
  teamId: string | null;
  opponentTeamId: string | null;
  providerTeamId: string | null;
  providerOpponentTeamId: string | null;
  playerId: string | null;
  providerPlayerId: string | null;
  playerName: string | null;
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
  teamName: string | null;
  opponentTeamName: string | null;
  fixture?: {
    kickoffAt: Date | null;
    homeTeam?: { name: string } | null;
    awayTeam?: { name: string } | null;
  } | null;
};

export async function get_player_shots_last_team_matches(
  prisma: PrismaClient,
  player_id: string | number,
  team_id: string | number,
  limit_matches = 5
) {
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, String(team_id), { kind: "last", matches: limit_matches });
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      playerId: String(player_id),
      teamId: String(team_id)
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_team_shots_for_last_matches(prisma: PrismaClient, team_id: string | number, limit_matches = 5) {
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, String(team_id), { kind: "last", matches: limit_matches });
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      teamId: String(team_id)
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_team_conceded_shots_for_last_matches(prisma: PrismaClient, team_id: string | number, limit_matches = 5) {
  const teamId = String(team_id);
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, teamId, { kind: "last", matches: limit_matches });
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      OR: [
        { opponentTeamId: teamId },
        {
          opponentTeamId: null,
          teamId: { not: teamId }
        }
      ]
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_shot_map_comparison(
  prisma: PrismaClient,
  attacking_team_id: string | number,
  defending_team_id: string | number,
  attacking_limit_matches = 5,
  defending_limit_matches = 5
) {
  const attacking_shots = await get_team_shots_for_last_matches(prisma, attacking_team_id, attacking_limit_matches);
  const defending_conceded_shots = await get_team_conceded_shots_for_last_matches(prisma, defending_team_id, defending_limit_matches);

  return buildShotMapComparisonFromShots(String(attacking_team_id), String(defending_team_id), attacking_shots, defending_conceded_shots);
}

export async function get_player_shots_for_team_window(
  prisma: PrismaClient,
  player_id: string | number,
  team_id: string | number,
  window: MacheteMatchWindow
) {
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, String(team_id), window);
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      playerId: String(player_id),
      teamId: String(team_id)
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_team_shots_for_window(prisma: PrismaClient, team_id: string | number, window: MacheteMatchWindow) {
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, String(team_id), window);
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      teamId: String(team_id)
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_team_conceded_shots_for_window(prisma: PrismaClient, team_id: string | number, window: MacheteMatchWindow) {
  const teamId = String(team_id);
  const fixtureIds = await teamFixtureIdsForShotWindow(prisma, teamId, window);
  const shots = await prisma.matchShot.findMany({
    where: {
      fixtureId: { in: fixtureIds },
      OR: [
        { opponentTeamId: teamId },
        {
          opponentTeamId: null,
          teamId: { not: teamId }
        }
      ]
    },
    include: shotInclude(),
    orderBy: [{ fixture: { kickoffAt: "desc" } }, { minute: "asc" }]
  });

  return shots.map(serializeShot);
}

export async function get_shot_map_comparison_for_windows(
  prisma: PrismaClient,
  attacking_team_id: string | number,
  defending_team_id: string | number,
  attacking_window: MacheteMatchWindow,
  defending_window: MacheteMatchWindow
) {
  const attacking_shots = await get_team_shots_for_window(prisma, attacking_team_id, attacking_window);
  const defending_conceded_shots = await get_team_conceded_shots_for_window(prisma, defending_team_id, defending_window);

  return buildShotMapComparisonFromShots(String(attacking_team_id), String(defending_team_id), attacking_shots, defending_conceded_shots);
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

export function selectPlayerShotsForTeamMatches<TShot extends ShotLike>(shots: TShot[], fixtures: FixtureLike[], playerId: string | number, teamId: string | number, limitMatches = 5) {
  const orderedFixtureIds = latestTeamMatchIds(fixtures, teamId, limitMatches);
  const fixtureIds = new Set(orderedFixtureIds);
  const fixtureRank = new Map(orderedFixtureIds.map((id, index) => [id, index]));
  const player = String(playerId);
  const team = String(teamId);
  return shots
    .filter((shot) => fixtureIds.has(shotFixtureId(shot)) && shotPlayerId(shot) === player && shotTeamId(shot) === team)
    .sort((left, right) => (fixtureRank.get(shotFixtureId(left)) ?? 0) - (fixtureRank.get(shotFixtureId(right)) ?? 0));
}

export function selectTeamConcededShotsForMatches<TShot extends ShotLike>(shots: TShot[], fixtures: FixtureLike[], teamId: string | number, limitMatches = 5) {
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

async function teamFixtureIdsForShotWindow(prisma: PrismaClient, teamId: string, window: MacheteMatchWindow) {
  const team = await prisma.macheteTeam.findUnique({
    where: { id: teamId },
    select: {
      league: {
        select: {
          season: true,
          providerLeagueId: true
        }
      }
    }
  });

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      status: { not: "SEASON_AGGREGATE" },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    orderBy: { kickoffAt: "desc" },
    select: { id: true, status: true, kickoffAt: true }
  });

  return [...teamFixtureIdsForWindow(fixtures, window, team?.league.season, team?.league.providerLeagueId)];
}

function shotInclude() {
  return {
    fixture: {
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } }
      }
    }
  } as const;
}

function serializeShot(shot: ShotRecord): ShotMapShot {
  return {
    id: shot.id,
    fixture_id: shot.fixtureId,
    match_id: shot.providerMatchId,
    team_id: shot.teamId,
    opponent_team_id: shot.opponentTeamId,
    provider_team_id: shot.providerTeamId,
    provider_opponent_team_id: shot.providerOpponentTeamId,
    provider_player_id: shot.providerPlayerId,
    player_id: shot.playerId,
    player_name: shot.playerName,
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
    team_name: shot.teamName,
    opponent_team_name: shot.opponentTeamName,
    match_date: shot.fixture?.kickoffAt?.toISOString() ?? null,
    match_label: [shot.fixture?.homeTeam?.name, shot.fixture?.awayTeam?.name].filter(Boolean).join(" vs ") || null
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
