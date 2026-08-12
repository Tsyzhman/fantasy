import type { Prisma, PrismaClient } from "@prisma/client";

import { sportsRuTournamentHruFromUrl } from "@/lib/providers/sports-ru-fantasy";

import { readSportsRuSeasonId } from "./sports_ru_squad_import";
import { sportsRuSeasonAliases } from "./squad_planner";

const sportsRuProvider = "SPORTS_RU";
const footballStarterSize = 11;

type TransferSquadPlayer = {
  playerId: bigint;
  position: string | null;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  slotIndex: number;
  player: {
    name: string;
  };
};

type TransferPrice = {
  playerId: bigint | null;
  providerPlayerId: string | null;
  playerName: string;
  position: string | null;
  season: string;
};

type TransferContest = {
  id: string;
  leagueId: bigint;
  season: string;
  name: string;
  squadSize: number;
  sourceUrl: string | null;
  rules: Prisma.JsonValue | null;
};

export type SportsRuExtensionTransferPlayer = {
  providerPlayerId: string;
  name: string;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  substitutePriority: number | null;
};

export type SportsRuExtensionTransferPlan = {
  tournamentHru: string;
  sportsRuSeasonId: string;
  leagueId: string;
  season: string;
  contestName: string;
  squadId: string;
  squadName: string;
  squadUpdatedAt: string;
  selectionStrategy: "LATEST_SAVED";
  players: SportsRuExtensionTransferPlayer[];
};

export class SportsRuExtensionTransferError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SportsRuExtensionTransferError";
  }
}

export async function loadSportsRuExtensionTransferPlan(
  prisma: PrismaClient,
  input: {
    userId: string;
    tournamentHru: string;
  }
): Promise<SportsRuExtensionTransferPlan> {
  const tournamentHru = normalizeTournamentHru(input.tournamentHru);
  if (!tournamentHru) {
    throw new SportsRuExtensionTransferError("INVALID_TOURNAMENT", "Не удалось определить турнир Sports.ru.", 400);
  }

  const contests = await prisma.fantasyContest.findMany({
    where: { provider: sportsRuProvider },
    orderBy: { lastSyncedAt: "desc" },
    select: {
      id: true,
      leagueId: true,
      season: true,
      name: true,
      squadSize: true,
      sourceUrl: true,
      rules: true
    }
  });
  const matchingContests = contests.filter(
    (candidate) => sportsRuContestTournamentHru(candidate) === tournamentHru
  );
  if (matchingContests.length === 0) {
    throw new SportsRuExtensionTransferError(
      "TOURNAMENT_NOT_SUPPORTED",
      `Турнир ${tournamentHru} ещё не подключён к fantasy.tsyzhman.ru.`,
      404
    );
  }

  const currentLeagueSeasons = await prisma.leagueSeason.findMany({
    where: { isCurrent: true },
    select: { leagueId: true, season: true }
  });
  const contest = selectCurrentSportsRuContest(matchingContests, currentLeagueSeasons);
  if (!contest) {
    throw new SportsRuExtensionTransferError(
      "TOURNAMENT_NOT_READY",
      "Текущий сезон этого турнира ещё не готов для переноса состава.",
      409
    );
  }

  const sportsRuSeasonId = readSportsRuSeasonId(contest.rules);
  if (!sportsRuSeasonId) {
    throw new SportsRuExtensionTransferError(
      "TOURNAMENT_NOT_READY",
      "Текущий сезон Sports.ru ещё не готов для переноса состава.",
      409
    );
  }

  const squad = await prisma.userFantasySquad.findFirst({
    where: {
      userId: input.userId,
      provider: sportsRuProvider,
      contestId: contest.id,
      leagueId: contest.leagueId,
      season: contest.season
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      updatedAt: true,
      players: {
        orderBy: { slotIndex: "asc" },
        select: {
          playerId: true,
          position: true,
          isStarter: true,
          isCaptain: true,
          isViceCaptain: true,
          slotIndex: true,
          player: {
            select: { name: true }
          }
        }
      }
    }
  });
  if (!squad) {
    throw new SportsRuExtensionTransferError(
      "SQUAD_NOT_FOUND",
      "Сначала сохраните состав этой лиги на fantasy.tsyzhman.ru.",
      404
    );
  }
  if (squad.players.length !== contest.squadSize) {
    throw new SportsRuExtensionTransferError(
      "SQUAD_INCOMPLETE",
      `В последнем сохранённом составе ${squad.players.length}/${contest.squadSize} игроков.`,
      409
    );
  }

  const playerIds = squad.players.map((player) => player.playerId);
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: {
      contestId: contest.id,
      provider: sportsRuProvider,
      leagueId: contest.leagueId,
      season: { in: sportsRuSeasonAliases(contest.season) },
      playerId: { in: playerIds },
      providerPlayerId: { not: null }
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      playerId: true,
      providerPlayerId: true,
      playerName: true,
      position: true,
      season: true
    }
  });
  const players = buildSportsRuExtensionTransferPlayers({
    squadPlayers: squad.players,
    prices,
    preferredSeason: contest.season,
    expectedSquadSize: contest.squadSize
  });

  return {
    tournamentHru,
    sportsRuSeasonId,
    leagueId: String(contest.leagueId),
    season: contest.season,
    contestName: contest.name,
    squadId: squad.id,
    squadName: squad.name,
    squadUpdatedAt: squad.updatedAt.toISOString(),
    selectionStrategy: "LATEST_SAVED",
    players
  };
}

