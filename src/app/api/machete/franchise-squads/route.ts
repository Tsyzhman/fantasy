import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague } from "@/lib/leagues/display";
import { franchiseSquadRevision, loadAdminFranchiseSquadSummaries } from "@/machete/admin-franchise-squads";
import { canSwitchFranchise, resolveVisibleFranchise } from "@/machete/franchise-access";
import { loadSharedLeagueOptions } from "@/machete/shared_read_model";
import { FPL_PROVIDER } from "@/lib/providers/fpl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const leagueId = parseBigInt(params.get("leagueId"));
  const season = params.get("season")?.trim() ?? "";
  const provider = normalizeProvider(params.get("provider"));
  if (!leagueId || !season) return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);

  const league = (await loadSharedLeagueOptions(prisma)).find((option) =>
    option.leagueId === leagueId && option.season === season && isFantasySquadLeague(option)
  );
  if (!league) return jsonError("NOT_FOUND", "League season not found.", 404);

  const franchise = resolveVisibleFranchise(auth.user, params.get("franchise") ?? undefined);
  if (!franchise) return NextResponse.json({ rows: [], franchise: null });

  const adminCanSwitch = canSwitchFranchise(auth.user);
  const revision = await franchiseSquadRevision(prisma, league.leagueId, league.season, franchise, { includeInactive: adminCanSwitch, provider });
  if (params.get("revisionOnly") === "1") {
    return NextResponse.json(
      { franchise, revision },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const rows = await loadAdminFranchiseSquadSummaries(prisma, league, franchise, { includeInactive: adminCanSwitch, provider });
  return NextResponse.json({
    franchise,
    revision,
    generatedAt: new Date().toISOString(),
    rows: rows.map((row) => ({
      userId: row.userId,
      userName: adminCanSwitch ? row.userName : row.userName === row.email ? "Пользователь" : row.userName,
      ...(adminCanSwitch ? { email: row.email, isActive: row.isActive } : {}),
      squadName: row.squadName,
      squadUpdatedAt: row.squadUpdatedAt?.toISOString() ?? null,
      starterCount: row.starterCount,
      captainName: row.captainName,
      fp: row.fp,
      alternativeFp: row.alternativeFp,
      alternativeBreakdown: row.alternativeBreakdown,
      foontasyFp: row.foontasyFp,
      foontasyAvailable: row.foontasyAvailable,
      alternativeIssuePlayerNames: row.alternativeIssuePlayerNames,
      previewPlayers: row.previewPlayers,
      error: row.error
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
});

function parseBigInt(value: string | null) {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function normalizeProvider(value: string | null) {
  return value?.trim().toUpperCase() === FPL_PROVIDER ? FPL_PROVIDER : "SPORTS_RU";
}
