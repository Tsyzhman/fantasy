import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { FPL_PROVIDER } from "@/lib/providers/fpl";
import { fantasyPlayerProjectionDetails } from "@/machete/squad-player-dto";
import { parseFantasyHistorySettings } from "@/machete/squad-history";
import { loadCachedFantasySquadPlayerPool } from "@/machete/squad_planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const leagueId = parseBigInt(params.get("leagueId"));
  const playerId = parseBigInt(params.get("playerId"));
  const season = params.get("season")?.trim() ?? "";
  const provider = normalizeProvider(params.get("provider"));
  const historySettings = parseFantasyHistorySettings({
    historyScope: params.get("historyScope"),
    historyWindow: params.get("historyWindow"),
    historySeason: params.getAll("historySeason")
  });
  if (!leagueId || !playerId || !season) {
    return jsonError("BAD_REQUEST", "leagueId, season and playerId are required.", 400);
  }

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: { leagueId_season: { leagueId, season } },
    include: { league: true }
  });
  if (!leagueSeason || !isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })) {
    return jsonError("NOT_FOUND", "League season not found.", 404);
  }
  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider, leagueId, season } },
    select: { id: true }
  });
  if (!contest) return jsonError("CONTEST_NOT_SYNCED", "The selected fantasy provider contest is not synchronized yet.", 503);

  const displayName = macheteLeagueDisplayName({
    id: String(leagueSeason.leagueId),
    name: leagueSeason.name ?? leagueSeason.league.name,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId)
  });
  const players = await loadCachedFantasySquadPlayerPool(
    prisma,
    auth.user.id,
    {
      leagueId,
      season,
      name: leagueSeason.name ?? leagueSeason.league.name,
      displayName,
      country: leagueSeason.country ?? leagueSeason.league.country,
      providerLeagueId: String(leagueSeason.leagueId),
      isCurrent: leagueSeason.isCurrent,
      updatedAt: leagueSeason.updatedAt
    },
    historySettings,
    provider,
    contest.id
  );
  const player = players.find((candidate) => candidate.playerId === String(playerId));
  if (!player) return jsonError("NOT_FOUND", "Player projection details not found in this league season.", 404);

  return NextResponse.json(
    fantasyPlayerProjectionDetails(player),
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

function parseBigInt(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  try {
    const parsed = BigInt(value.trim());
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeProvider(value: string | null) {
  return value?.trim().toUpperCase() === FPL_PROVIDER ? FPL_PROVIDER : "SPORTS_RU";
}
