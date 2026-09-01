import { Prisma, type PrismaClient } from "@prisma/client";

import {
  FPL_BOOTSTRAP_URL,
  FPL_LEAGUE_ID,
  FPL_PROVIDER,
  FPL_SEASON,
  FplProviderError,
  FplPublicClient,
  fplChipCode,
  latestPublishedFplGameweek,
  normalizeFplEntryId,
  type FplClientOptions,
  type FplPublishedPicks
} from "@/lib/providers/fpl";
import {
  fplChipAvailabilityFromStoredDefinitions,
  fpl202627Rules,
  fplHalfForGameweek,
  nextFplTransferState,
  validateFplChipUsage,
  validateFplSquad,
  type FplChipUsage,
  type FplSquadEntry
} from "@/lib/providers/fpl-rules";
import { createFantasySquadRoundPlans, normalizeFantasyPosition, type FantasySquadRoundPlan, type FantasySquadSelection } from "./squad_logic";

export type FplSquadImportInput = {
  userId: string;
  entryId: string;
  squadId?: string | null;
  squadName?: string;
  horizonRounds?: number;
  roundPlans?: FantasySquadRoundPlan[];
  now?: Date;
  client?: FplPublicClient;
  clientOptions?: FplClientOptions;
};

export type FplSquadImportResult = {
  entryId: string;
  gameweek: number;
  contestId: string;
  snapshotId: string;
  squadId: string;
  squadName: string;
  selections: FantasySquadSelection[];
  roundPlans: FantasySquadRoundPlan[];
  activeChip: string | null;
  bankValue: number | null;
  teamValue: number | null;
  transfersMade: number;
  transferCost: number;
};

export class FplSquadImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly status = 409
  ) {
    super(message);
    this.name = "FplSquadImportError";
  }
}

