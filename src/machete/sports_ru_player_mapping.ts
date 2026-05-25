import type { PrismaClient } from "@prisma/client";

import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";
import { normalizeName } from "@/lib/text";

import { normalizeFantasyPosition, type FantasyPositionGroup } from "./squad_logic";

type SportsRuPriceLike = {
  id: string;
  playerName: string;
  normalizedName: string;
  teamName: string;
  position: string | null;
  price: number;
  raw?: unknown;
};

type SportsRuStoredPrice = SportsRuPriceLike & {
  leagueId: bigint;
  season: string;
  playerId: bigint | null;
  teamId: bigint | null;
};

type RosterEntry = {
  playerId: bigint;
  teamId: bigint;
  position: string | null;
  player: {
    name: string;
  };
  team: {
    name: string;
  };
};

export type SportsRuPlayerMappingCandidate = {
  playerId: string;
  teamId: string;
  playerName: string;
  teamName: string;
  position: string | null;
  confidence: number;
  reason: string;
};

export type SportsRuTeamMappingRow = {
  priceId: string;
  sportsName: string;
  sportsNormalizedName: string;
  fotmobHintName: string | null;
  sportsTeamName: string;
  sportsPosition: string | null;
  price: number;
  mappedPlayerId: string | null;
  mappedPlayerName: string | null;
  mappedTeamName: string | null;
  status: string;
  confidence: number | null;
  matchedBy: string | null;
  candidates: SportsRuPlayerMappingCandidate[];
};

type SquadSelectionRef = {
  id: string;
  squadId: string;
};

type SportsRuSelectionSyncResult = {
  movedSelections: number;
  refreshedSelections: number;
  removedDuplicateSelections: number;
};

const sportsRuProvider = "SPORTS_RU";
const sportsRuPlayerEntityType = "FANTASY_PLAYER_PRICE";
const internalPlayerEntityType = "PLAYER";
const autoConfidenceThreshold = 0.78;
const displayCandidateThreshold = 0.58;

export async function autoMapSportsRuFantasyPlayers(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    onlyUnmapped?: boolean;
  }
) {
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: sportsRuProvider,
      leagueId: input.leagueId,
      season: input.season,
      ...(input.onlyUnmapped ? { playerId: null } : {})
    }
  });
  const [roster, existingMaps] = await Promise.all([
    loadLeagueRoster(prisma, input.leagueId, input.season),
    prisma.providerEntityMap.findMany({
      where: {
        provider: sportsRuProvider,
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: { in: prices.map((price) => price.id) },
        internalEntityType: internalPlayerEntityType
      }
    })
  ]);

  const mapsByPriceId = new Map(existingMaps.map((map) => [map.providerEntityId, map]));
  const rosterByPlayerId = new Map(roster.map((entry) => [String(entry.playerId), entry]));
  let matched = 0;
  let manual = 0;
  let unmatched = 0;
  let movedSelections = 0;
  let refreshedSelections = 0;
  let removedDuplicateSelections = 0;

  function addSelectionSync(result: SportsRuSelectionSyncResult) {
    movedSelections += result.movedSelections;
    refreshedSelections += result.refreshedSelections;
    removedDuplicateSelections += result.removedDuplicateSelections;
  }

  for (const price of prices) {
    const existing = mapsByPriceId.get(price.id);
    if (existing?.matchedBy === "MANUAL" && existing.internalEntityId) {
      const manualRosterEntry = rosterByPlayerId.get(existing.internalEntityId);
      if (manualRosterEntry) {
        addSelectionSync(await applyPriceRosterMapping(prisma, price, manualRosterEntry));
        manual += 1;
        continue;
      }
    }

    const candidates = buildSportsRuMappingCandidates(price, roster);
    const best = candidates[0] ?? null;
    const second = candidates[1] ?? null;
    const confident = best && best.confidence >= autoConfidenceThreshold && (!second || best.confidence - second.confidence >= 0.04);
    const matchedRosterEntry = confident ? rosterByPlayerId.get(best.playerId) ?? null : null;

    await prisma.providerEntityMap.upsert({
      where: {
        provider_providerEntityType_providerEntityId_internalEntityType: {
          provider: sportsRuProvider,
          providerEntityType: sportsRuPlayerEntityType,
          providerEntityId: price.id,
          internalEntityType: internalPlayerEntityType
        }
      },
      update: {
        internalEntityId: matchedRosterEntry ? String(matchedRosterEntry.playerId) : null,
        confidence: best?.confidence ?? 0,
        matchedBy: matchedRosterEntry ? "AUTO_NAME_POSITION" : null,
        status: matchedRosterEntry ? "MATCHED" : "UNMATCHED"
      },
      create: {
        provider: sportsRuProvider,
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: price.id,
        internalEntityType: internalPlayerEntityType,
        internalEntityId: matchedRosterEntry ? String(matchedRosterEntry.playerId) : null,
        confidence: best?.confidence ?? 0,
        matchedBy: matchedRosterEntry ? "AUTO_NAME_POSITION" : null,
        status: matchedRosterEntry ? "MATCHED" : "UNMATCHED"
      }
    });

    if (matchedRosterEntry) {
      addSelectionSync(await applyPriceRosterMapping(prisma, price, matchedRosterEntry));
      matched += 1;
    } else {
      if (price.playerId || price.teamId) {
        await clearPriceRosterMapping(prisma, price.id);
      }
      unmatched += 1;
    }
  }

  return {
    total: prices.length,
    matched,
    manual,
    unmatched,
    movedSelections,
    refreshedSelections,
    removedDuplicateSelections
  };
}

