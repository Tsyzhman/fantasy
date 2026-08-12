import type { PrismaClient } from "@prisma/client";

import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";
import { normalizeName } from "@/lib/text";

import { normalizeFantasyPosition, type FantasyPositionGroup } from "./squad_logic";

type SportsRuPriceLike = {
  id: string;
  playerName: string;
  normalizedName: string;
  teamName: string;
  fotmobPlayerName?: string | null;
  providerBirthDate?: Date | null;
  position: string | null;
  price: number;
};

type SportsRuStoredPrice = SportsRuPriceLike & {
  contestId?: string | null;
  leagueId: bigint;
  season: string;
  playerId: bigint | null;
  teamId: bigint | null;
};

type SportsRuStoredPriceWithRoster = SportsRuStoredPrice & {
  player: { id: bigint; name: string; birthDate?: Date | null } | null;
  team: { id: bigint; name: string } | null;
};

type SportsRuStarterRosterPrisma = Pick<PrismaClient, "fantasyPlayerPrice" | "providerEntityMap">;

export type SportsRuAuthoritativeStarterCandidate = {
  priceId: string;
  playerId: bigint;
  teamId: bigint;
  position: string | null;
};

type RosterEntry = {
  playerId: bigint;
  teamId: bigint;
  position: string | null;
  player: {
    name: string;
    birthDate?: Date | null;
  };
  team: {
    name: string;
  };
};

export type ActiveSeasonTeam = {
  teamId: bigint;
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
  nameConfidence: number;
  birthDateMatches: boolean;
  birthDateConflicts: boolean;
  reason: string;
};