export async function importPublishedFplSquad(
  prisma: PrismaClient,
  input: FplSquadImportInput
): Promise<FplSquadImportResult> {
  const entryId = normalizeFplEntryId(input.entryId);
  if (!entryId) throw new FplSquadImportError("FPL_ENTRY_ID_INVALID", "FPL entry ID must be a positive integer.", undefined, 400);
  const now = input.now ?? new Date();
  const client = input.client ?? new FplPublicClient(input.clientOptions);
  const bootstrap = await client.getBootstrap();
  const event = latestPublishedFplGameweek(bootstrap.events, now);
  if (!event) {
    throw new FplSquadImportError(
      "FPL_NO_PUBLISHED_GAMEWEEK",
      "FPL has not exposed a completed published gameweek yet; the squad was not changed.",
      undefined,
      412
    );
  }

  let published: FplPublishedPicks;
  try {
    published = await client.getPublishedPicks(entryId, event.id);
  } catch (error) {
    if (error instanceof FplProviderError) {
      throw new FplSquadImportError(
        "FPL_PUBLISHED_PICKS_UNAVAILABLE",
        `FPL published picks for GW${event.id} are unavailable (${error.reason}${error.status ? `, HTTP ${error.status}` : ""}); the squad was not changed.`,
        undefined,
        502
      );
    }
    throw error;
  }

  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
    select: { id: true }
  });
  if (!contest) throw new FplSquadImportError("FPL_PRICES_NOT_SYNCED", "FPL prices have not been synchronized yet; the squad was not changed.", undefined, 503);

  const providerPlayerIds = published.picks.map((pick) => pick.providerPlayerId);
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      contestId: contest.id,
      provider: FPL_PROVIDER,
      providerPlayerId: { in: providerPlayerIds }
    },
    select: { providerPlayerId: true, playerId: true, teamId: true, position: true, price: true }
  });
  const priceByProviderId = new Map(priceRows.flatMap((row) => row.providerPlayerId ? [[row.providerPlayerId, row] as const] : []));
  const unmapped = providerPlayerIds.filter((providerPlayerId) => {
    const row = priceByProviderId.get(providerPlayerId);
    return !row?.playerId || !row.teamId || !row.position;
  });
  if (unmapped.length > 0) {
    throw new FplSquadImportError(
      "FPL_PLAYERS_UNMAPPED",
      `${unmapped.length} FPL players are not mapped to the shared EPL roster; the squad was not changed.`,
      { providerPlayerIds: unmapped },
      409
    );
  }

  const rosterRows = await prisma.teamPlayerSeason.findMany({
    where: {
      leagueId: FPL_LEAGUE_ID,
      season: FPL_SEASON,
      active: true,
      playerId: { in: priceRows.flatMap((row) => row.playerId ? [row.playerId] : []) }
    },
    select: { playerId: true, teamId: true, position: true }
  });
  const rosterByPlayerAndTeam = new Set(rosterRows.map((row) => `${row.playerId}:${row.teamId}:${normalizeFantasyPosition(row.position)}`));
  const missingRoster = published.picks.flatMap((pick) => {
    const row = priceByProviderId.get(pick.providerPlayerId);
    if (!row?.playerId || !row.teamId || !row.position) return [pick.providerPlayerId];
    const position = normalizeFantasyPosition(row.position);
    return position !== "UNK" && !rosterByPlayerAndTeam.has(`${row.playerId}:${row.teamId}:${position}`) ? [pick.providerPlayerId] : [];
  });
  if (missingRoster.length > 0) {
    throw new FplSquadImportError(
      "FPL_PLAYERS_NOT_ACTIVE",
      `${missingRoster.length} FPL players are not active in the shared EPL roster; the squad was not changed.`,
      { providerPlayerIds: missingRoster },
      409
    );
  }

  const unknownPositionProviderIds = published.picks.flatMap((pick) => {
    const row = priceByProviderId.get(pick.providerPlayerId);
    return row?.position && normalizeFantasyPosition(row.position) === "UNK" ? [pick.providerPlayerId] : [];
  });
  if (unknownPositionProviderIds.length > 0) {
    throw new FplSquadImportError(
      "FPL_POSITION_UNMAPPED",
      `${unknownPositionProviderIds.length} FPL players have an unknown shared position; the squad was not changed.`,
      { providerPlayerIds: unknownPositionProviderIds },
      409
    );
  }

  const selections = published.picks.map((pick) => {
    const row = priceByProviderId.get(pick.providerPlayerId)!;
    return {
      playerId: String(row.playerId),
      isStarter: pick.isStarter,
      isLocked: false,
      isCaptain: pick.isCaptain,
      isViceCaptain: pick.isViceCaptain,
      slotIndex: pick.position - 1,
      purchasePrice: pick.purchasePrice ?? row.price
    } satisfies FantasySquadSelection;
  });
  if (new Set(selections.map((selection) => selection.playerId)).size !== selections.length) {
    throw new FplSquadImportError("FPL_INTERNAL_MAPPING_COLLISION", "Two FPL players resolved to the same shared player; the squad was not changed.", undefined, 409);
  }
  const entries: FplSquadEntry[] = published.picks.map((pick) => {
    const row = priceByProviderId.get(pick.providerPlayerId)!;
    const position = normalizeFantasyPosition(row.position);
    if (position === "UNK") {
      throw new FplSquadImportError(
        "FPL_POSITION_UNMAPPED",
        `FPL player ${pick.providerPlayerId} has an unknown shared position; the squad was not changed.`,
        { providerPlayerId: pick.providerPlayerId },
        409
      );
    }
    return {
      providerPlayerId: pick.providerPlayerId,
      teamId: String(row.teamId),
      position,
      price: pick.purchasePrice ?? row.price,
      isStarter: pick.isStarter
    };
  });
  const validation = validateFplSquad(entries);
  if (!validation.ok) throw new FplSquadImportError("FPL_SQUAD_INVALID", validation.violations[0] ?? "Published FPL squad violates the configured rules.", validation.violations, 409);

  const rawChipCode = published.activeChip ? fplChipCode(published.activeChip) : null;
  if (published.activeChip && !rawChipCode) throw new FplSquadImportError("FPL_UNKNOWN_CHIP", `FPL returned an unsupported chip '${published.activeChip}'; the squad was not changed.`, undefined, 409);
  const roundPlans = input.roundPlans?.length ? input.roundPlans : createFantasySquadRoundPlans(selections);

  return prisma.$transaction(async (tx) => {
    const [existingUsages, definitions] = await Promise.all([
      tx.fantasyChipUsage.findMany({
        where: { userId: input.userId, contestId: contest.id },
        select: { gameweek: true, code: true, status: true }
      }),
      tx.fantasyChipDefinition.findMany({
        where: { contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON },
        select: { code: true, half: true, rules: true }
      })
    ]);
    if (rawChipCode) {
      const half = fplHalfForGameweek(event.id);
      const definition = half ? definitions.find((item) => item.code === rawChipCode && item.half === half) : null;
      if (!definition) {
        throw new FplSquadImportError(
          "FPL_CHIP_CONTRACT_UNAVAILABLE",
          "The official FPL chip definition for the published gameweek is unavailable; the squad was not changed.",
          { gameweek: event.id, chip: rawChipCode },
          503
        );
      }
      const storedAvailability = fplChipAvailabilityFromStoredDefinitions(definitions);
      const previousUsages: FplChipUsage[] = existingUsages.flatMap((usage) => {
        const code = fplChipCode(usage.code);
        return code ? [{ gameweek: usage.gameweek, code, status: usage.status as FplChipUsage["status"] }] : [];
      });
      const chipValidation = validateFplChipUsage(
        { gameweek: event.id, code: rawChipCode, status: "OBSERVED" },
        previousUsages.filter((usage) => usage.gameweek !== event.id),
        fpl202627Rules,
        storedAvailability
      );
      if (!chipValidation.ok) throw new FplSquadImportError("FPL_CHIP_INVALID", chipValidation.violations[0] ?? "FPL chip usage is invalid.", chipValidation.violations, 409);
    }

    const previousGameweekState = await tx.fantasyUserGameweekState.findFirst({
      where: {
        userId: input.userId,
        contestId: contest.id,
        gameweek: { lt: event.id }
      },
      orderBy: { gameweek: "desc" },
      select: { bankedFreeTransfers: true }
    });
    const transferState = nextFplTransferState(
      previousGameweekState,
      published.entryHistory.eventTransfers ?? 0,
      rawChipCode === "WILDCARD" || rawChipCode === "FREE_HIT" ? rawChipCode : null
    );

    const existingSquad = input.squadId
      ? await tx.userFantasySquad.findFirst({ where: { id: input.squadId, userId: input.userId, contestId: contest.id, provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON }, select: { id: true, name: true, horizonRounds: true } })
      : await tx.userFantasySquad.findFirst({
          where: { userId: input.userId, contestId: contest.id, provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON },
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, horizonRounds: true }
        });
    if (input.squadId && !existingSquad) throw new FplSquadImportError("FPL_SQUAD_NOT_FOUND", "FPL squad does not belong to this user.", undefined, 404);
    const squadName = (existingSquad?.name ?? input.squadName?.trim()) || `FPL GW${event.id}`;
    const squad = existingSquad
      ? await tx.userFantasySquad.update({
          where: { id: existingSquad.id },
          data: { budgetLimit: fpl202627Rules.budgetLimit, bank: published.entryHistory.bank ?? fpl202627Rules.budgetLimit - validation.spent, horizonRounds: input.horizonRounds ?? existingSquad.horizonRounds, filters: { roundPlans } },
          select: { id: true, name: true, horizonRounds: true }
        })
      : await tx.userFantasySquad.create({
          data: { userId: input.userId, provider: FPL_PROVIDER, contestId: contest.id, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON, name: squadName, budgetLimit: fpl202627Rules.budgetLimit, bank: published.entryHistory.bank ?? fpl202627Rules.budgetLimit - validation.spent, horizonRounds: input.horizonRounds ?? 5, filters: { roundPlans } },
          select: { id: true, name: true, horizonRounds: true }
        });

    await tx.userFantasySquadPlayer.deleteMany({ where: { squadId: squad.id } });
    await tx.userFantasySquadPlayer.createMany({
      data: selections.map((selection) => {
        const row = priceRows.find((price) => String(price.playerId) === selection.playerId)!;
        return {
          squadId: squad.id,
          playerId: BigInt(selection.playerId),
          teamId: row.teamId,
          position: row.position,
          isStarter: selection.isStarter,
          isLocked: false,
          isCaptain: selection.isCaptain,
          isViceCaptain: selection.isViceCaptain,
          slotIndex: selection.slotIndex,
          purchasePrice: selection.purchasePrice
        };
      })
    });

    const snapshot = await tx.fantasyProviderSquadSnapshot.upsert({
      where: { userId_contestId_gameweek_providerSquadId: { userId: input.userId, contestId: contest.id, gameweek: event.id, providerSquadId: entryId } },
      update: {
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        status: "IMPORTED",
        publishedAt: event.deadlineTime,
        importedAt: now,
        playersCount: selections.length,
        mappedPlayersCount: selections.length,
        selections: selections as unknown as Prisma.InputJsonValue,
        providerPayload: published.payload as Prisma.InputJsonValue,
        unmappedPlayers: [] as Prisma.InputJsonValue,
        lastError: null
      },
      create: {
        userId: input.userId,
        contestId: contest.id,
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        gameweek: event.id,
        providerSquadId: entryId,
        status: "IMPORTED",
        publishedAt: event.deadlineTime,
        importedAt: now,
        playersCount: selections.length,
        mappedPlayersCount: selections.length,
        selections: selections as unknown as Prisma.InputJsonValue,
        providerPayload: published.payload as Prisma.InputJsonValue,
        unmappedPlayers: [] as Prisma.InputJsonValue
      },
      select: { id: true }
    });

    await tx.fantasyUserGameweekState.upsert({
      where: { userId_contestId_gameweek: { userId: input.userId, contestId: contest.id, gameweek: event.id } },
      update: {
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        bankedFreeTransfers: transferState.bankedFreeTransfers,
        transfersMade: published.entryHistory.eventTransfers ?? 0,
        transferCost: published.entryHistory.eventTransfersCost ?? 0,
        bankValue: published.entryHistory.bank,
        teamValue: published.entryHistory.value,
        points: published.entryHistory.points,
        captainProviderId: published.picks.find((pick) => pick.isCaptain)?.providerPlayerId ?? null,
        viceCaptainProviderId: published.picks.find((pick) => pick.isViceCaptain)?.providerPlayerId ?? null,
        chipCode: rawChipCode,
        chipStatus: rawChipCode ? "OBSERVED" : null,
        transfers: (published.payload.transfers ?? null) as Prisma.InputJsonValue,
        sourceSnapshotId: snapshot.id,
        observedAt: now
      },
      create: {
        userId: input.userId,
        contestId: contest.id,
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        gameweek: event.id,
        bankedFreeTransfers: transferState.bankedFreeTransfers,
        transfersMade: published.entryHistory.eventTransfers ?? 0,
        transferCost: published.entryHistory.eventTransfersCost ?? 0,
        bankValue: published.entryHistory.bank,
        teamValue: published.entryHistory.value,
        points: published.entryHistory.points,
        captainProviderId: published.picks.find((pick) => pick.isCaptain)?.providerPlayerId ?? null,
        viceCaptainProviderId: published.picks.find((pick) => pick.isViceCaptain)?.providerPlayerId ?? null,
        chipCode: rawChipCode,
        chipStatus: rawChipCode ? "OBSERVED" : null,
        transfers: (published.payload.transfers ?? null) as Prisma.InputJsonValue,
        sourceSnapshotId: snapshot.id,
        observedAt: now
      }
    });

    if (rawChipCode) {
      await tx.fantasyChipUsage.upsert({
        where: { userId_contestId_gameweek: { userId: input.userId, contestId: contest.id, gameweek: event.id } },
        update: { provider: FPL_PROVIDER, season: FPL_SEASON, code: rawChipCode, status: "OBSERVED", source: "FPL_PUBLIC_PICKS", observedAt: now, metadata: { activeChip: published.activeChip } },
        create: { userId: input.userId, contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON, gameweek: event.id, code: rawChipCode, status: "OBSERVED", source: "FPL_PUBLIC_PICKS", observedAt: now, metadata: { activeChip: published.activeChip } }
      });
    }

    await tx.userExternalProfile.update({
      where: { userId_provider: { userId: input.userId, provider: FPL_PROVIDER } },
      data: { lastImportedAt: now, lastError: null, metadata: { lastGameweek: event.id, snapshotId: snapshot.id } }
    });
    return {
      entryId,
      gameweek: event.id,
      contestId: contest.id,
      snapshotId: snapshot.id,
      squadId: squad.id,
      squadName: squad.name,
      selections,
      roundPlans,
      activeChip: rawChipCode,
      bankValue: published.entryHistory.bank,
      teamValue: published.entryHistory.value,
      transfersMade: published.entryHistory.eventTransfers ?? 0,
      transferCost: published.entryHistory.eventTransfersCost ?? 0
    } satisfies FplSquadImportResult;
  });
}
