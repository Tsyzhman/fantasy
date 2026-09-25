import type { PrismaClient } from "@prisma/client";
import { sportsRuGraphqlRequest } from "@/lib/providers/sports-ru-fantasy";
import { SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS } from "./config";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 */
const GRAPHQL_ENDPOINT = "https://www.sports.ru/gql/graphql/";
const PAGE_SIZE = 200;
const MAX_PAGES = 6;
const TOP_ENTRIES = 10;
const TRANSFER_STATUS_REASON = "Изменение доли выбора за тур (chartSelectedBy), не точное число трансферов.";
const OFFICIAL_STATUS_REASON = "Официальный topTransferPlayers Sports: порядок Sports, значение — очки игрока за сезон.";

export interface TransferTrendEntry {
  rank: number;
  providerPlayerId: string;
  name: string;
  team: string | null;
  price: number | null;
  value: number | null;
  valueText: string | null;
}

export interface TransferTrends {
  official: TransferTrendEntry[];
  gainers: TransferTrendEntry[];
  losers: TransferTrendEntry[];
  tourId: string | null;
  tourLabel: string | null;
  chartedPlayers: number;
}

interface GraphqlChart {
  selectedBy?: number | null;
  tour?: { id?: string | null; name?: string | null } | null;
}

interface GraphqlPlayer {
  id?: string | null;
  name?: string | null;
  price?: number | null;
  team?: { name?: string | null } | null;
  status?: { selectedBy?: number | null; chartSelectedBy?: GraphqlChart[] | null } | null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundPp(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPp(value: number): string {
  const rounded = roundPp(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} п.п.`;
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 */
export function computeTransferDeltas(players: GraphqlPlayer[], targetTourId?: string | null): {
  gainers: TransferTrendEntry[];
  losers: TransferTrendEntry[];
  tourId: string | null;
  tourLabel: string | null;
  chartedPlayers: number;
} {
  const charted = players.filter((player) => (player.status?.chartSelectedBy ?? []).length > 0);
  let tourId = targetTourId ?? null;
  let tourLabel: string | null = null;
  const targetEntry = tourId
    ? charted.find((player) => player.status?.chartSelectedBy?.some((chart) => chart.tour?.id === tourId))?.status?.chartSelectedBy?.find((chart) => chart.tour?.id === tourId)
    : null;
  if (targetEntry) {
    tourLabel = targetEntry.tour?.name ?? null;
  } else {
    // The upcoming tour has no published ownership chart yet; fall back to the newest charted tour.
    const newest = charted[0]?.status?.chartSelectedBy?.[0];
    tourId = newest?.tour?.id ?? null;
    tourLabel = newest?.tour?.name ?? null;
  }
  if (!tourId) return { gainers: [], losers: [], tourId: null, tourLabel: null, chartedPlayers: charted.length };

  const withDelta = charted
    .map((player) => {
      const chart = player.status?.chartSelectedBy ?? [];
      const index = chart.findIndex((entry) => entry.tour?.id === tourId);
      if (index < 0) return null;
      const current = finiteOrNull(chart[index]?.selectedBy);
      const previous = finiteOrNull(chart[index + 1]?.selectedBy);
      if (current == null || previous == null) return null;
      const delta = roundPp(current - previous);
      if (delta === 0) return null;
      const playerId = player.id?.trim();
      const name = player.name?.trim();
      if (!playerId || !name) return null;
      return {
        providerPlayerId: playerId,
        name,
        team: player.team?.name ?? null,
        price: finiteOrNull(player.price),
        value: delta,
        valueText: formatPp(delta)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const ranked = (direction: "gain" | "loss") =>
    withDelta
      .filter((entry) => (direction === "gain" ? entry.value > 0 : entry.value < 0))
      .sort((left, right) => (direction === "gain" ? right.value - left.value : left.value - right.value))
      .slice(0, TOP_ENTRIES)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { gainers: ranked("gain"), losers: ranked("loss"), tourId, tourLabel, chartedPlayers: charted.length };
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 */
export async function fetchSportsRuTransferTrends(input: {
  seasonId: string;
  targetTourId?: string | null;
  squadId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TransferTrends> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let official: TransferTrendEntry[] = [];
  if (input.squadId && input.targetTourId) {
    try {
      const response = await sportsRuGraphqlRequest<{ fantasyQueries?: { squadTourInfo?: { topTransferPlayers?: GraphqlPlayer[] | null } | null } | null }>(
        GRAPHQL_ENDPOINT,
        `{ fantasyQueries { squadTourInfo(input: { squadID: ${JSON.stringify(input.squadId)}, tourID: ${JSON.stringify(input.targetTourId)} }) { topTransferPlayers { id name price team { name } gameStat { points } } } } }`,
        fetchImpl
      );
      const list = response.fantasyQueries?.squadTourInfo?.topTransferPlayers ?? [];
      official = list
        .filter((player) => player.id && player.name)
        .slice(0, TOP_ENTRIES)
        .map((player, index) => {
          const points = finiteOrNull((player as { gameStat?: { points?: number | null } | null }).gameStat?.points);
          return {
            rank: index + 1,
            providerPlayerId: player.id!,
            name: player.name!,
            team: player.team?.name ?? null,
            price: finiteOrNull(player.price),
            value: points,
            valueText: points == null ? null : `${points} очков`
          };
        });
    } catch {
      official = [];
    }
  }

  const players: GraphqlPlayer[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await sportsRuGraphqlRequest<{ fantasyQueries?: { players?: { list?: GraphqlPlayer[] | null } | null } | null }>(
      GRAPHQL_ENDPOINT,
      `{ fantasyQueries { players(input: { seasonID: ${JSON.stringify(input.seasonId)}, pageSize: ${PAGE_SIZE}, pageNum: ${page}, sortOrder: DESC, sortType: BY_PRICE }) { list { id name price team { name } status { selectedBy chartSelectedBy { tour { id name } selectedBy } } } } } }`,
      fetchImpl
    );
    const list = response.fantasyQueries?.players?.list ?? [];
    players.push(...list);
    if (list.length < PAGE_SIZE) break;
  }

  return { official, ...computeTransferDeltas(players, input.targetTourId) };
}

export interface TransferTrendsCaptureResult {
  contests: number;
  snapshots: number;
  entries: number;
  skipped: number;
}

async function createTransferSnapshot(
  prisma: PrismaClient,
  input: {
    contestId: string;
    season: string;
    providerRoundId: string | null;
    roundOrdinal: number | null;
    category: "BUYS" | "SELLS";
    metricKind: string;
    unit: string;
    sectionKey: string;
    statusReason: string;
    observedAt: Date;
    entries: TransferTrendEntry[];
  }
): Promise<number> {
  await prisma.$transaction(async (tx) => {
    const snapshot = await tx.sportsTrendSnapshot.create({
      data: {
        contestId: input.contestId,
        season: input.season,
        providerRoundId: input.providerRoundId,
        roundOrdinal: input.roundOrdinal,
        category: input.category,
        metricKind: input.metricKind,
        unit: input.unit,
        populationScope: "ALL_MANAGERS",
        sectionKey: input.sectionKey,
        sourceId: null,
        revision: 1,
        status: "READY",
        statusReason: input.statusReason,
        sourceEntryCount: input.entries.length,
        observedAt: input.observedAt,
        sourcePublishedAt: null
      }
    });
    await tx.sportsTrendEntry.createMany({
      data: input.entries.map((entry) => ({
        snapshotId: snapshot.id,
        sourceRank: entry.rank,
        providerPlayerId: entry.providerPlayerId,
        playerId: null,
        sourceName: entry.name,
        sourceTeam: entry.team,
        sourcePosition: null,
        value: entry.value,
        valueText: entry.valueText
      }))
    });
  });
  return input.entries.length;
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#scenarios
 * @spec spec://modules/machete/FEAT-006-sports-popularity#data
 */
export async function captureSportsTransferTrends(
  prisma: PrismaClient,
  options: { now?: Date; contestIds?: string[]; fetchImpl?: typeof fetch; maxContests?: number } = {}
): Promise<TransferTrendsCaptureResult> {
  const now = options.now ?? new Date();
  const bucket = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
  const contests = await prisma.fantasyContest.findMany({
    where: {
      scheduleSyncedAt: { not: null },
      ...(options.contestIds && options.contestIds.length > 0
        ? { id: { in: options.contestIds } }
        : { providerRounds: { some: { deadlineAt: { gt: now } } } })
    },
    select: { id: true, season: true, leagueId: true, rules: true },
    take: options.maxContests ?? SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS
  });
  const result: TransferTrendsCaptureResult = { contests: 0, snapshots: 0, entries: 0, skipped: 0 };
  for (const contest of contests) {
    result.contests += 1;
    const rules = contest.rules && typeof contest.rules === "object" ? (contest.rules as Record<string, unknown>) : {};
    const seasonId = typeof rules.sportsRuSeasonId === "string" || typeof rules.sportsRuSeasonId === "number" ? String(rules.sportsRuSeasonId) : null;
    if (!seasonId) {
      result.skipped += 1;
      continue;
    }
    const round = await prisma.fantasyProviderRound.findFirst({
      where: { contestId: contest.id, deadlineAt: { gte: now } },
      orderBy: { deadlineAt: "asc" },
      select: { providerRoundId: true, ordinal: true }
    });
    if (!round) {
      result.skipped += 1;
      continue;
    }
    const existing = await prisma.sportsTrendSnapshot.findFirst({
      where: { contestId: contest.id, sectionKey: { in: ["TRANSFERS_GAIN", "TRANSFERS_OFFICIAL"] }, observedAt: bucket },
      select: { id: true }
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }
    const squad = await prisma.sportsRuSquadSnapshot.findFirst({
      where: { leagueId: contest.leagueId, season: contest.season, providerSquadId: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { providerSquadId: true }
    });
    let trends: TransferTrends;
    try {
      trends = await fetchSportsRuTransferTrends({
        seasonId,
        targetTourId: round.providerRoundId,
        squadId: squad?.providerSquadId ?? null,
        fetchImpl: options.fetchImpl
      });
    } catch {
      result.skipped += 1;
      continue;
    }
    const roundMatches = trends.tourId != null && trends.tourId === round.providerRoundId;
    const providerRoundId = roundMatches ? round.providerRoundId : null;
    const roundOrdinal = roundMatches ? round.ordinal : null;
    const tourSuffix = trends.tourLabel ? ` Тур: ${trends.tourLabel}.` : "";
    const createIfEntries = async (input: Parameters<typeof createTransferSnapshot>[1]) => {
      if (input.entries.length === 0) return;
      try {
        result.entries += await createTransferSnapshot(prisma, input);
        result.snapshots += 1;
      } catch {
        result.skipped += 1;
      }
    };
    await createIfEntries({
      contestId: contest.id,
      season: contest.season,
      providerRoundId,
      roundOrdinal,
      category: "BUYS",
      metricKind: "reported_points",
      unit: "points",
      sectionKey: "TRANSFERS_OFFICIAL",
      statusReason: `${OFFICIAL_STATUS_REASON}${tourSuffix}`,
      observedAt: bucket,
      entries: trends.official
    });
    await createIfEntries({
      contestId: contest.id,
      season: contest.season,
      providerRoundId,
      roundOrdinal,
      category: "BUYS",
      metricKind: "ownership_delta_pp",
      unit: "pp",
      sectionKey: "TRANSFERS_GAIN",
      statusReason: `${TRANSFER_STATUS_REASON}${tourSuffix}`,
      observedAt: bucket,
      entries: trends.gainers
    });
    await createIfEntries({
      contestId: contest.id,
      season: contest.season,
      providerRoundId,
      roundOrdinal,
      category: "SELLS",
      metricKind: "ownership_delta_pp",
      unit: "pp",
      sectionKey: "TRANSFERS_DROP",
      statusReason: `${TRANSFER_STATUS_REASON}${tourSuffix}`,
      observedAt: bucket,
      entries: trends.losers
    });
  }
  return result;
}