export async function loadSportsRuTeamPlayerMappings(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    teamId: bigint;
  }
): Promise<SportsRuTeamMappingRow[]> {
  const [prices, roster] = await Promise.all([
    prisma.fantasyPlayerPrice.findMany({
      where: {
        provider: sportsRuProvider,
        leagueId: input.leagueId,
        season: input.season
      },
      orderBy: [{ price: "desc" }, { playerName: "asc" }]
    }),
    loadTeamRoster(prisma, input.leagueId, input.season, input.teamId)
  ]);
  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: sportsRuProvider,
      providerEntityType: sportsRuPlayerEntityType,
      providerEntityId: { in: prices.map((price) => price.id) },
      internalEntityType: internalPlayerEntityType
    }
  });
  const mapsByPriceId = new Map(maps.map((map) => [map.providerEntityId, map]));
  const rosterByPlayerId = new Map(roster.map((entry) => [String(entry.playerId), entry]));
  const teamName = roster[0]?.team.name ?? "";

  return prices
    .map((price) => {
      const map = mapsByPriceId.get(price.id);
      const mappedPlayerId = map?.internalEntityId ?? (price.playerId ? String(price.playerId) : null);
      const mappedRosterEntry = mappedPlayerId ? rosterByPlayerId.get(mappedPlayerId) ?? null : null;
      const candidates = buildSportsRuMappingCandidates(price, roster).filter((candidate) => candidate.confidence >= displayCandidateThreshold);
      const mappedToAnotherTeam = price.teamId !== null && price.teamId !== input.teamId && !mappedRosterEntry;
      if (mappedToAnotherTeam) return null;

      const teamMatches = price.teamId === input.teamId || normalizeName(price.teamName) === normalizeName(teamName);
      const shouldShow = Boolean(mappedRosterEntry || teamMatches || candidates.length > 0);

      if (!shouldShow) return null;

      return {
        priceId: price.id,
        sportsName: price.playerName,
        sportsNormalizedName: price.normalizedName,
        fotmobHintName: readFotMobPlayerNameHint(price.raw),
        sportsTeamName: price.teamName,
        sportsPosition: price.position,
        price: price.price,
        mappedPlayerId: mappedRosterEntry ? String(mappedRosterEntry.playerId) : null,
        mappedPlayerName: mappedRosterEntry?.player.name ?? null,
        mappedTeamName: mappedRosterEntry?.team.name ?? null,
        status: map?.status ?? (mappedRosterEntry ? "MATCHED" : "UNMATCHED"),
        confidence: map?.confidence ?? null,
        matchedBy: map?.matchedBy ?? null,
        candidates
      };
    })
    .filter((row): row is SportsRuTeamMappingRow => Boolean(row))
    .sort(compareMappingRows);
}

