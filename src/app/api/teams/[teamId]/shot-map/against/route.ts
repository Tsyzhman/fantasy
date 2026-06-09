import { NextResponse } from "next/server";

import { requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { get_team_conceded_shots_for_window } from "@/lib/shot-maps";
import { matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

type RouteProps = {
  params: Promise<{ teamId: string }>;
};

export const GET = withApiHandler(async (request: Request, { params }: RouteProps) => {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const teamId = requiredStringParam((await params).teamId, "teamId");
  const url = new URL(request.url);
  const window = parseMacheteMatchWindow({
    mode: url.searchParams.get("matchWindow"),
    legacyRecentMatches: url.searchParams.get("matches")
  });
  const shots = await get_team_conceded_shots_for_window(prisma, teamId, window);

  return NextResponse.json({ team_id: teamId, match_window: matchWindowModeValue(window), shots });
});
