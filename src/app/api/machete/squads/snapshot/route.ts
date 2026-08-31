import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI,
  latestFantasyPlayerPoolSnapshot
} from "@/machete/fantasy-player-pool-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const leagueId = parseBigInt(params.get("leagueId"));
  const season = params.get("season")?.trim() ?? "";
  if (!leagueId || !season) return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);

  const contest = await prisma.fantasyContest.findUnique({
    where: {
      provider_leagueId_season: {
        provider: "SPORTS_RU",
        leagueId,
        season
      }
    },
    select: { id: true }
  });
  if (!contest) return jsonError("CONTEST_NOT_SYNCED", "The selected Sports.ru contest is not synchronized yet.", 503);

  const snapshot = await latestFantasyPlayerPoolSnapshot(prisma, {
    contestId: contest.id,
    variant: FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI
  });
  return NextResponse.json(
    {
      snapshot: snapshot
        ? {
            id: snapshot.id,
            revision: snapshot.revision,
            calculatedAt: snapshot.calculatedAt.toISOString(),
            playersCount: snapshot.playersCount
          }
        : null
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

function parseBigInt(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
