import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadSportsTrendsView } from "@/machete/sports-trends";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const contestId = url.searchParams.get("contestId")?.trim();
  if (!contestId) return jsonError("BAD_REQUEST", "contestId is required.", 400);
  const providerRoundId = url.searchParams.get("providerRoundId")?.trim() || null;
  const roundKey = url.searchParams.get("roundKey")?.trim() || null;

  const squad = await prisma.userFantasySquad.findFirst({
    where: { userId: auth.user.id, contestId },
    select: { id: true }
  });
  if (!squad) return jsonError("NOT_FOUND", "Contest is not available for this user.", 404);

  const view = await loadSportsTrendsView(prisma, { contestId, providerRoundId, roundKey });
  if (!view) return jsonError("NOT_FOUND", "Contest not found.", 404);

  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
});