export async function setSportsRuPlayerMapping(
  prisma: PrismaClient,
  input: {
    priceId: string;
    playerId: bigint | null;
  }
) {
  const price = await prisma.fantasyPlayerPrice.findUnique({
    where: { id: input.priceId }
  });
  if (!price) throw new Error("Sports.ru price row was not found.");

  const rosterEntry = input.playerId
    ? await prisma.teamPlayerSeason.findFirst({
        where: {
          leagueId: price.leagueId,
          season: price.season,
          playerId: input.playerId,
          active: true
        },
        include: {
          player: true,
          team: true
        }
      })
    : null;

  if (input.playerId && !rosterEntry) {
    throw new Error("FotMob roster player was not found in the same league season.");
  }

  const confidence = rosterEntry ? scoreSportsRuCandidate(price, rosterEntry).confidence : 0;
  await prisma.providerEntityMap.upsert({
    where: {
      provider_providerEntityType_providerEntityId_internalEntityType: {
        provider: sportsRuProvider,
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: price.id,
        internalEntityType: internalPlayerEntityType
      }
    },
    update: {
      internalEntityId: rosterEntry ? String(rosterEntry.playerId) : null,
      confidence,
      matchedBy: rosterEntry ? "MANUAL" : null,
      status: rosterEntry ? "MATCHED" : "UNMATCHED"
    },
    create: {
      provider: sportsRuProvider,
      providerEntityType: sportsRuPlayerEntityType,
      providerEntityId: price.id,
      internalEntityType: internalPlayerEntityType,
      internalEntityId: rosterEntry ? String(rosterEntry.playerId) : null,
      confidence,
      matchedBy: rosterEntry ? "MANUAL" : null,
      status: rosterEntry ? "MATCHED" : "UNMATCHED"
    }
  });

  if (rosterEntry) {
    const selectionSync = await applyPriceRosterMapping(prisma, price, rosterEntry);
    return {
      priceId: price.id,
      playerId: String(rosterEntry.playerId),
      teamId: String(rosterEntry.teamId),
      confidence,
      status: "MATCHED",
      matchedBy: "MANUAL",
      selectionSync
    };
  } else {
    await clearPriceRosterMapping(prisma, price.id);
  }

  return {
    priceId: price.id,
    playerId: null,
    teamId: null,
    confidence,
    status: "UNMATCHED",
    matchedBy: null,
    selectionSync: emptySelectionSync()
  };
}

export function buildSportsRuMappingCandidates(price: SportsRuPriceLike, roster: RosterEntry[]): SportsRuPlayerMappingCandidate[] {
  return roster
    .map((entry) => {
      const result = scoreSportsRuCandidate(price, entry);
      return {
        playerId: String(entry.playerId),
        teamId: String(entry.teamId),
        playerName: entry.player.name,
        teamName: entry.team.name,
        position: entry.position,
        confidence: result.confidence,
        reason: result.reason
      };
    })
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || left.playerName.localeCompare(right.playerName));
}

export function scoreSportsRuCandidate(price: SportsRuPriceLike, entry: RosterEntry) {
  const sportsName = normalizedSportsRuName(price.playerName, price.normalizedName);
  const fotmobHintName = normalizeName(readFotMobPlayerNameHint(price.raw) ?? "");
  const fotmobName = normalizeName(entry.player.name);
  const sportsNameScore = scoreNameMatch(sportsName, fotmobName);
  const fotmobHintScore = scoreNameMatch(fotmobHintName, fotmobName);
  const nameScore = Math.max(sportsNameScore, fotmobHintScore);
  const pricePosition = normalizeFantasyPosition(price.position);
  const rosterPosition = normalizeFantasyPosition(entry.position);
  const positionAdjustment = positionScoreAdjustment(pricePosition, rosterPosition);
  const teamAdjustment = teamScoreAdjustment(price.teamName, entry.team.name);
  const confidence = clamp(round(nameScore + positionAdjustment + teamAdjustment), 0, 1);
  const matchedNameSource = fotmobHintScore >= sportsNameScore && fotmobHintScore > 0 ? "fotmob hint" : "name";
  const reason = [
    nameScore >= 0.92 ? matchedNameSource : nameScore >= 0.74 ? `fuzzy ${matchedNameSource}` : `weak ${matchedNameSource}`,
    pricePosition !== "UNK" && rosterPosition !== "UNK" ? `position ${pricePosition}/${rosterPosition}` : null,
    teamAdjustment > 0 ? "team" : null
  ]
    .filter(Boolean)
    .join(", ");

  return {
    confidence,
    reason
  };
}