export type SportsRuTeamMappingRow = {
  priceId: string;
  contestId?: string | null;
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

export function sportsRuDisplayNamesByPlayerId(
  rows: ReadonlyArray<Pick<SportsRuTeamMappingRow, "mappedPlayerId" | "sportsName" | "status" | "price">>
) {
  const selected = new Map<string, { name: string; price: number }>();

  for (const row of rows) {
    const playerId = row.mappedPlayerId?.trim();
    const sportsName = row.sportsName.trim();
    if (row.status !== "MATCHED" || !playerId || !sportsName) continue;

    const current = selected.get(playerId);
    if (!current || row.price > current.price) selected.set(playerId, { name: sportsName, price: row.price });
  }

  return new Map([...selected].map(([playerId, value]) => [playerId, value.name]));
}

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
const manualMappingMethod = "MANUAL";
const manualTeamOverrideMethod = "MANUAL_TEAM_OVERRIDE";
const manualTransferredOutMethod = "MANUAL_TRANSFERRED_OUT";
const autoConfidenceThreshold = 0.78;
const autoNameConfidenceThreshold = 0.91;
const autoConflictingBirthDateNameThreshold = 0.96;
const autoMatchingBirthDateNameThreshold = 0.58;
const displayCandidateThreshold = 0.58;

// Sports.ru exposes localized club names while FotMob keeps the provider's
// Latin club names. A known team must be canonicalized before player-name
// scoring; otherwise an exact player identity is rejected as a team mismatch.
const sportsRuTeamNamePairs = [
  ["АЗ Алкмар", "AZ Alkmaar"],
  ["Аякс", "Ajax"],
  ["Виллем II", "Willem II"],
  ["Гоу Эхед Иглс", "Go Ahead Eagles"],
  ["Гронинген", "FC Groningen"],
  ["Ден Хааг", "ADO Den Haag"],
  ["Зволле", "PEC Zwolle"],
  ["Камбюр", "Cambuur"],
  ["НЕК", "NEC Nijmegen"],
  ["ПСВ", "PSV Eindhoven"],
  ["Спарта", "Sparta Rotterdam"],
  ["Твенте", "FC Twente"],
  ["Телстар", "Telstar"],
  ["Утрехт", "FC Utrecht"],
  ["Фейеноорд", "Feyenoord"],
  ["Фортуна Ситтард", "Fortuna Sittard"],
  ["Херенвен", "SC Heerenveen"],
  ["Эксельсиор", "Excelsior"],
  ["Академику де Визеу", "Academico Viseu"],
  ["Алверка", "Alverca"],
  ["Арука", "Arouca"],
  ["Бенфика", "Benfica"],
  ["Брага", "Braga"],
  ["Витория Гимараэш", "Vitoria de Guimaraes"],
  ["Жил Висенте", "Gil Vicente"],
  ["Каза Пия", "Casa Pia AC"],
  ["Маритиму", "Maritimo"],
  ["Морейренсе", "Moreirense"],
  ["Насьонал", "Nacional"],
  ["Порту", "FC Porto"],
  ["Риу Аве", "Rio Ave"],
  ["Санта-Клара", "Santa Clara"],
  ["Спортинг", "Sporting CP"],
  ["Фамаликан", "Famalicao"],
  ["Эшторил", "Estoril"],
  ["Эштрела", "Estrela da Amadora"],
  ["Бернли", "Burnley"],
  ["Бирмингем", "Birmingham City"],
  ["Блэкберн", "Blackburn Rovers"],
  ["Болтон", "Bolton Wanderers"],
  ["Бристоль Сити", "Bristol City"],
  ["Вест Бромвич", "West Bromwich Albion"],
  ["Вест Хэм", "West Ham United"],
  ["Вулверхэмптон", "Wolverhampton Wanderers"],
  ["Дерби Каунти", "Derby County"],
  ["КПР", "Queens Park Rangers"],
  ["Кардифф", "Cardiff City"],
  ["Линкольн Сити", "Lincoln City"],
  ["Мидлсбро", "Middlesbrough"],
  ["Миллуолл", "Millwall"],
  ["Норвич", "Norwich City"],
  ["Портсмут", "Portsmouth"],
  ["Престон", "Preston North End"],
  ["Рексхэм", "Wrexham"],
  ["Саутгемптон", "Southampton"],
  ["Сток Сити", "Stoke City"],
  ["Суонси", "Swansea City"],
  ["Уотфорд", "Watford"],
  ["Чарльтон", "Charlton Athletic"],
  ["Шеффилд Юнайтед", "Sheffield United"],
  ["Аланьяспор", "Alanyaspor"],
  ["Амед", "Amed Sportif"],
  ["Бешикташ", "Beşiktaş"],
  ["Газиантеп", "Gaziantep FK"],
  ["Галатасарай", "Galatasaray"],
  ["Гезтепе", "Göztepe"],
  ["Генчлербирлиги", "Gençlerbirliği"],
  ["Еюпспор", "Eyüpspor"],
  ["Истанбул", "Başakşehir"],
  ["Касымпаша", "Kasımpaşa"],
  ["Коджаелиспор", "Kocaelispor"],
  ["Коньяспор", "Konyaspor"],
  ["Ризеспор", "Rizespor"],
  ["Самсунспор", "Samsunspor"],
  ["Трабзонспор", "Trabzonspor"],
  ["Фенербахче", "Fenerbahçe"],
  ["Чорум", "Çorum FK"],
  ["Эрзурумспор", "Erzurumspor FK"],
  ["Алавес", "Deportivo Alaves"],
  ["Атлетик", "Athletic Club"],
  ["Атлетико", "Atletico Madrid"],
  ["Барселона", "Barcelona"],
  ["Бетис", "Real Betis"],
  ["Валенсия", "Valencia"],
  ["Вильярреал", "Villarreal"],
  ["Депортиво", "Deportivo A Coruña"],
  ["Леванте", "Levante"],
  ["Малага", "Malaga"],
  ["Осасуна", "Osasuna"],
  ["Райо Вальекано", "Rayo Vallecano"],
  ["Расинг", "Racing Santander"],
  ["Реал Мадрид", "Real Madrid"],
  ["Реал Сосьедад", "Real Sociedad"],
  ["Севилья", "Sevilla"],
  ["Сельта", "Celta Vigo"],
  ["Хетафе", "Getafe"],
  ["Эльче", "Elche"],
  ["Эспаньол", "Espanyol"]
] as const;
const sportsRuCanonicalTeamNames = new Map<string, string>();
for (const [sportsName, fotmobName] of sportsRuTeamNamePairs) {
  const canonicalName = normalizeSportsRuPlayerName(fotmobName);
  sportsRuCanonicalTeamNames.set(normalizeSportsRuPlayerName(sportsName), canonicalName);
  sportsRuCanonicalTeamNames.set(canonicalName, canonicalName);
}

export async function autoMapSportsRuFantasyPlayers(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    contestId?: string | null;
    onlyUnmapped?: boolean;
  }
) {
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: sportsRuProvider,
      ...(input.contestId ? { contestId: input.contestId } : {}),
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
        ...(input.contestId ? { contestId: input.contestId } : {}),
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: { in: prices.map((price) => price.id) },
        internalEntityType: internalPlayerEntityType
      }
    })
  ]);

  const mapsByPriceId = new Map(existingMaps.map((map) => [map.providerEntityId, map]));
  const rosterByPlayerId = new Map(roster.map((entry) => [String(entry.playerId), entry]));
  const manualPlayerIds = [...new Set(existingMaps
    .filter((map) => isManualPlayerMapping(map.matchedBy) && map.internalEntityId)
    .map((map) => BigInt(map.internalEntityId!)))];
  const [manualPlayers, activeSeasonTeams] = await Promise.all([
    prisma.corePlayer.findMany({ where: { id: { in: manualPlayerIds } }, select: { id: true, name: true, birthDate: true } }),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: input.leagueId, season: input.season, active: true },
      select: { teamId: true, team: { select: { name: true } } }
    })
  ]);
  const manualPlayerById = new Map(manualPlayers.map((player) => [String(player.id), player]));
  const manualPlayerIdSet = new Set(manualPlayerById.keys());
  const activeSeasonTeamIdSet = new Set(activeSeasonTeams.map((team) => String(team.teamId)));
  const activeSeasonTeamById = new Map(activeSeasonTeams.map((team) => [String(team.teamId), team]));
  const authoritativeTeamByPriceId = new Map(
    prices.flatMap((price) => {
      const team = resolveSportsRuSeasonTeam(price.teamName, activeSeasonTeams);
      return team ? [[price.id, team] as const] : [];
    })
  );
  const claimedPlayerIds = new Set<string>();
  let matched = 0;
  let manual = 0;
  let excluded = 0;
  let unmatched = 0;
  let movedSelections = 0;
  let refreshedSelections = 0;
  let removedDuplicateSelections = 0;

  function addSelectionSync(result: SportsRuSelectionSyncResult) {
    movedSelections += result.movedSelections;
    refreshedSelections += result.refreshedSelections;
    removedDuplicateSelections += result.removedDuplicateSelections;
  }

  const candidatesByPriceId = new Map(prices.map((price) => [
    price.id,
    buildSportsRuMappingCandidates(price, roster, authoritativeTeamByPriceId.get(price.id)?.teamId ?? null)
  ]));
  const orderedPrices = [...prices].sort((left, right) => {
    const leftManual = isManualMapping(mapsByPriceId.get(left.id)?.matchedBy) ? 1 : 0;
    const rightManual = isManualMapping(mapsByPriceId.get(right.id)?.matchedBy) ? 1 : 0;
    const leftConfidence = candidatesByPriceId.get(left.id)?.[0]?.confidence ?? 0;
    const rightConfidence = candidatesByPriceId.get(right.id)?.[0]?.confidence ?? 0;
    return rightManual - leftManual || rightConfidence - leftConfidence || right.price - left.price || left.playerName.localeCompare(right.playerName);
  });

  for (const price of orderedPrices) {
    const existing = mapsByPriceId.get(price.id);
    if (existing?.matchedBy === manualTransferredOutMethod) {
      if (price.playerId || price.teamId) await clearPriceRosterMapping(prisma, price.id);
      excluded += 1;
      continue;
    }
    if (isManualPlayerMapping(existing?.matchedBy) && existing?.internalEntityId) {
      const authoritativeTeam = authoritativeTeamByPriceId.get(price.id) ?? null;
      const manualRosterEntry = findManualRosterEntry(roster, existing.internalEntityId, null);
      const manualPlayer = manualPlayerById.get(existing.internalEntityId) ?? null;
      const lockedTeam = price.teamId ? activeSeasonTeamById.get(String(price.teamId)) ?? null : null;
      if (
        existing.matchedBy === manualTeamOverrideMethod
        && lockedTeam
        && manualPlayer
        && shouldRetainManualOverride({
          pricePlayerId: price.playerId,
          priceTeamId: price.teamId,
          mappedPlayerId: existing.internalEntityId,
          existingPlayerIds: manualPlayerIdSet,
          activeTeamIds: activeSeasonTeamIdSet
        })
      ) {
        const targetRosterEntry: RosterEntry = {
          playerId: manualPlayer.id,
          teamId: lockedTeam.teamId,
          position: manualRosterEntry?.position ?? price.position,
          player: manualRosterEntry?.player ?? manualPlayer,
          team: lockedTeam.team
        };
        claimedPlayerIds.add(String(targetRosterEntry.playerId));
        addSelectionSync(await applyPriceRosterMapping(prisma, price, targetRosterEntry, input.contestId));
        manual += 1;
        continue;
      }
      if (authoritativeTeam && manualPlayer) {
        const targetRosterEntry: RosterEntry = {
          playerId: manualPlayer.id,
          teamId: authoritativeTeam.teamId,
          position: manualRosterEntry?.position ?? price.position,
          player: manualRosterEntry?.player ?? manualPlayer,
          team: authoritativeTeam.team
        };
        claimedPlayerIds.add(String(targetRosterEntry.playerId));
        addSelectionSync(await applyPriceRosterMapping(prisma, price, targetRosterEntry, input.contestId));
        manual += 1;
        continue;
      }
      const manualTeamMatches = manualRosterEntry && teamScoreAdjustment(price.teamName, manualRosterEntry.team.name) >= 0;
      if (manualRosterEntry && manualTeamMatches) {
        claimedPlayerIds.add(String(manualRosterEntry.playerId));
        addSelectionSync(await applyPriceRosterMapping(prisma, price, manualRosterEntry, input.contestId));
        manual += 1;
        continue;
      }
      // A verified admin override may legitimately lead a lagging FotMob team
      // roster (new transfers are the common case). Keep it while both the
      // player and selected league-season team still exist.
      if (shouldRetainManualOverride({
        pricePlayerId: price.playerId,
        priceTeamId: price.teamId,
        mappedPlayerId: existing.internalEntityId,
        existingPlayerIds: manualPlayerIdSet,
        activeTeamIds: activeSeasonTeamIdSet
      })) {
        manual += 1;
        continue;
      }
    }

    const candidates = (candidatesByPriceId.get(price.id) ?? []).filter((candidate) => !claimedPlayerIds.has(candidate.playerId));
    const best = candidates[0] ?? null;
    const second = candidates[1] ?? null;
    const confident = isSafeAutomaticSportsRuCandidate(best, second);
    const baseRosterEntry = confident ? rosterByPlayerId.get(best.playerId) ?? null : null;
    const authoritativeTeam = authoritativeTeamByPriceId.get(price.id) ?? null;
    const matchedRosterEntry = baseRosterEntry && authoritativeTeam
      ? {
          ...baseRosterEntry,
          teamId: authoritativeTeam.teamId,
          team: authoritativeTeam.team
        }
      : baseRosterEntry;

    await prisma.providerEntityMap.upsert({
      where: {
        provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
          provider: sportsRuProvider,
          providerSeason: price.season,
          providerEntityType: sportsRuPlayerEntityType,
          providerEntityId: price.id,
          internalEntityType: internalPlayerEntityType
        }
      },
      update: {
        contestId: input.contestId ?? undefined,
        internalEntityId: matchedRosterEntry ? String(matchedRosterEntry.playerId) : null,
        confidence: best?.confidence ?? 0,
        matchedBy: matchedRosterEntry ? "AUTO_NAME_POSITION" : null,
        status: matchedRosterEntry ? "MATCHED" : "UNMATCHED"
      },
      create: {
        provider: sportsRuProvider,
        contestId: input.contestId ?? undefined,
        providerSeason: price.season,
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
      claimedPlayerIds.add(String(matchedRosterEntry.playerId));
      addSelectionSync(await applyPriceRosterMapping(prisma, price, matchedRosterEntry, input.contestId));
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
    excluded,
    unmatched,
    movedSelections,
    refreshedSelections,
    removedDuplicateSelections
  };
}

export function shouldRetainManualOverride(input: {
  pricePlayerId: bigint | null;
  priceTeamId: bigint | null;
  mappedPlayerId: string;
  existingPlayerIds: ReadonlySet<string>;
  activeTeamIds: ReadonlySet<string>;
}) {
  return Boolean(
    input.pricePlayerId &&
    String(input.pricePlayerId) === input.mappedPlayerId &&
    input.priceTeamId &&
    input.existingPlayerIds.has(input.mappedPlayerId) &&
    input.activeTeamIds.has(String(input.priceTeamId))
  );
}

export async function loadSportsRuTeamPlayerMappings(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
    teamId: bigint;
    contestId?: string | null;
  }
): Promise<SportsRuTeamMappingRow[]> {
  if (input.contestId === null) return [];
  const [prices, roster] = await Promise.all([
    prisma.fantasyPlayerPrice.findMany({
      where: {
        provider: sportsRuProvider,
        ...(input.contestId ? { contestId: input.contestId } : {}),
        leagueId: input.leagueId,
        season: input.season
      },
      include: {
        player: true,
        team: true
      },
      orderBy: [{ price: "desc" }, { playerName: "asc" }]
    }),
    loadTeamRoster(prisma, input.leagueId, input.season, input.teamId)
  ]);
  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: sportsRuProvider,
      ...(input.contestId ? { contestId: input.contestId } : {}),
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
      const mappedPlayerId = map?.status === "MATCHED" ? map.internalEntityId : null;
      const authoritativeRosterEntry = mappedPlayerId
        ? authoritativePriceRosterEntry(price, mappedPlayerId, input.teamId)
        : null;
      const mappedRosterEntry = authoritativeRosterEntry
        ? rosterByPlayerId.get(String(authoritativeRosterEntry.playerId)) ?? authoritativeRosterEntry
        : null;
      const candidates = buildSportsRuMappingCandidates(price, roster).filter((candidate) => candidate.confidence >= displayCandidateThreshold);
      const mappedToAnotherTeam = price.teamId !== null && price.teamId !== input.teamId && !mappedRosterEntry;
      if (mappedToAnotherTeam) return null;

      const teamMatches = price.teamId === input.teamId || normalizeName(price.teamName) === normalizeName(teamName);
      const shouldShow = Boolean(mappedRosterEntry || teamMatches || candidates.length > 0);

      if (!shouldShow) return null;

      return {
        priceId: price.id,
        contestId: price.contestId ?? input.contestId ?? null,
        sportsName: price.playerName,
        sportsNormalizedName: price.normalizedName,
        fotmobHintName: price.fotmobPlayerName ?? null,
        sportsTeamName: price.teamName,
        sportsPosition: price.position,
        price: price.price,
        mappedPlayerId: mappedRosterEntry ? String(mappedRosterEntry.playerId) : null,
        mappedPlayerName: mappedRosterEntry?.player.name ?? null,
        mappedTeamName: mappedRosterEntry?.team.name ?? null,
        status: mappedRosterEntry ? "MATCHED" : map?.status === "EXCLUDED" ? "EXCLUDED" : "UNMATCHED",
        confidence: map?.confidence ?? null,
        matchedBy: map?.matchedBy ?? null,
        candidates
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort(compareMappingRows);
}

export async function loadSportsRuAuthoritativeStarterCandidate(
  prisma: SportsRuStarterRosterPrisma,
  input: {
    leagueId: bigint;
    seasons: string[];
    teamId: bigint;
    playerId: bigint;
    contestId?: string | null;
  }
): Promise<SportsRuAuthoritativeStarterCandidate | null> {
  if (input.contestId === null) return null;
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: sportsRuProvider,
      ...(input.contestId ? { contestId: input.contestId } : {}),
      leagueId: input.leagueId,
      season: { in: input.seasons },
      teamId: input.teamId,
      playerId: input.playerId
    },
    include: {
      player: true,
      team: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (prices.length === 0) return null;

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: sportsRuProvider,
      ...(input.contestId ? { contestId: input.contestId } : {}),
      providerEntityType: sportsRuPlayerEntityType,
      providerEntityId: { in: prices.map((price) => price.id) },
      internalEntityType: internalPlayerEntityType,
      internalEntityId: String(input.playerId),
      status: "MATCHED"
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });
  const verifiedPriceIds = new Set(
    maps
      .filter((map) => map.internalEntityId === String(input.playerId))
      .map((map) => map.providerEntityId)
  );

  for (const price of prices) {
    if (!verifiedPriceIds.has(price.id)) continue;
    const entry = authoritativePriceRosterEntry(price, String(input.playerId), input.teamId);
    if (!entry) continue;
    return {
      priceId: price.id,
      playerId: entry.playerId,
      teamId: entry.teamId,
      position: entry.position
    };
  }

  return null;
}

