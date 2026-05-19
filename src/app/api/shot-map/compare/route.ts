import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { get_shot_map_comparison_for_windows } from "@/lib/shot-maps";
import { parseMacheteMatchWindow } from "@/scoring/machete/match-window";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attackingTeamId = url.searchParams.get("attacking_team_id");
  const defendingTeamId = url.searchParams.get("defending_team_id");
  const attackingWindow = parseMacheteMatchWindow({
    mode: url.searchParams.get("attacking_match_window"),
    legacyRecentMatches: url.searchParams.get("attacking_matches")
  });
  const defendingWindow = parseMacheteMatchWindow({
    mode: url.searchParams.get("defending_match_window"),
    legacyRecentMatches: url.searchParams.get("defending_matches")
  });

  if (!attackingTeamId || !defendingTeamId) {
    return NextResponse.json({ error: "attacking_team_id and defending_team_id are required" }, { status: 400 });
  }

  const comparison = await get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, attackingWindow, defendingWindow);
  return NextResponse.json(comparison);
}