export function buildSportsRuExtensionTransferPlayers(input: {
  squadPlayers: TransferSquadPlayer[];
  prices: TransferPrice[];
  preferredSeason: string;
  expectedSquadSize: number;
}) {
  const pricesByPlayerId = new Map<string, TransferPrice>();
  const orderedPrices = [...input.prices].sort((left, right) => {
    const leftPreferred = left.season === input.preferredSeason ? 1 : 0;
    const rightPreferred = right.season === input.preferredSeason ? 1 : 0;
    return rightPreferred - leftPreferred;
  });
  for (const price of orderedPrices) {
    if (!price.playerId || !price.providerPlayerId) continue;
    const playerId = String(price.playerId);
    if (!pricesByPlayerId.has(playerId)) pricesByPlayerId.set(playerId, price);
  }

  const mapped = input.squadPlayers.map((selection) => ({
    selection,
    price: pricesByPlayerId.get(String(selection.playerId)) ?? null
  }));
  const missing = mapped.filter((row) => !row.price?.providerPlayerId).map((row) => row.selection.player.name);
  if (missing.length > 0) {
    throw new SportsRuExtensionTransferError(
      "SQUAD_MAPPING_INCOMPLETE",
      `Не найдены идентификаторы Sports.ru для игроков: ${missing.join(", ")}.`,
      409
    );
  }
  if (mapped.length !== input.expectedSquadSize) {
    throw new SportsRuExtensionTransferError(
      "SQUAD_INCOMPLETE",
      `В последнем сохранённом составе ${mapped.length}/${input.expectedSquadSize} игроков.`,
      409
    );
  }

  const starters = mapped.filter((row) => row.selection.isStarter);
  const captains = mapped.filter((row) => row.selection.isCaptain);
  const viceCaptains = mapped.filter((row) => row.selection.isViceCaptain);
  if (
    starters.length !== footballStarterSize
    || captains.length !== 1
    || viceCaptains.length !== 1
    || !captains[0].selection.isStarter
    || !viceCaptains[0].selection.isStarter
    || captains[0].selection.playerId === viceCaptains[0].selection.playerId
  ) {
    throw new SportsRuExtensionTransferError(
      "SQUAD_INVALID",
      "В сохранённом составе должны быть 11 игроков основы, один капитан и другой игрок вице-капитан.",
      409
    );
  }

  const bench = mapped
    .filter((row) => !row.selection.isStarter)
    .sort((left, right) => {
      const goalkeeperOrder = Number(isGoalkeeper(left)) - Number(isGoalkeeper(right));
      return goalkeeperOrder || left.selection.slotIndex - right.selection.slotIndex;
    });
  const benchPriority = new Map(bench.map((row, index) => [String(row.selection.playerId), index + 1]));

  return mapped
    .sort((left, right) => left.selection.slotIndex - right.selection.slotIndex)
    .map(({ selection, price }): SportsRuExtensionTransferPlayer => ({
      providerPlayerId: price!.providerPlayerId!,
      name: price!.playerName || selection.player.name,
      isStarting: selection.isStarter,
      isCaptain: selection.isCaptain,
      isViceCaptain: selection.isViceCaptain,
      substitutePriority: selection.isStarter ? null : benchPriority.get(String(selection.playerId)) ?? null
    }));
}

export function sportsRuContestTournamentHru(contest: {
  sourceUrl: string | null;
  rules: Prisma.JsonValue | null;
}) {
  const ruleHru = readTournamentHruFromRules(contest.rules);
  return ruleHru ?? (contest.sourceUrl ? sportsRuTournamentHruFromUrl(contest.sourceUrl) : null);
}

export function selectCurrentSportsRuContest(
  contests: TransferContest[],
  currentLeagueSeasons: Array<{ leagueId: bigint; season: string }>
) {
  const currentKeys = new Set(
    currentLeagueSeasons.map((leagueSeason) => `${leagueSeason.leagueId}:${leagueSeason.season}`)
  );
  return contests.find((contest) => currentKeys.has(`${contest.leagueId}:${contest.season}`)) ?? null;
}

function normalizeTournamentHru(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(normalized) ? normalized : null;
}

function readTournamentHruFromRules(rules: Prisma.JsonValue | null) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const value = (rules as { tournamentHru?: unknown }).tournamentHru;
  return typeof value === "string" ? normalizeTournamentHru(value) : null;
}

function isGoalkeeper(row: { selection: TransferSquadPlayer; price: TransferPrice | null }) {
  const position = (row.price?.position || row.selection.position || "").toUpperCase();
  return position === "GK" || position === "GOALKEEPER";
}