export async function setSportsRuPlayerMapping(
  prisma: PrismaClient,
  input: {
    priceId: string;
    playerId: bigint | null;
    teamId?: bigint | null;
    lockTeam?: boolean;
    contestId: string;
  }
) {
  if (input.lockTeam && (!input.playerId || !input.teamId)) {
    throw new Error("A locked Sports.ru team override requires both playerId and teamId.");
  }
  const price = await prisma.fantasyPlayerPrice.findUnique({
    where: { id: input.priceId }
  });
  if (!price) throw new Error("Sports.ru price row was not found.");
  if (price.provider !== sportsRuProvider) {
    throw new Error("The selected price row does not belong to Sports.ru.");
  }
  if (price.contestId !== input.contestId) {
    throw new Error("Sports.ru price row does not belong to the selected fantasy contest.");
  }

  let rosterEntry: RosterEntry | null = input.playerId
    ? await prisma.teamPlayerSeason.findFirst({
        where: {
          leagueId: price.leagueId,
          season: price.season,
          playerId: input.playerId,
          ...(input.teamId ? { teamId: input.teamId } : {}),
          active: true
        },
        include: {
          player: true,
          team: true
        }
      })
    : null;

  if (input.playerId && !rosterEntry) {
    if (!input.teamId) throw new Error("FotMob roster player was not found in the same league season.");
    const [player, seasonTeam] = await Promise.all([
      prisma.corePlayer.findUnique({ where: { id: input.playerId } }),
      prisma.leagueSeasonTeam.findFirst({
        where: { leagueId: price.leagueId, season: price.season, teamId: input.teamId, active: true },
        include: { team: true }
      })
    ]);
    if (!player) throw new Error("FotMob player was not found in the core player catalog.");
    if (!seasonTeam) throw new Error("Target team was not found in the same active league season.");
    rosterEntry = {
      playerId: player.id,
      teamId: seasonTeam.teamId,
      position: price.position,
      player,
      team: seasonTeam.team
    };
  }

  const confidence = rosterEntry ? scoreSportsRuCandidate(price, rosterEntry).confidence : 0;
  const matchedBy = rosterEntry
    ? input.lockTeam ? manualTeamOverrideMethod : manualMappingMethod
    : null;
  await prisma.providerEntityMap.upsert({
    where: {
      provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
        provider: sportsRuProvider,
        providerSeason: price.season,
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: price.id,
        internalEntityType: internalPlayerEntityType
      }
    },
    update: {
      contestId: price.contestId ?? undefined,
      internalEntityId: rosterEntry ? String(rosterEntry.playerId) : null,
      confidence,
      matchedBy,
      status: rosterEntry ? "MATCHED" : "UNMATCHED"
    },
    create: {
      provider: sportsRuProvider,
      contestId: price.contestId ?? undefined,
      providerSeason: price.season,
      providerEntityType: sportsRuPlayerEntityType,
      providerEntityId: price.id,
      internalEntityType: internalPlayerEntityType,
      internalEntityId: rosterEntry ? String(rosterEntry.playerId) : null,
      confidence,
      matchedBy,
      status: rosterEntry ? "MATCHED" : "UNMATCHED"
    }
  });

  if (rosterEntry) {
    const selectionSync = await applyPriceRosterMapping(prisma, price, rosterEntry, input.contestId);
    return {
      priceId: price.id,
      playerId: String(rosterEntry.playerId),
      teamId: String(rosterEntry.teamId),
      confidence,
      status: "MATCHED",
      matchedBy,
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

export async function excludeTransferredSportsRuPlayer(
  prisma: PrismaClient,
  input: {
    priceId: string;
    contestId: string;
  }
) {
  const price = await prisma.fantasyPlayerPrice.findUnique({ where: { id: input.priceId } });
  if (!price) throw new Error("Sports.ru price row was not found.");
  if (price.provider !== sportsRuProvider) {
    throw new Error("The selected price row does not belong to Sports.ru.");
  }
  if (price.contestId !== input.contestId) {
    throw new Error("Sports.ru price row does not belong to the selected fantasy contest.");
  }

  await prisma.providerEntityMap.upsert({
    where: {
      provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
        provider: sportsRuProvider,
        providerSeason: price.season,
        providerEntityType: sportsRuPlayerEntityType,
        providerEntityId: price.id,
        internalEntityType: internalPlayerEntityType
      }
    },
    update: {
      contestId: price.contestId ?? undefined,
      internalEntityId: null,
      confidence: 1,
      matchedBy: manualTransferredOutMethod,
      status: "EXCLUDED"
    },
    create: {
      provider: sportsRuProvider,
      contestId: price.contestId ?? undefined,
      providerSeason: price.season,
      providerEntityType: sportsRuPlayerEntityType,
      providerEntityId: price.id,
      internalEntityType: internalPlayerEntityType,
      internalEntityId: null,
      confidence: 1,
      matchedBy: manualTransferredOutMethod,
      status: "EXCLUDED"
    }
  });
  await clearPriceRosterMapping(prisma, price.id);

  return {
    priceId: price.id,
    playerId: null,
    teamId: null,
    confidence: 1,
    status: "EXCLUDED",
    matchedBy: manualTransferredOutMethod,
    selectionSync: emptySelectionSync()
  };
}

function isManualPlayerMapping(matchedBy: string | null | undefined) {
  return matchedBy === manualMappingMethod || matchedBy === manualTeamOverrideMethod;
}

function isManualMapping(matchedBy: string | null | undefined) {
  return isManualPlayerMapping(matchedBy) || matchedBy === manualTransferredOutMethod;
}

export function findManualRosterEntry(roster: RosterEntry[], playerId: string, teamId: bigint | null) {
  if (teamId) return roster.find((entry) => String(entry.playerId) === playerId && entry.teamId === teamId);
  return roster.find((entry) => String(entry.playerId) === playerId);
}

export function buildSportsRuMappingCandidates(
  price: SportsRuPriceLike,
  roster: RosterEntry[],
  authoritativeTeamId: bigint | null = null
): SportsRuPlayerMappingCandidate[] {
  return roster
    .map((entry) => {
      const result = scoreSportsRuCandidate(price, entry, authoritativeTeamId);
      return {
        playerId: String(entry.playerId),
        teamId: String(entry.teamId),
        playerName: entry.player.name,
        teamName: entry.team.name,
        position: entry.position,
        confidence: result.confidence,
        nameConfidence: result.nameConfidence,
        birthDateMatches: result.birthDateMatches,
        birthDateConflicts: result.birthDateConflicts,
        reason: result.reason
      };
    })
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || left.playerName.localeCompare(right.playerName));
}

