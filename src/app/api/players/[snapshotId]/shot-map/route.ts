import { NextResponse } from "next/server";

import { requiredSearchParam, requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { get_player_shots_for_team_window } from "@/lib/shot-maps";
import { matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

type RouteProps = {
  params: Promise<{ snapshotId: string }>;
};

export const GET = withApiHandler(async (request: Request, { params }: RouteProps) => {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const playerId = requiredStringParam((await params).snapshotId, "snapshotId");
  const url = new URL(request.url);
  const teamId = requiredSearchParam(url.searchParams, "team_id");
  const window = parseMacheteMatchWindow({
    mode: url.searchParams.get("matchWindow"),
    legacyRecentMatches: url.searchParams.get("matches")
  });

  const shots = await get_player_shots_for_team_window(prisma, playerId, teamId, window);
  return NextResponse.json({ player_id: playerId, team_id: teamId, match_window: matchWindowModeValue(window), shots });
});
