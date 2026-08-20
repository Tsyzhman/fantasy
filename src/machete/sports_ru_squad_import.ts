import type { PrismaClient } from "@prisma/client";

import type { SportsRuPublishedSquad } from "@/lib/providers/sports-ru-fantasy";

import {
  countFantasySquadTransfers,
  createFantasySquadRoundPlans,
  fantasyProviderPlaceholderPlayerId,
  fantasyTransferLimitForHorizon,
  normalizeFantasyPosition,
  validateFantasySquadForSave,
  type FantasyPlannerPlayer,
  type FantasyProviderPlaceholder,
  type FantasySquadRoundPlan,
  type FantasySquadRules,
  type FantasySquadSelection
} from "./squad_logic";
import { sportsRuSeasonAliases } from "./squad_planner";

export type SportsRuSquadImportPreview = {
  profileId: string;
  providerSquadId: string;
  squadName: string;
  tournamentName: string;
  tourId: string;
  tourName: string;
  selections: FantasySquadSelection[];
  unmapped: FantasyProviderPlaceholder[];
};

export async function mapSportsRuPublishedSquad(
  prisma: PrismaClient,
  input: {
    profileId: string;
    contestId: string;
    leagueId: bigint;
    season: string;
    expectedSquadSize: number;
    published: SportsRuPublishedSquad;
  }
): Promise<SportsRuSquadImportPreview> {
  const published = input.published;
  const providerPlayerIds = [...new Set(published.players.map((player) => player.providerPlayerId))];
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      contestId: input.contestId,
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) },
      providerPlayerId: { in: providerPlayerIds }
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      providerPlayerId: true,
      playerId: true,
      teamId: true,
      playerName: true,
      teamName: true,
      sportsTeamName: true,
      price: true,
      position: true
    }
  });
  const priceByProviderId = new Map<string, (typeof priceRows)[number]>();
  const mappedByProviderId = new Map<string, (typeof priceRows)[number]>();
  for (const row of priceRows) {
    if (!row.providerPlayerId) continue;
    if (!priceByProviderId.has(row.providerPlayerId)) priceByProviderId.set(row.providerPlayerId, row);
    if (row.playerId && !mappedByProviderId.has(row.providerPlayerId)) mappedByProviderId.set(row.providerPlayerId, row);
  }
  if (providerPlayerIds.length !== published.players.length) {
    throw new SportsRuSquadImportError("DUPLICATE_PUBLISHED_PLAYER", "Sports.ru returned a duplicate player in the published squad.");
  }
  const orderedPlayers = [...published.players].sort((left, right) => {
    if (left.isStarter !== right.isStarter) return left.isStarter ? -1 : 1;
    if (left.isStarter) return sportsRuRoleOrder(left.role) - sportsRuRoleOrder(right.role);
    const leftGoalkeeper = left.role === "GOALKEEPER";
    const rightGoalkeeper = right.role === "GOALKEEPER";
    if (leftGoalkeeper !== rightGoalkeeper) return leftGoalkeeper ? 1 : -1;
    return (left.substitutePriority ?? 99) - (right.substitutePriority ?? 99);
  });
  const unmapped: FantasyProviderPlaceholder[] = [];
  const selections = orderedPlayers.map((player, slotIndex): FantasySquadSelection => {
    const mapped = mappedByProviderId.get(player.providerPlayerId);
    const priceRow = priceByProviderId.get(player.providerPlayerId);
    const purchasePrice = player.price ?? priceRow?.price ?? null;
    if (purchasePrice === null || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
      throw new SportsRuSquadImportError(
        "SPORTS_PLAYER_PRICE_MISSING",
        `Sports.ru did not return a valid price for ${player.name}.`
      );
    }
    let playerId: string;
    if (mapped?.playerId) {
      playerId = String(mapped.playerId);
    } else {
      const position = player.role ?? priceRow?.position ?? "";
      if (normalizeFantasyPosition(position) === "UNK") {
        throw new SportsRuSquadImportError(
          "SPORTS_PLAYER_POSITION_MISSING",
          `Sports.ru did not return a valid fantasy position for ${player.name}.`
        );
      }
      playerId = fantasyProviderPlaceholderPlayerId("SPORTS_RU", player.providerPlayerId);
      const teamName = player.teamName ?? priceRow?.sportsTeamName ?? priceRow?.teamName ?? "Sports.ru team";
      unmapped.push({
        playerId,
        provider: "SPORTS_RU",
        providerPlayerId: player.providerPlayerId,
        name: player.name || priceRow?.playerName || `Sports.ru player ${player.providerPlayerId}`,
        teamId: priceRow?.teamId ? String(priceRow.teamId) : sportsRuPlaceholderTeamId(teamName),
        teamName,
        position,
        price: purchasePrice
      });
    }
    return {
      playerId,
      isStarter: player.isStarter,
      isLocked: false,
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      slotIndex,
      purchasePrice
    };
  });
  if (published.players.length !== input.expectedSquadSize) {
    throw new SportsRuSquadImportError(
      "INCOMPLETE_PUBLISHED_SQUAD",
      `Sports.ru returned ${published.players.length}/${input.expectedSquadSize} players for the latest published tour.`
    );
  }
  return {
    profileId: input.profileId,
    providerSquadId: published.providerSquadId,
    squadName: published.squadName,
    tournamentName: published.tournamentName,
    tourId: published.tourId,
    tourName: published.tourName,
    selections,
    unmapped
  };
}

export function mergeImportedSquadWithFuturePlans(input: {
  importedSelections: FantasySquadSelection[];
  existingPlans: FantasySquadRoundPlan[];
  pool: FantasyPlannerPlayer[];
  rules: FantasySquadRules;
}) {
  const merged = createFantasySquadRoundPlans(input.importedSelections);
  const perRoundLimit = fantasyTransferLimitForHorizon(1, input.rules.transferLimitPerRound);
  for (let roundOffset = 1; roundOffset < merged.length; roundOffset += 1) {
    const existing = input.existingPlans[roundOffset];
    const previous = merged[roundOffset - 1].selections;
    if (!existing || existing.linkedToPrevious) {
      merged[roundOffset].selections = previous.map((selection) => ({ ...selection }));
      continue;
    }
    const validation = validateFantasySquadForSave({ pool: input.pool, selections: existing.selections, rules: input.rules, horizon: 1 });
    if (!validation.ok || countFantasySquadTransfers(previous, validation.selections) > perRoundLimit) {
      merged[roundOffset].selections = previous.map((selection) => ({ ...selection }));
      merged[roundOffset].linkedToPrevious = true;
      continue;
    }
    merged[roundOffset] = { roundOffset, linkedToPrevious: false, selections: validation.selections };
  }
  return merged;
}

export class SportsRuSquadImportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SportsRuSquadImportError";
  }
}

export function readSportsRuSeasonId(rules: unknown) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const value = (rules as { sportsRuSeasonId?: unknown }).sportsRuSeasonId;
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : null;
}

function sportsRuRoleOrder(role: string | null) {
  if (role === "GOALKEEPER") return 0;
  if (role === "DEFENDER") return 1;
  if (role === "MIDFIELDER") return 2;
  if (role === "FORWARD") return 3;
  return 4;
}

function sportsRuPlaceholderTeamId(teamName: string) {
  const normalized = teamName.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  return `provider-team:SPORTS_RU:${encodeURIComponent(normalized || "unknown")}`;
}
