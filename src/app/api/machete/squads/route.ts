import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { readJsonObject } from "@/lib/request-json";
import { FPL_PROVIDER } from "@/lib/providers/fpl";
import {
  loadCachedFantasySquadPlayerPool,
  loadFantasySquadPlannerData,
  mergeFantasyPlannerPlayerPools,
  fantasySquadRoundIdsFromFilters,
  fantasySquadRoundShift,
  normalizeFantasySquadName,
  rolloverFantasySquadRoundPlans,
  saveFantasySquad,
  uniqueFantasySquadName
} from "@/machete/squad_planner";
import {
  countFantasySquadTransfers,
  fantasyProviderPlaceholderPlannerPlayer,
  fantasyProviderPlaceholdersFromFilters,
  fantasyTransferLimitForHorizon,
  isFantasySquadPlayerId,
  normalizeFantasyHorizon,
  fantasySquadPlanningRounds,
  validateFantasySquadForSave,
  type FantasySquadSelection,
  type FantasySquadRoundPlan,
  type FantasyProviderPlaceholder,
  type FantasyPlannerPlayer
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
  const provider = normalizeProvider(params.get("provider"));
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
  let ownedSquadFilters: unknown = null;
  if (squadId) {
    const contest = await prisma.fantasyContest.findUnique({
      where: { provider_leagueId_season: { provider, leagueId, season } },
      select: { id: true }
    });
    const ownedSquad = await prisma.userFantasySquad.findFirst({
      where: {
        id: squadId,
        userId: auth.user.id,
        provider,
        ...(contest ? { contestId: contest.id } : {}),
        leagueId,
        season
      },
      select: { id: true, filters: true }
    });
    if (!ownedSquad) {
      return jsonError("NOT_FOUND", "Squad variant not found for this league and season.", 404);
    }
    ownedSquadFilters = ownedSquad.filters;
  }
  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider, leagueId, season } },
    select: { id: true }
  });
  if (!contest) return jsonError("CONTEST_NOT_SYNCED", "The selected fantasy provider contest is not synchronized yet.", 503);
  const players = await loadCachedFantasySquadPlayerPool(prisma, auth.user.id, plannerLeague, historySettings, provider, contest.id);
  const placeholderPlayers = fantasyProviderPlaceholdersFromFilters(ownedSquadFilters, provider).map((placeholder) =>
    fantasyProviderPlaceholderPlannerPlayer(placeholder, displayName)
  );

  return NextResponse.json(
    { players: mergeFantasyPlannerPlayerPools(players, placeholderPlayers) },
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
  const provider = normalizeProvider(typeof body.provider === "string" ? body.provider : null);
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
      }, squadId, { historySettings, provider });
  if (squadId && plannerData.squad.id !== squadId) {
    return jsonError("NOT_FOUND", "Squad variant not found for this league and season.", 404);
  }
  const rules = plannerData.rules;
  const horizonRounds = normalizeFantasyHorizon(body.horizonRounds, rules.horizonOptions);
  const requestedSelections = parseSelections(body.selections);
  const parsedRoundPlans = parseRoundPlans(body.roundPlans, requestedSelections);
  const clientRoundIds = fantasySquadRoundIdsFromFilters({ roundPlanRoundIds: body.roundPlanRoundIds });
  const currentRoundIds = plannerData.rounds.map((round) => round.id);
  const plansForCurrentRound = rolloverFantasySquadRoundPlans({
    plans: parsedRoundPlans,
    shift: fantasySquadRoundShift(clientRoundIds, currentRoundIds),
    fallbackSelections: requestedSelections,
    pool: plannerData.players,
    rules
  });
  const safeRoundPlans: FantasySquadRoundPlan[] = [];
  for (const plan of plansForCurrentRound) {
    const planValidation = validateFantasySquadForSave({
      pool: plannerData.players,
      selections: plan.selections,
      rules,
      horizon: 1
    });
    if (!planValidation.ok) {
      return jsonError("BAD_REQUEST", `Round +${plan.roundOffset}: ${planValidation.error}`, 400);
    }
    safeRoundPlans.push({ ...plan, selections: planValidation.selections });
  }
  const safeSelections = safeRoundPlans[0]?.selections ?? [];
  for (let index = 1; index < safeRoundPlans.length; index += 1) {
    const transferCount = countFantasySquadTransfers(safeRoundPlans[index - 1].selections, safeRoundPlans[index].selections);
    const perRoundLimit = fantasyTransferLimitForHorizon(1, rules.transferLimitPerRound);
    if (transferCount > perRoundLimit) {
      return jsonError("BAD_REQUEST", `Round +${index}: ${transferCount} transfers planned; per-round limit is ${perRoundLimit}.`, 400);
    }
  }

  const savedSelections = squadId ? plannerData.squad.selections : [];
  const transferLimit = fantasyTransferLimitForHorizon(horizonRounds, rules.transferLimitPerRound);
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
    roundPlans: safeRoundPlans,
    roundPlanRoundIds: currentRoundIds,
    rules,
    provider,
    contestId: plannerData.contestId,
    providerPlaceholders: providerPlaceholdersForPlans(plannerData.players, safeRoundPlans, provider)
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

  const params = new URL(request.url).searchParams;
  const squadId = optionalId(params.get("squadId"));
  const provider = normalizeProvider(params.get("provider"));
  if (!squadId) return jsonError("BAD_REQUEST", "squadId is required.", 400);

  const squad = await prisma.userFantasySquad.findUnique({
    where: { id: squadId },
    select: { contestId: true, provider: true, userId: true }
  });
  if (!squad || squad.userId !== auth.user.id || squad.provider !== provider) {
    return jsonError("NOT_FOUND", "Squad variant not found.", 404);
  }

  const deleted = await prisma.userFantasySquad.deleteMany({
    where: {
      id: squadId,
      userId: auth.user.id,
      provider,
      contestId: squad.contestId
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
    const playerId = typeof record.playerId === "string" && isFantasySquadPlayerId(record.playerId) ? record.playerId : null;
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

function providerPlaceholdersForPlans(
  players: FantasyPlannerPlayer[],
  plans: FantasySquadRoundPlan[],
  provider: string
): FantasyProviderPlaceholder[] {
  const usedPlayerIds = new Set(plans.flatMap((plan) => plan.selections.map((selection) => selection.playerId)));
  return players.flatMap((player): FantasyProviderPlaceholder[] => {
    if (!player.isProviderPlaceholder || !usedPlayerIds.has(player.playerId) || !player.providerPlayerId) return [];
    return [{
      playerId: player.playerId,
      provider,
      providerPlayerId: player.providerPlayerId,
      name: player.name,
      teamId: player.teamId,
      teamName: player.teamName,
      position: player.position ?? player.positionGroup,
      price: player.price
    }];
  });
}

function parseRoundPlans(value: unknown, fallbackSelections: FantasySquadSelection[]): FantasySquadRoundPlan[] {
  const values = Array.isArray(value) ? value : [];
  return Array.from({ length: fantasySquadPlanningRounds }, (_, roundOffset) => {
    const record = values.find((item) => item && typeof item === "object" && !Array.isArray(item) && Number((item as { roundOffset?: unknown }).roundOffset) === roundOffset) as Record<string, unknown> | undefined;
    return {
      roundOffset,
      linkedToPrevious: roundOffset > 0 && record?.linkedToPrevious !== false,
      selections: record ? parseSelections(record.selections) : fallbackSelections.map((selection) => ({ ...selection }))
    };
  });
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

function normalizeProvider(value: string | null) {
  return value?.trim().toUpperCase() === FPL_PROVIDER ? FPL_PROVIDER : "SPORTS_RU";
}