export function planSportsRuSelectionRemap(staleSelections: SquadSelectionRef[], targetSelections: SquadSelectionRef[]) {
  const squadsWithTarget = new Set(targetSelections.map((selection) => selection.squadId));
  const moveSelectionIds: string[] = [];
  const deleteSelectionIds: string[] = [];

  for (const selection of staleSelections) {
    if (squadsWithTarget.has(selection.squadId)) {
      deleteSelectionIds.push(selection.id);
    } else {
      moveSelectionIds.push(selection.id);
    }
  }

  return {
    moveSelectionIds,
    deleteSelectionIds
  };
}

async function loadLeagueRoster(prisma: PrismaClient, leagueId: bigint, season: string) {
  return prisma.teamPlayerSeason.findMany({
    where: {
      leagueId,
      season,
      active: true
    },
    include: {
      player: true,
      team: true
    }
  });
}

async function loadTeamRoster(prisma: PrismaClient, leagueId: bigint, season: string, teamId: bigint) {
  return prisma.teamPlayerSeason.findMany({
    where: {
      leagueId,
      season,
      teamId,
      active: true
    },
    include: {
      player: true,
      team: true
    },
    orderBy: [{ position: "asc" }, { player: { name: "asc" } }]
  });
}

async function updatePriceFromRoster(prisma: PrismaClient, priceId: string, rosterEntry: RosterEntry) {
  await prisma.fantasyPlayerPrice.update({
    where: { id: priceId },
    data: {
      playerId: rosterEntry.playerId,
      teamId: rosterEntry.teamId
    }
  });
}

async function applyPriceRosterMapping(prisma: PrismaClient, price: SportsRuStoredPrice, rosterEntry: RosterEntry) {
  await updatePriceFromRoster(prisma, price.id, rosterEntry);
  return syncSquadSelectionsForSportsRuMapping(prisma, {
    leagueId: price.leagueId,
    season: price.season,
    previousPlayerId: price.playerId,
    rosterEntry,
    sportsPosition: price.position,
    price: price.price
  });
}

async function clearPriceRosterMapping(prisma: PrismaClient, priceId: string) {
  await prisma.fantasyPlayerPrice.update({
    where: { id: priceId },
    data: {
      playerId: null,
      teamId: null
    }
  });
}

async function syncSquadSelectionsForSportsRuMapping(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    previousPlayerId: bigint | null;
    rosterEntry: RosterEntry;
    sportsPosition: string | null;
    price: number;
  }
): Promise<SportsRuSelectionSyncResult> {
  const squads = await prisma.userFantasySquad.findMany({
    where: {
      leagueId: input.leagueId,
      season: input.season
    },
    select: {
      id: true
    }
  });
  if (squads.length === 0) return emptySelectionSync();

  const squadIds = squads.map((squad) => squad.id);
  const targetPlayerId = input.rosterEntry.playerId;
  let movedSelections = 0;
  let removedDuplicateSelections = 0;
  let movedSelectionIds: string[] = [];
  const previousPlayerId = input.previousPlayerId && input.previousPlayerId !== targetPlayerId ? input.previousPlayerId : null;

  if (previousPlayerId) {
    const staleSelections = await prisma.userFantasySquadPlayer.findMany({
      where: {
        squadId: { in: squadIds },
        playerId: previousPlayerId
      },
      select: {
        id: true,
        squadId: true
      }
    });

    if (staleSelections.length > 0) {
      const targetSelections = await prisma.userFantasySquadPlayer.findMany({
        where: {
          squadId: { in: staleSelections.map((selection) => selection.squadId) },
          playerId: targetPlayerId
        },
        select: {
          id: true,
          squadId: true
        }
      });
      const remapPlan = planSportsRuSelectionRemap(staleSelections, targetSelections);
      const operations = [
        ...remapPlan.moveSelectionIds.map((id) =>
          prisma.userFantasySquadPlayer.update({
            where: { id },
            data: {
              playerId: targetPlayerId,
              teamId: input.rosterEntry.teamId,
              position: input.sportsPosition ?? input.rosterEntry.position,
              purchasePrice: input.price
            }
          })
        ),
        ...remapPlan.deleteSelectionIds.map((id) =>
          prisma.userFantasySquadPlayer.delete({
            where: { id }
          })
        )
      ];

      if (operations.length > 0) await prisma.$transaction(operations);
      movedSelectionIds = remapPlan.moveSelectionIds;
      movedSelections = remapPlan.moveSelectionIds.length;
      removedDuplicateSelections = remapPlan.deleteSelectionIds.length;
    }
  }

  const refreshed = await prisma.userFantasySquadPlayer.updateMany({
    where: {
      squadId: { in: squadIds },
      playerId: targetPlayerId,
      ...(movedSelectionIds.length > 0 ? { id: { notIn: movedSelectionIds } } : {})
    },
    data: {
      teamId: input.rosterEntry.teamId,
      position: input.sportsPosition ?? input.rosterEntry.position,
      purchasePrice: input.price
    }
  });

  return {
    movedSelections,
    refreshedSelections: refreshed.count,
    removedDuplicateSelections
  };
}

