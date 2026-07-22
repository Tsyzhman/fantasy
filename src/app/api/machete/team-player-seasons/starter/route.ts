import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObjectOrNull } from "@/lib/request-json";
import { startingXiSelectionBlockReason, type StartingXiLimitCode } from "@/machete/starting-xi-limits";

export const dynamic = "force-dynamic";

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
        select: { playerId: true, position: true, isStarter: true }
      });
      const candidate = roster.find((player) => player.playerId === playerId);
      if (!candidate) return null;

      const limitCode = isStarter ? startingXiSelectionBlockReason(roster, candidate) : null;
      if (limitCode) throw new StarterLimitError(limitCode);

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

      if (update.count > 0) {
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
      }

      return row;
    });

    if (!result) return jsonError("PLAYER_NOT_FOUND", "Team player season row not found.", 404);

    return NextResponse.json({
      player: {
        ...result,
        leagueId: String(result.leagueId),
        teamId: String(result.teamId),
        playerId: String(result.playerId)
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
