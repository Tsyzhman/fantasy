import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON, normalizeFplEntryId } from "@/lib/providers/fpl";
import { readJsonObject } from "@/lib/request-json";
import { FplSquadImportError, importPublishedFplSquad } from "@/machete/fpl-squad-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (process.env.FPL_ENABLED === "false" || process.env.FPL_IMPORT_ENABLED === "false") {
    return jsonError("FPL_IMPORT_DISABLED", "FPL import is not enabled.", 404);
  }

  const body = await readJsonObject(request);
  const requestedEntryId = normalizeFplEntryId(typeof body.entryId === "string" ? body.entryId : "");
  const requestedLeagueId = body.leagueId === undefined ? FPL_LEAGUE_ID : parseBigInt(body.leagueId);
  const season = typeof body.season === "string" ? body.season.trim() : FPL_SEASON;
  if (requestedLeagueId !== FPL_LEAGUE_ID || season !== FPL_SEASON) {
    return jsonError("FPL_SCOPE_INVALID", "FPL import is scoped to CoreLeague 47 season 2026/2027.", 400);
  }
  const profile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: auth.user.id, provider: FPL_PROVIDER } },
    select: { providerUserId: true }
  });
  const entryId = requestedEntryId ?? profile?.providerUserId ?? null;
  if (!entryId || (requestedEntryId && profile?.providerUserId !== requestedEntryId)) {
    return jsonError("FPL_PROFILE_REQUIRED", "Save this FPL entry ID in profile settings before importing.", 412);
  }

  try {
    const result = await importPublishedFplSquad(prisma, {
      userId: auth.user.id,
      entryId,
      squadId: typeof body.squadId === "string" && body.squadId.trim() ? body.squadId.trim() : null,
      squadName: typeof body.squadName === "string" ? body.squadName : undefined,
      horizonRounds: Number.isInteger(Number(body.horizonRounds)) ? Number(body.horizonRounds) : undefined
    });
    return NextResponse.json({ imported: true, result });
  } catch (error) {
    if (error instanceof FplSquadImportError) {
      return NextResponse.json({ imported: false, code: error.code, message: error.message, details: error.details ?? null }, { status: error.status });
    }
    throw error;
  }
});

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
