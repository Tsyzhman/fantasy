import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObjectOrNull } from "@/lib/request-json";
import { loadSportsRuAuthoritativeStarterCandidate } from "@/machete/sports_ru_player_mapping";
import { sportsRuSeasonAliases } from "@/machete/squad_planner";
import { startingXiSelectionBlockReason, type StartingXiLimitCode } from "@/machete/starting-xi-limits";
import { enqueueCurrentXiTeamsSnapshotRefresh } from "@/machete/fantasy-player-pool-refresh-queue";

export const dynamic = "force-dynamic";

const sportsRuRosterSource = "sports.ru";

type StarterPayload = {
  leagueId?: unknown;
  season?: unknown;
  teamId?: unknown;
  playerId?: unknown;
  isStarter?: unknown;
};

export const PATCH = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const payload = (await readJsonObjectOrNull(request)) as StarterPayload | null;
  const leagueId = bigintPayloadValue(payload?.leagueId);
  const teamId = bigintPayloadValue(payload?.teamId);
  const playerId = bigintPayloadValue(payload?.playerId);
  const season = typeof payload?.season === "string" ? payload.season : null;

  if (!payload || !leagueId || !season || !teamId || !playerId || typeof payload.isStarter !== "boolean") {
    return jsonError("INVALID_PAYLOAD", "leagueId, season, teamId, playerId and boolean isStarter are required.", 400);
  }
  const isStarter = payload.isStarter;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `starting-xi:${leagueId}:${season}:${teamId}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const roster = await tx.teamPlayerSeason.findMany({
        where: { leagueId, season, teamId, active: true },
        select: { playerId: true, position: true, isStarter: true, source: true }
      });
      const activeCandidate = roster.find((player) => player.playerId === playerId) ?? null;
      const persistedCandidate = activeCandidate
        ? null
        : await tx.teamPlayerSeason.findUnique({
            where: {
              leagueId_season_teamId_playerId: {
                leagueId,
                season,
                teamId,
                playerId
              }
            },
            select: { active: true, isStarter: true, position: true, source: true }
          });
      const sportsRuCandidate = activeCandidate && activeCandidate.source !== sportsRuRosterSource
        ? null
        : await loadSportsRuAuthoritativeStarterCandidate(tx, {
            leagueId,
            seasons: sportsRuSeasonAliases(season),
            teamId,
            playerId,
            contestId: (await tx.fantasyContest.findFirst({
              where: {
                provider: "SPORTS_RU",
                leagueId,
                season: { in: sportsRuSeasonAliases(season) }
              },
              orderBy: { lastSyncedAt: "desc" },
              select: { id: true }
            }))?.id ?? null
          });
      const candidate = activeCandidate?.source === sportsRuRosterSource && !sportsRuCandidate
        ? null
        : activeCandidate ?? (sportsRuCandidate
        ? {
            playerId: sportsRuCandidate.playerId,
            position: persistedCandidate?.position ?? sportsRuCandidate.position,
            isStarter: persistedCandidate?.isStarter ?? false
          }
        : null);
      if (!candidate) return null;

      const effectiveRoster = activeCandidate ? roster : [...roster, candidate];

      const limitCode = isStarter ? startingXiSelectionBlockReason(effectiveRoster, candidate) : null;
      if (limitCode) throw new StarterLimitError(limitCode);

      let changed = false;
      const changedTeamIds = new Set<bigint>();
      if (sportsRuCandidate) {
        const staleTeams = await tx.teamPlayerSeason.findMany({
          where: { leagueId, season, playerId, teamId: { not: teamId }, active: true },
          select: { teamId: true }
        });
        for (const team of staleTeams) changedTeamIds.add(team.teamId);
        const staleMemberships = await tx.teamPlayerSeason.updateMany({
          where: {
            leagueId,
            season,
            playerId,
            teamId: { not: teamId },
            active: true
          },
          data: { active: false, isStarter: false }
        });
        changed = staleMemberships.count > 0;
      }
      if (activeCandidate) {
        const update = await tx.teamPlayerSeason.updateMany({
          where: {
            leagueId,
            season,
            teamId,
            playerId,
            isStarter: !isStarter
          },
          data: { isStarter }
        });
        changed = changed || update.count > 0;
      } else if (sportsRuCandidate) {
        const now = new Date();
        changed = changed || !persistedCandidate || !persistedCandidate.active || persistedCandidate.isStarter !== isStarter;
        await tx.teamPlayerSeason.upsert({
          where: {
            leagueId_season_teamId_playerId: {
              leagueId,
              season,
              teamId,
              playerId
            }
          },
          update: {
            source: sportsRuRosterSource,
            active: true,
            isStarter,
            position: persistedCandidate?.position ?? sportsRuCandidate.position,
            lastSeenAt: now
          },
          create: {
            leagueId,
            season,
            teamId,
            playerId,
            source: sportsRuRosterSource,
            active: true,
            isStarter,
            position: sportsRuCandidate.position,
            firstSeenAt: now,
            lastSeenAt: now
          }
        });
      }

      const row = await tx.teamPlayerSeason.findUnique({
        where: {
          leagueId_season_teamId_playerId: {
            leagueId,
            season,
            teamId,
            playerId
          }
        },
        select: {
          leagueId: true,
          season: true,
          teamId: true,
          playerId: true,
          isStarter: true
        }
      });
      if (!row) return null;

      if (changed) {
        changedTeamIds.add(teamId);
        await tx.leagueSeasonTeam.update({
          where: {
            leagueId_season_teamId: {
              leagueId,
              season,
              teamId
            }
          },
          data: { startingXiChangedAt: new Date() }
        });
        if (changedTeamIds.size > 1) {
          await tx.leagueSeasonTeam.updateMany({
            where: { leagueId, season, teamId: { in: [...changedTeamIds].filter((id) => id !== teamId) } },
            data: { startingXiChangedAt: new Date() }
          });
        }
        await enqueueCurrentXiTeamsSnapshotRefresh(tx, { leagueId, season, teamIds: [...changedTeamIds] });
      }

      return { row, changed };
    });

    if (!result) return jsonError("PLAYER_NOT_FOUND", "Team player season row not found.", 404);

    return NextResponse.json({
      player: {
        ...result.row,
        leagueId: String(result.row.leagueId),
        teamId: String(result.row.teamId),
        playerId: String(result.row.playerId)
      }
    });
  } catch (error) {
    if (error instanceof StarterLimitError) {
      return jsonError(error.code, starterLimitMessage(error.code), 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("PLAYER_NOT_FOUND", "Team player season row not found.", 404);
    }

    throw error;
  }
});

class StarterLimitError extends Error {
  constructor(readonly code: StartingXiLimitCode) {
    super(code);
  }
}

function starterLimitMessage(code: StartingXiLimitCode) {
  if (code === "STARTING_XI_GOALKEEPER_LIMIT") return "The starting XI can contain only 1 goalkeeper.";
  if (code === "STARTING_XI_OUTFIELD_LIMIT") return "The starting XI can contain only 10 outfield players.";
  return "The starting XI can contain only 11 players.";
}

function bigintPayloadValue(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" && typeof value !== "number") return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
