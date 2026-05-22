import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type StarterPayload = {
  leagueId?: unknown;
  season?: unknown;
  teamId?: unknown;
  playerId?: unknown;
  isStarter?: unknown;
};

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const payload = (await request.json().catch(() => null)) as StarterPayload | null;
  const leagueId = bigintPayloadValue(payload?.leagueId);
  const teamId = bigintPayloadValue(payload?.teamId);
  const playerId = bigintPayloadValue(payload?.playerId);
  const season = typeof payload?.season === "string" ? payload.season : null;

  if (!payload || !leagueId || !season || !teamId || !playerId || typeof payload.isStarter !== "boolean") {
    return NextResponse.json(
      { error: { code: "INVALID_PAYLOAD", message: "leagueId, season, teamId, playerId and boolean isStarter are required." } },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.teamPlayerSeason.update({
      where: {
        leagueId_season_teamId_playerId: {
          leagueId,
          season,
          teamId,
          playerId
        }
      },
      data: { isStarter: payload.isStarter },
      select: {
        leagueId: true,
        season: true,
        teamId: true,
        playerId: true,
        isStarter: true
      }
    });

    return NextResponse.json({
      player: {
        ...row,
        leagueId: String(row.leagueId),
        teamId: String(row.teamId),
        playerId: String(row.playerId)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: { code: "PLAYER_NOT_FOUND", message: "Team player season row not found." } }, { status: 404 });
    }

    throw error;
  }
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