export function scoreSportsRuCandidate(
  price: SportsRuPriceLike,
  entry: RosterEntry,
  authoritativeTeamId: bigint | null = null
) {
  const sportsName = normalizedSportsRuName(price.playerName, price.normalizedName);
  const fotmobHintName = normalizeName(price.fotmobPlayerName ?? "");
  const fotmobName = normalizeName(entry.player.name);
  const sportsNameScore = scoreNameMatch(sportsName, fotmobName);
  const fotmobHintScore = scoreNameMatch(fotmobHintName, fotmobName);
  const birthDateMatches = Boolean(
    price.providerBirthDate
    && entry.player.birthDate
    && dateOnly(price.providerBirthDate) === dateOnly(entry.player.birthDate)
  );
  const rawNameScore = Math.max(sportsNameScore, fotmobHintScore);
  const birthDateConflicts = Boolean(price.providerBirthDate && entry.player.birthDate && !birthDateMatches);
  if (birthDateConflicts && rawNameScore < autoConflictingBirthDateNameThreshold) {
    return {
      confidence: 0,
      nameConfidence: rawNameScore,
      birthDateMatches,
      birthDateConflicts,
      reason: "birth date mismatch"
    };
  }
  const nameScore = rawNameScore || (birthDateMatches ? 0.7 : 0);
  if (nameScore === 0) {
    return {
      confidence: 0,
      nameConfidence: rawNameScore,
      birthDateMatches,
      birthDateConflicts,
      reason: "name mismatch"
    };
  }
  const pricePosition = normalizeFantasyPosition(price.position);
  const rosterPosition = normalizeFantasyPosition(entry.position);
  const positionAdjustment = positionScoreAdjustment(pricePosition, rosterPosition, entry.position);
  const teamAdjustment = authoritativeTeamId
    ? entry.teamId === authoritativeTeamId ? 0.04 : 0
    : teamScoreAdjustment(price.teamName, entry.team.name);
  if (teamAdjustment < 0) {
    return {
      confidence: 0,
      nameConfidence: rawNameScore,
      birthDateMatches,
      birthDateConflicts,
      reason: "team mismatch"
    };
  }
  const birthDateAdjustment = birthDateMatches ? 0.12 : 0;
  const confidence = clamp(round(nameScore + positionAdjustment + teamAdjustment + birthDateAdjustment), 0, 1);
  const matchedNameSource = fotmobHintScore >= sportsNameScore && fotmobHintScore > 0 ? "fotmob hint" : "name";
  const reason = [
    nameScore >= 0.92 ? matchedNameSource : nameScore >= 0.74 ? `fuzzy ${matchedNameSource}` : `weak ${matchedNameSource}`,
    pricePosition !== "UNK" && rosterPosition !== "UNK" ? `position ${pricePosition}/${rosterPosition}` : null,
    teamAdjustment > 0 ? "team" : null,
    birthDateMatches ? "birth date" : null,
    birthDateConflicts ? "provider birth date conflict" : null
  ]
    .filter(Boolean)
    .join(", ");

  return {
    confidence,
    nameConfidence: rawNameScore,
    birthDateMatches,
    birthDateConflicts,
    reason
  };
}

