import { NextResponse } from "next/server";

import { requiredSearchParam, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { get_shot_map_comparison_for_windows } from "@/lib/shot-maps";
import { parseMacheteMatchWindow } from "@/scoring/machete/match-window";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const attackingTeamId = requiredSearchParam(url.searchParams, "attacking_team_id");
  const defendingTeamId = requiredSearchParam(url.searchParams, "defending_team_id");
  const attackingWindow = parseMacheteMatchWindow({
    mode: url.searchParams.get("attacking_match_window"),
    legacyRecentMatches: url.searchParams.get("attacking_matches")
  });
  const defendingWindow = parseMacheteMatchWindow({
    mode: url.searchParams.get("defending_match_window"),
    legacyRecentMatches: url.searchParams.get("defending_matches")
  });

  const comparison = await get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, attackingWindow, defendingWindow);
  return NextResponse.json(comparison);
});
