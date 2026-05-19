import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { createFotMobClient } from "./client";
import { storeMacheteRawPayload } from "./raw-payloads";
import { extract_match_shots, type FotMobShotRow } from "./shots";
import type { FotMobFixtureDetails } from "./types";

type FixtureForShotSync = {
  id: string;
  providerFixtureId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export async function syncMacheteMatchShots(prisma: PrismaClient, fixture: FixtureForShotSync, details: FotMobFixtureDetails) {
  const payload = details.raw ?? details;
  const extractedShots = extract_match_shots(payload);
  if (extractedShots.length === 0) return { shotsSynced: 0 };

  const providerTeamIds = uniqueStrings(extractedShots.flatMap((shot) => [shot.team_id, shot.opponent_team_id].map(stringOrNull)));
  const providerPlayerIds = uniqueStrings(extractedShots.map((shot) => stringOrNull(shot.player_id)));

  const [teams, players] = await Promise.all([
    providerTeamIds.length
      ? prisma.macheteTeam.findMany({
          where: {
            provider: "FOTMOB",
            providerTeamId: { in: providerTeamIds }
          },
          select: { id: true, providerTeamId: true }
        })
      : [],
    providerPlayerIds.length
      ? prisma.machetePlayer.findMany({
          where: {
            provider: "FOTMOB",
            providerPlayerId: { in: providerPlayerIds }
          },
          select: { id: true, providerPlayerId: true }
        })
      : []
  ]);

  const teamIdsByProviderId = new Map(teams.map((team) => [team.providerTeamId, team.id]).filter((entry): entry is [string, string] => Boolean(entry[0])));
  const playerIdsByProviderId = new Map(players.map((player) => [player.providerPlayerId, player.id]).filter((entry): entry is [string, string] => Boolean(entry[0])));

  let shotsSynced = 0;
  for (const shot of extractedShots) {
    const providerTeamId = stringOrNull(shot.team_id);
    const providerOpponentTeamId = stringOrNull(shot.opponent_team_id);
    const providerPlayerId = stringOrNull(shot.player_id);
    const providerMatchId = stringOrNull(shot.match_id) ?? fixture.providerFixtureId ?? fixture.id;
    const dedupeKey = matchShotDedupeKey(providerMatchId, shot);

    await prisma.matchShot.upsert({
      where: {
        provider_dedupeKey: {
          provider: "FOTMOB",
          dedupeKey
        }
      },
      update: {
        ...matchShotData(shot, {
          fixtureId: fixture.id,
          providerMatchId,
          providerTeamId,
          providerOpponentTeamId,
          providerPlayerId,
          teamId: providerTeamId ? teamIdsByProviderId.get(providerTeamId) ?? null : null,
          opponentTeamId: providerOpponentTeamId ? teamIdsByProviderId.get(providerOpponentTeamId) ?? null : null,
          playerId: providerPlayerId ? playerIdsByProviderId.get(providerPlayerId) ?? null : null,
          dedupeKey
        })
      },
      create: {
        provider: "FOTMOB",
        ...matchShotData(shot, {
          fixtureId: fixture.id,
          providerMatchId,
          providerTeamId,
          providerOpponentTeamId,
          providerPlayerId,
          teamId: providerTeamId ? teamIdsByProviderId.get(providerTeamId) ?? null : null,
          opponentTeamId: providerOpponentTeamId ? teamIdsByProviderId.get(providerOpponentTeamId) ?? null : null,
          playerId: providerPlayerId ? playerIdsByProviderId.get(providerPlayerId) ?? null : null,
          dedupeKey
        })
      }
    });
    shotsSynced += 1;
  }

  return { shotsSynced };
}

export async function syncMacheteLeagueShots(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({
    where: { id: leagueId },
    select: { id: true }
  });
  if (!league) throw new Error("Machete league not found.");

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId,
      status: { not: "SEASON_AGGREGATE" },
      providerFixtureId: { not: null }
    },
    orderBy: { kickoffAt: "desc" },
    select: {
      id: true,
      providerFixtureId: true,
      homeTeamId: true,
      awayTeamId: true
    }
  });

  const client = createFotMobClient();
  let matchesChecked = 0;
  let shotsSynced = 0;

  for (const fixture of fixtures) {
    if (!fixture.providerFixtureId) continue;
    const details = await client.getFixtureDetails(fixture.providerFixtureId);
    await storeMacheteRawPayload(prisma, {
      entityType: "FIXTURE_DETAILS",
      providerEntityId: fixture.providerFixtureId,
      endpoint: "getFixtureDetails",
      payload: details
    });
    const result = await syncMacheteMatchShots(prisma, fixture, details);
    matchesChecked += 1;
    shotsSynced += result.shotsSynced;
  }

  return { matchesChecked, shotsSynced };
}

function matchShotData(
  shot: FotMobShotRow,
  ids: {
    fixtureId: string;
    providerMatchId: string;
    providerTeamId: string | null;
    providerOpponentTeamId: string | null;
    providerPlayerId: string | null;
    teamId: string | null;
    opponentTeamId: string | null;
    playerId: string | null;
    dedupeKey: string;
  }
) {
  return {
    fixtureId: ids.fixtureId,
    providerMatchId: ids.providerMatchId,
    teamId: ids.teamId,
    opponentTeamId: ids.opponentTeamId,
    providerTeamId: ids.providerTeamId,
    providerOpponentTeamId: ids.providerOpponentTeamId,
    playerId: ids.playerId,
    providerPlayerId: ids.providerPlayerId,
    playerName: shot.player_name,
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
    teamName: shot.team_name,
    opponentTeamName: shot.opponent_team_name,
    raw: shot.raw as Prisma.InputJsonValue,
    dedupeKey: ids.dedupeKey
  };
}

function matchShotDedupeKey(providerMatchId: string, shot: FotMobShotRow) {
  const source = [
    providerMatchId,
    shot.team_id,
    shot.player_id,
    shot.minute,
    shot.added_time,
    shot.x,
    shot.y,
    shot.event_type,
    stringOrNull((shot.raw.id as string | number | undefined) ?? (shot.raw.eventId as string | number | undefined))
  ].join("|");

  return createHash("sha1").update(source).digest("hex");
}

function stringOrNull(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
