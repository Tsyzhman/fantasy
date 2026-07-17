import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { readJsonObject } from "@/lib/request-json";
import {
  loadCachedFantasySquadPlayerPool,
  loadFantasySquadPlannerData,
  normalizeFantasySquadName,
  saveFantasySquad,
  uniqueFantasySquadName
} from "@/machete/squad_planner";
import {
  countFantasySquadTransfers,
  fantasyTransferLimitForHorizon,
  normalizeFantasyHorizon,
  validateFantasySquadForSave,
  type FantasySquadSelection
} from "@/machete/squad_logic";
import { parseFantasyHistorySettings } from "@/machete/squad-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const leagueId = parseBigInt(params.get("leagueId"));
  const season = params.get("season")?.trim() ?? "";
  const squadId = optionalId(params.get("squadId"));
  const historySettings = parseFantasyHistorySettings({
    historyScope: params.get("historyScope"),
    historyWindow: params.get("historyWindow"),
    historySeason: params.getAll("historySeason")
  });
  if (!leagueId || !season) {
    return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);
  }

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season
      }
    },
    include: {
      league: true
    }
  });
  if (!leagueSeason || !isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })) {
    return jsonError("NOT_FOUND", "League season not found.", 404);
  }

  const displayName = macheteLeagueDisplayName({
    id: String(leagueSeason.leagueId),
    name: leagueSeason.name ?? leagueSeason.league.name,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId)
  });
  const plannerLeague = {
    leagueId,
    season,
    name: leagueSeason.name ?? leagueSeason.league.name,
    displayName,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId),
    isCurrent: leagueSeason.isCurrent,
    updatedAt: leagueSeason.updatedAt
  };
  if (squadId) {
    const ownedSquad = await prisma.userFantasySquad.findFirst({
      where: {
        id: squadId,
        userId: auth.user.id,
        leagueId,
        season
      },
      select: { id: true }
    });
    if (!ownedSquad) {
      return jsonError("NOT_FOUND", "Squad variant not found for this league and season.", 404);
    }
  }
  const players = await loadCachedFantasySquadPlayerPool(prisma, auth.user.id, plannerLeague, historySettings);

  return NextResponse.json(
    { players },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const body = await readJsonObject(request);
  const leagueId = parseBigInt(body.leagueId);
  const season = typeof body.season === "string" ? body.season : "";
  const squadId = optionalId(body.squadId);
  const historySettings = parseFantasyHistorySettings({
    historyScope: body.historyScope,
    historyWindow: body.historyWindow,
    historySeason: body.historySeasons
  });
  if (!leagueId || !season) {
    return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);
  }

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season
      }
    },
    include: {
      league: true
    }
  });
  if (!leagueSeason || !isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })) {
    return jsonError("NOT_FOUND", "League season not found.", 404);
  }

  const displayName = macheteLeagueDisplayName({
    id: String(leagueSeason.leagueId),
    name: leagueSeason.name ?? leagueSeason.league.name,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId)
  });
  const plannerData = await loadFantasySquadPlannerData(prisma, userId, {
    leagueId,
    season,
    name: leagueSeason.name ?? leagueSeason.league.name,
    displayName,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId),
    isCurrent: leagueSeason.isCurrent,
    updatedAt: leagueSeason.updatedAt
  }, squadId, { historySettings });
  if (squadId && plannerData.squad.id !== squadId) {
    return jsonError("NOT_FOUND", "Squad variant not found for this league and season.", 404);
  }
  const rules = plannerData.rules;
  const horizonRounds = normalizeFantasyHorizon(body.horizonRounds, rules.horizonOptions);
  const validation = validateFantasySquadForSave({
    pool: plannerData.players,
    selections: parseSelections(body.selections),
    rules,
    horizon: horizonRounds
  });
  if (!validation.ok) {
    return jsonError("BAD_REQUEST", validation.error, 400);
  }
  const safeSelections = validation.selections;

  const savedSelections = squadId ? plannerData.squad.selections : [];
  const transferLimit = fantasyTransferLimitForHorizon(horizonRounds);
  const transferCount = countFantasySquadTransfers(savedSelections, safeSelections);
  if (savedSelections.length === rules.squadSize && transferCount > transferLimit) {
    return jsonError("BAD_REQUEST", `You made ${transferCount} transfers; limit for this forecast is ${transferLimit}.`, 400);
  }

  const requestedName = typeof body.name === "string" ? body.name : undefined;
  const normalizedName = normalizeFantasySquadName(requestedName);
  const conflictingVariant = plannerData.squads.find(
    (option) => option.id !== squadId && option.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
  );
  if (squadId && conflictingVariant) {
    return jsonError("SQUAD_NAME_CONFLICT", "Another squad variant already uses this name.", 409);
  }
  const name = squadId
    ? normalizedName
    : uniqueFantasySquadName(plannerData.squads.map((option) => option.name), normalizedName);
  const squad = await saveFantasySquad(prisma, {
    userId,
    leagueId,
    season,
    squadId,
    name,
    horizonRounds,
    selections: safeSelections,
    rules
  });

  return NextResponse.json({
    squad: {
      id: squad.id,
      name: squad.name,
      savedPlayers: safeSelections.length
    }
  });
});

export const DELETE = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const squadId = optionalId(new URL(request.url).searchParams.get("squadId"));
  if (!squadId) return jsonError("BAD_REQUEST", "squadId is required.", 400);

  const deleted = await prisma.userFantasySquad.deleteMany({
    where: {
      id: squadId,
      userId: auth.user.id
    }
  });
  if (deleted.count === 0) return jsonError("NOT_FOUND", "Squad variant not found.", 404);

  return NextResponse.json({ deletedSquadId: squadId });
});

function parseSelections(value: unknown): FantasySquadSelection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const selections: FantasySquadSelection[] = [];

  for (const item of value) {
    const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    const playerId = typeof record.playerId === "string" && /^\d+$/.test(record.playerId) ? record.playerId : null;
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    selections.push({
      playerId,
      isStarter: record.isStarter !== false,
      isLocked: record.isLocked === true,
      isCaptain: record.isCaptain === true,
      isViceCaptain: record.isViceCaptain === true,
      slotIndex: parsePositiveInt(record.slotIndex, selections.length),
      purchasePrice: numberOrNull(record.purchasePrice)
    });
  }

  return selections;
}

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parsePositiveInt(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function optionalId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 128 ? trimmed : null;
}
