import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { get_player_shots_for_team_window } from "@/lib/shot-maps";
import { matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

type RouteProps = {
  params: Promise<{ snapshotId: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { snapshotId: playerId } = await params;
  const url = new URL(request.url);
  const teamId = url.searchParams.get("team_id");
  const window = parseMacheteMatchWindow({
    mode: url.searchParams.get("matchWindow"),
    legacyRecentMatches: url.searchParams.get("matches")
  });

  if (!teamId) {
    return NextResponse.json({ error: "team_id is required" }, { status: 400 });
  }

  const shots = await get_player_shots_for_team_window(prisma, playerId, teamId, window);
  return NextResponse.json({ player_id: playerId, team_id: teamId, match_window: matchWindowModeValue(window), shots });
}
