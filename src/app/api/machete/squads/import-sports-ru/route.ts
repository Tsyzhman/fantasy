import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { readJsonObject } from "@/lib/request-json";
import {
  mergeImportedSquadWithFuturePlans,
  SportsRuSquadImportError
} from "@/machete/sports_ru_squad_import";
import {
  loadStoredSportsRuSquadImportPreview,
  syncSportsRuSquadSnapshotOnDemand,
  type SportsRuSquadSnapshotStatus
} from "@/machete/sports_ru_squad_snapshots";
import { validateFantasySquadForSave } from "@/machete/squad_logic";
import { loadFantasySquadPlannerData, saveFantasySquad, uniqueFantasySquadName } from "@/machete/squad_planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  const leagueId = parseBigInt(body.leagueId);
  const season = typeof body.season === "string" ? body.season.trim() : "";
  const squadId = typeof body.squadId === "string" && body.squadId.trim() ? body.squadId.trim() : null;
  if (!leagueId || !season) return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: { leagueId_season: { leagueId, season } },
    include: { league: true }
  });
  if (!leagueSeason || !isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })) {
    return jsonError("NOT_FOUND", "League season not found.", 404);
  }
  const league = {
    leagueId,
    season,
    name: leagueSeason.name ?? leagueSeason.league.name,
    displayName: macheteLeagueDisplayName({
      id: String(leagueSeason.leagueId),
      name: leagueSeason.name ?? leagueSeason.league.name,
      country: leagueSeason.country ?? leagueSeason.league.country,
      providerLeagueId: String(leagueSeason.leagueId)
    }),
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId),
    isCurrent: leagueSeason.isCurrent,
    updatedAt: leagueSeason.updatedAt
  };
  const plannerData = await loadFantasySquadPlannerData(prisma, auth.user.id, league, squadId);
  if (squadId && plannerData.squad.id !== squadId) return jsonError("NOT_FOUND", "Squad variant not found.", 404);

  let snapshotStatus: SportsRuSquadSnapshotStatus | null = null;
  try {
    snapshotStatus = await syncSportsRuSquadSnapshotOnDemand(prisma, {
      userId: auth.user.id,
      leagueId,
      season,
      expectedSquadSize: plannerData.rules.squadSize
    });
  } catch (error) {
    if (error instanceof SportsRuSquadImportError) {
      if (error.code === "SPORTS_SNAPSHOT_PENDING") {
        return pendingSportsRuResponse(error, snapshotStatus);
      }
      return sportsRuImportErrorResponse(error);
    }
    throw error;
  }

  let preview: Awaited<ReturnType<typeof loadStoredSportsRuSquadImportPreview>>;
  try {
    preview = await loadStoredSportsRuSquadImportPreview(prisma, {
      userId: auth.user.id,
      leagueId,
      season,
      expectedSquadSize: plannerData.rules.squadSize
    });
  } catch (error) {
    if (error instanceof SportsRuSquadImportError) {
      if (error.code === "SPORTS_SNAPSHOT_PENDING") {
        return pendingSportsRuResponse(error, snapshotStatus);
      }
      return sportsRuImportErrorResponse(error);
    }
    throw error;
  }
  if (preview.unmapped.length > 0) {
    return NextResponse.json({
      code: "SPORTS_PLAYERS_UNMAPPED",
      message: `${preview.unmapped.length} Sports.ru players are not mapped. The squad was not changed.`,
      preview: publicPreview(preview)
    }, { status: 409 });
  }
  const validation = validateFantasySquadForSave({
    pool: plannerData.players,
    selections: preview.selections,
    rules: plannerData.rules,
    horizon: 1
  });
  if (!validation.ok) return jsonError("SPORTS_SQUAD_INVALID", validation.error, 409);

  const roundPlans = mergeImportedSquadWithFuturePlans({
    importedSelections: validation.selections,
    existingPlans: plannerData.squad.roundPlans,
    pool: plannerData.players,
    rules: plannerData.rules
  });
  const name = plannerData.squad.id
    ? plannerData.squad.name
    : uniqueFantasySquadName(plannerData.squads.map((option) => option.name), preview.squadName);
  const saved = await saveFantasySquad(prisma, {
    userId: auth.user.id,
    leagueId,
    season,
    squadId: plannerData.squad.id,
    name,
    horizonRounds: plannerData.squad.horizonRounds,
    selections: validation.selections,
    roundPlans,
    roundPlanRoundIds: plannerData.rounds.map((round) => round.id),
    rules: plannerData.rules
  });
  await prisma.userExternalProfile.update({
    where: { userId_provider: { userId: auth.user.id, provider: "SPORTS_RU" } },
    data: {
      lastImportedAt: new Date(),
      lastError: null,
      metadata: {
        providerSquadId: preview.providerSquadId,
        tournamentName: preview.tournamentName,
        tourId: preview.tourId,
        tourName: preview.tourName
      }
    }
  });
  return NextResponse.json({
    imported: true,
    squad: { id: saved.id, name: saved.name },
    preview: publicPreview(preview)
  });
});

function publicPreview(preview: Awaited<ReturnType<typeof loadStoredSportsRuSquadImportPreview>>) {
  return {
    providerSquadId: preview.providerSquadId,
    squadName: preview.squadName,
    tournamentName: preview.tournamentName,
    tourId: preview.tourId,
    tourName: preview.tourName,
    playersCount: preview.selections.length,
    unmapped: preview.unmapped
  };
}

function pendingSportsRuResponse(
  error: SportsRuSquadImportError,
  snapshot: SportsRuSquadSnapshotStatus | null
) {
  return NextResponse.json({
    imported: false,
    pending: true,
    code: error.code,
    message: error.message,
    snapshot
  }, { status: 202 });
}

function sportsRuImportErrorResponse(error: SportsRuSquadImportError) {
  const status = error.code === "SPORTS_PROFILE_REQUIRED"
    ? 412
    : error.code === "STORED_SPORTS_SQUAD_INVALID"
        ? 409
        : 502;
  return jsonError(error.code, error.message, status);
}

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