function emptySelectionSync(): SportsRuSelectionSyncResult {
  return {
    movedSelections: 0,
    refreshedSelections: 0,
    removedDuplicateSelections: 0
  };
}

function compareMappingRows(left: SportsRuTeamMappingRow, right: SportsRuTeamMappingRow) {
  const statusRank = statusSortRank(left.status) - statusSortRank(right.status);
  if (statusRank !== 0) return statusRank;
  return right.price - left.price || left.sportsName.localeCompare(right.sportsName);
}

function statusSortRank(status: string) {
  if (status === "UNMATCHED") return 0;
  if (status === "MATCHED") return 1;
  return 2;
}

function normalizedSportsRuName(playerName: string, normalizedName: string) {
  return normalizeName(normalizedName || normalizeSportsRuPlayerName(playerName));
}

function readFotMobPlayerNameHint(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as { fotmobPlayerName?: unknown }).fotmobPlayerName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scoreNameMatch(sportsName: string, fotmobName: string) {
  if (!sportsName || !fotmobName) return 0;
  if (sportsName === fotmobName) return 1;
  if (fotmobName.endsWith(` ${sportsName}`) || fotmobName.includes(` ${sportsName} `)) return sportsName.includes(" ") ? 0.94 : 0.91;
  if (sportsName.includes(" ") && fotmobName.includes(sportsName)) return 0.93;

  const sportsTokens = sportsName.split(" ").filter(Boolean);
  const fotmobTokens = fotmobName.split(" ").filter(Boolean);
  if (sportsTokens.length === 0 || fotmobTokens.length === 0) return 0;

  let best = 0;
  for (let size = 1; size <= Math.min(sportsTokens.length + 1, fotmobTokens.length); size += 1) {
    for (let index = 0; index <= fotmobTokens.length - size; index += 1) {
      const window = fotmobTokens.slice(index, index + size).join(" ");
      best = Math.max(best, similarity(sportsName, window));
    }
  }

  const lastToken = sportsTokens[sportsTokens.length - 1];
  for (const token of fotmobTokens) {
    best = Math.max(best, similarity(lastToken, token) * 0.96);
  }

  return best >= 0.68 ? best : 0;
}

function positionScoreAdjustment(pricePosition: FantasyPositionGroup, rosterPosition: FantasyPositionGroup) {
  if (pricePosition === "UNK" || rosterPosition === "UNK") return 0;
  return pricePosition === rosterPosition ? 0.05 : -0.1;
}

function teamScoreAdjustment(sportsTeamName: string, fotmobTeamName: string) {
  const sportsTeam = normalizeName(sportsTeamName);
  const fotmobTeam = normalizeName(fotmobTeamName);
  if (!sportsTeam || !fotmobTeam) return 0;
  if (sportsTeam === fotmobTeam) return 0.04;
  if (sportsTeam.includes(fotmobTeam) || fotmobTeam.includes(sportsTeam)) return 0.02;
  return -0.08;
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