export function isSafeAutomaticSportsRuCandidate(
  best: SportsRuPlayerMappingCandidate | null | undefined,
  second: SportsRuPlayerMappingCandidate | null | undefined
) {
  if (!best || best.confidence < autoConfidenceThreshold) return false;
  if (second && best.confidence - second.confidence < 0.04) return false;
  if (best.birthDateMatches) return best.nameConfidence >= autoMatchingBirthDateNameThreshold;
  if (best.birthDateConflicts) return best.nameConfidence >= autoConflictingBirthDateNameThreshold;
  return best.nameConfidence >= autoNameConfidenceThreshold;
}

export function resolveSportsRuSeasonTeam<T extends ActiveSeasonTeam>(sportsTeamName: string, teams: T[]) {
  const candidates = teams
    .map((team) => ({ team, score: teamScoreAdjustment(sportsTeamName, team.team.name) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.team.team.name.localeCompare(right.team.team.name));
  if (candidates.length === 0) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  return candidates[0].team;
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

function authoritativePriceRosterEntry(
  price: SportsRuStoredPriceWithRoster,
  mappedPlayerId: string,
  requestedTeamId: bigint
): RosterEntry | null {
  if (
    !price.player ||
    !price.team ||
    price.teamId !== requestedTeamId ||
    String(price.playerId) !== mappedPlayerId ||
    String(price.player.id) !== mappedPlayerId ||
    price.team.id !== requestedTeamId
  ) return null;

  return {
    playerId: price.player.id,
    teamId: price.team.id,
    position: price.position,
    player: { name: price.player.name, birthDate: price.player.birthDate ?? null },
    team: { name: price.team.name }
  };
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

async function applyPriceRosterMapping(
  prisma: PrismaClient,
  price: SportsRuStoredPrice,
  rosterEntry: RosterEntry,
  contestId?: string | null
) {
  const otherPriceClaims = price.playerId && price.playerId !== rosterEntry.playerId
    ? await prisma.fantasyPlayerPrice.count({
        where: {
          id: { not: price.id },
          provider: sportsRuProvider,
          ...(contestId || price.contestId ? { contestId: contestId ?? price.contestId! } : {}),
          leagueId: price.leagueId,
          season: price.season,
          playerId: price.playerId
        }
      })
    : 0;
  await updatePriceFromRoster(prisma, price.id, rosterEntry);
  return syncSquadSelectionsForSportsRuMapping(prisma, {
    leagueId: price.leagueId,
    season: price.season,
    contestId: contestId ?? price.contestId ?? null,
    previousPlayerId: shouldMovePreviousSportsRuSelection({
      previousPlayerId: price.playerId,
      targetPlayerId: rosterEntry.playerId,
      otherPriceClaims
    }) ? price.playerId : null,
    rosterEntry,
    sportsPosition: price.position,
    price: price.price
  });
}

export function shouldMovePreviousSportsRuSelection(input: {
  previousPlayerId: bigint | null;
  targetPlayerId: bigint;
  otherPriceClaims: number;
}) {
  return Boolean(
    input.previousPlayerId
    && input.previousPlayerId !== input.targetPlayerId
    && input.otherPriceClaims === 0
  );
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
    contestId?: string | null;
    previousPlayerId: bigint | null;
    rosterEntry: RosterEntry;
    sportsPosition: string | null;
    price: number;
  }
): Promise<SportsRuSelectionSyncResult> {
  const squads = await prisma.userFantasySquad.findMany({
    where: {
      provider: sportsRuProvider,
      ...(input.contestId ? { contestId: input.contestId } : {}),
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

function scoreNameMatch(sportsName: string, fotmobName: string) {
  if (!sportsName || !fotmobName) return 0;
  if (sportsName === fotmobName) return 1;
  if (fotmobName.endsWith(` ${sportsName}`) || fotmobName.includes(` ${sportsName} `)) return sportsName.includes(" ") ? 0.94 : 0.91;
  if (sportsName.includes(" ") && fotmobName.includes(sportsName)) return 0.93;

  const sportsTokens = sportsName.split(" ").filter(Boolean);
  const fotmobTokens = fotmobName.split(" ").filter(Boolean);
  if (sportsTokens.length === 0 || fotmobTokens.length === 0) return 0;

  // Sports.ru's canonical identity can be a full legal name while FotMob
  // shows only the public two-part name (or the other way around). Compare
  // token sequences in both directions instead of requiring the long name to
  // fit into a window taken only from the short one.
  const shorterTokens = sportsTokens.length <= fotmobTokens.length ? sportsTokens : fotmobTokens;
  const longerTokens = sportsTokens.length <= fotmobTokens.length ? fotmobTokens : sportsTokens;
  if (shorterTokens.length >= 2 && containsTokenSequence(longerTokens, shorterTokens)) return 0.96;

  const aligned = alignedTokenSimilarity(shorterTokens, longerTokens);
  if (shorterTokens.length >= 2 && aligned.minimum >= 0.72 && aligned.average >= 0.87) {
    if (aligned.average >= 0.96) return 0.95;
    return aligned.average >= 0.91 ? 0.91 : 0.86;
  }
  if (shorterTokens.length === 1 && shorterTokens[0].length >= 5) {
    if (aligned.minimum === 1) return 0.91;
    if (aligned.minimum >= 0.9) return 0.84;
  }

  const sameSurname = sportsTokens.length >= 2
    && fotmobTokens.length >= 2
    && sportsTokens.at(-1) === fotmobTokens.at(-1);
  const firstNameScore = similarity(sportsTokens[0], fotmobTokens[0]);
  if (sameSurname && firstNameScore >= 0.7) {
    // Covers harmless transliteration and omitted middle names, for example
    // Sports.ru "Huan Boselli" vs FotMob "Juan Manuel Boselli", without
    // accepting unrelated players who merely share a surname.
    return firstNameScore >= 0.95 ? 0.96 : 0.88;
  }
  let best = 0;
  for (let size = 1; size <= Math.min(sportsTokens.length + 1, fotmobTokens.length); size += 1) {
    for (let index = 0; index <= fotmobTokens.length - size; index += 1) {
      const window = fotmobTokens.slice(index, index + size).join(" ");
      best = Math.max(best, similarity(sportsName, window));
    }
  }

  if (sportsTokens.length === 1) {
    const onlyToken = sportsTokens[0];
    for (const token of fotmobTokens) {
      best = Math.max(best, similarity(onlyToken, token) * 0.96);
    }
  }

  // With two multi-part names, a shared given name is not enough evidence.
  // Require a stronger whole-window resemblance if family-name token
  // alignment did not already prove the identity above.
  const minimumWindowScore = sportsTokens.length >= 2 && fotmobTokens.length >= 2 ? 0.72 : 0.68;
  return best >= minimumWindowScore ? best : 0;
}

function containsTokenSequence(haystack: string[], needle: string[]) {
  if (needle.length > haystack.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => token === haystack[index + offset])) return true;
  }
  return false;
}

function alignedTokenSimilarity(shorter: string[], longer: string[]) {
  const used = new Set<number>();
  const scores = shorter.map((shortToken) => {
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < longer.length; index += 1) {
      if (used.has(index)) continue;
      const score = tokenSimilarity(shortToken, longer[index]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) used.add(bestIndex);
    return bestScore;
  });
  return {
    minimum: Math.min(...scores),
    average: scores.reduce((sum, score) => sum + score, 0) / scores.length
  };
}

function tokenSimilarity(left: string, right: string) {
  return Math.max(similarity(left, right), jaroWinkler(left, right));
}

function jaroWinkler(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const range = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatches = Array.from({ length: left.length }, () => false);
  const rightMatches = Array.from({ length: right.length }, () => false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - range);
    const end = Math.min(right.length, leftIndex + range + 1);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) continue;
      leftMatches[leftIndex] = true;
      rightMatches[rightIndex] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  const matchedLeft = [...left].filter((_char, index) => leftMatches[index]);
  const matchedRight = [...right].filter((_char, index) => rightMatches[index]);
  let transpositions = 0;
  for (let index = 0; index < matchedLeft.length; index += 1) {
    if (matchedLeft[index] !== matchedRight[index]) transpositions += 1;
  }
  const jaro = (
    matches / left.length
    + matches / right.length
    + (matches - transpositions / 2) / matches
  ) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, left.length, right.length) && left[prefix] === right[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function positionScoreAdjustment(
  pricePosition: FantasyPositionGroup,
  rosterPosition: FantasyPositionGroup,
  rawRosterPosition: string | null
) {
  if (pricePosition === "UNK" || rosterPosition === "UNK") return 0;
  // Sports.ru fantasy classifies wide attackers as midfielders in these
  // tournaments, while FotMob's primary LW/RW code normalizes to FWD.
  // Treat that provider-taxonomy difference as a match, not a contradiction.
  const primaryRosterCode = rawRosterPosition?.split(/[,;|]+/)[0]?.trim().toUpperCase() ?? "";
  if (pricePosition === "MID" && ["LW", "RW"].includes(primaryRosterCode)) return 0.05;
  return pricePosition === rosterPosition ? 0.05 : -0.1;
}

function teamScoreAdjustment(sportsTeamName: string, fotmobTeamName: string) {
  const sportsTeam = canonicalSportsRuTeamName(sportsTeamName);
  const fotmobTeam = canonicalSportsRuTeamName(fotmobTeamName);
  if (!sportsTeam || !fotmobTeam) return 0;
  if (sportsTeam === fotmobTeam) return 0.04;
  if (sportsTeam.includes(fotmobTeam) || fotmobTeam.includes(sportsTeam)) return 0.02;
  return -1;
}

function canonicalSportsRuTeamName(value: string) {
  const normalized = normalizeSportsRuPlayerName(value)
    .replace(/\bahmat\b/g, "akhmat")
    .replace(/\bdinamo\b/g, "dynamo")
    .replace(/\bmahachkala\b/g, "makhachkala")
    .replace(/\btsska\b/g, "cska");
  return sportsRuCanonicalTeamNames.get(normalized) ?? normalized;
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

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
