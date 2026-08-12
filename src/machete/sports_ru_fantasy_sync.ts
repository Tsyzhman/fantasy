import type { PrismaClient } from "@prisma/client";

import { fetchSportsRuFantasyGraphqlSnapshot, parseSportsRuFantasyTournament } from "@/lib/providers/sports-ru-fantasy";

import { autoMapSportsRuFantasyPlayers } from "./sports_ru_player_mapping";

export type SportsRuFantasySyncInput = {
  leagueId: bigint;
  season: string;
  tournamentHru: string;
  sourceUrl?: string;
  minimumPlayers?: number;
  maxPlayersPerTeam?: number;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
};

export async function syncSportsRuFantasy(prisma: PrismaClient, input: SportsRuFantasySyncInput) {
  const sourceUrl = input.sourceUrl ?? `https://www.sports.ru/fantasy/football/${input.tournamentHru}/`;
  const minimumPlayers = positiveInteger(input.minimumPlayers, 100);
  const [snapshot, html] = await Promise.all([
    fetchSportsRuFantasyGraphqlSnapshot(input.tournamentHru, { fetchImpl: input.fetchImpl }),
    fetchSportsRuPage(sourceUrl, input.fetchImpl)
  ]);
  if (!snapshot.seasonId) {
    return {
      status: "UNAVAILABLE" as const,
      seasonId: null,
      prices: 0,
      deletedStalePrices: 0,
      mapping: null,
      databaseChanged: false
    };
  }
  if (snapshot.prices.length < minimumPlayers) {
    throw new Error(
      `Sports.ru returned only ${snapshot.prices.length} current-season prices for ${input.tournamentHru}; required at least ${minimumPlayers}. Existing data was not changed.`
    );
  }
  if (input.dryRun) {
    return {
      status: "READY" as const,
      seasonId: snapshot.seasonId,
      prices: snapshot.prices.length,
      deletedStalePrices: 0,
      mapping: null,
      databaseChanged: false
    };
  }

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: { leagueId_season: { leagueId: input.leagueId, season: input.season } },
    include: { league: true }
  });
  if (!leagueSeason) throw new Error(`League season not found: ${input.leagueId} ${input.season}`);

  const parsed = parseSportsRuFantasyTournament(html);
  const maxPlayersPerTeam = positiveInteger(
    input.maxPlayersPerTeam,
    parsed.contest.maxPlayersPerTeam ?? inferredMaxPlayersPerTeam(leagueSeason.league.name)
  );
  const contestName = parsed.contest.name === "Фэнтези" ? `Sports.ru ${leagueSeason.league.name}` : parsed.contest.name;
  const syncResult = await prisma.$transaction(async (tx) => {
    const existingContest = await tx.fantasyContest.findUnique({
      where: { provider_leagueId_season: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season } },
      select: { rules: true }
    });
    const contestRules = sportsRuContestRules(existingContest?.rules, snapshot, input.tournamentHru);
    const contest = await tx.fantasyContest.upsert({
      where: { provider_leagueId_season: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season } },
      update: {
        name: contestName,
        budgetLimit: parsed.contest.budgetLimit,
        squadSize: parsed.contest.squadSize,
        maxPlayersPerTeam,
        sourceUrl,
        rules: { ...contestRules, parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam },
        lastSyncedAt: new Date()
      },
      create: {
        leagueId: input.leagueId,
        season: input.season,
        provider: "SPORTS_RU",
        name: contestName,
        budgetLimit: parsed.contest.budgetLimit,
        squadSize: parsed.contest.squadSize,
        maxPlayersPerTeam,
        sourceUrl,
        rules: { ...contestRules, parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam },
        lastSyncedAt: new Date()
      }
    });

    const importedIds: string[] = [];
    for (const row of snapshot.prices) {
      const existingProviderRow = row.providerPlayerId
        ? await tx.fantasyPlayerPrice.findFirst({
            where: {
              provider: "SPORTS_RU",
              contestId: contest.id,
              leagueId: input.leagueId,
              season: input.season,
              providerPlayerId: row.providerPlayerId
            },
            select: { id: true }
          })
        : null;
      const priceData = {
        providerPlayerId: row.providerPlayerId,
        providerStatPlayerId: row.providerStatPlayerId,
        providerBirthDate: row.providerBirthDate ? new Date(`${row.providerBirthDate}T00:00:00.000Z`) : null,
        playerName: row.playerName,
        // Sports.ru's stat object exposes the canonical Latin identity name.
        // Persist it in the existing cross-provider name-hint column so the
        // FotMob matcher does not have to guess from Russian transliteration.
        fotmobPlayerName: row.providerCanonicalName ?? null,
        normalizedName: row.normalizedName,
        teamName: row.teamName ?? "",
        sportsTeamName: row.teamName ?? null,
        position: row.position,
        price: row.price,
        sourceKind: row.sourceKind,
        sourceRowIndex: row.sourceRowIndex,
        lastSeenAt: new Date()
      };
      const imported = existingProviderRow
        ? await tx.fantasyPlayerPrice.update({
            where: { id: existingProviderRow.id },
            data: priceData
          })
        : await tx.fantasyPlayerPrice.upsert({
        where: {
          contestId_normalizedName_teamName: {
            contestId: contest.id,
            normalizedName: row.normalizedName,
            teamName: row.teamName ?? ""
          }
        },
        update: priceData,
        create: {
          contestId: contest.id,
          leagueId: input.leagueId,
          season: input.season,
          provider: "SPORTS_RU",
          ...priceData
        }
      });
      importedIds.push(imported.id);
    }

    const staleRows = await tx.fantasyPlayerPrice.findMany({
      where: { provider: "SPORTS_RU", contestId: contest.id, leagueId: input.leagueId, season: input.season, id: { notIn: importedIds } },
      select: { id: true }
    });
    if (staleRows.length > 0) {
      const staleIds = staleRows.map((row) => row.id);
      await tx.providerEntityMap.deleteMany({
        where: {
          provider: "SPORTS_RU",
          contestId: contest.id,
          providerEntityType: "FANTASY_PLAYER_PRICE",
          providerEntityId: { in: staleIds },
          internalEntityType: "PLAYER"
        }
      });
      await tx.fantasyPlayerPrice.deleteMany({ where: { id: { in: staleIds }, provider: "SPORTS_RU", contestId: contest.id } });
    }
    return { deletedStalePrices: staleRows.length, contestId: contest.id };
  });
  const { deletedStalePrices, contestId } = syncResult;

  // A routine price refresh may update names, clubs and prices, but it must
  // never reinterpret an identity that an earlier automatic or manual review
  // has already accepted. Only genuinely unmapped rows enter the matcher.
  const mapping = await autoMapSportsRuFantasyPlayers(prisma, {
    leagueId: input.leagueId,
    season: input.season,
    contestId,
    onlyUnmapped: true
  });
  return {
    status: "SYNCED" as const,
    seasonId: snapshot.seasonId,
    prices: snapshot.prices.length,
    deletedStalePrices,
    mapping,
    databaseChanged: true
  };
}

type StoredSportsRuSeason = {
  seasonId: string;
  canonicalOffset: number;
  tours: Array<{
    id: string;
    name: string;
    status: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

export function sportsRuContestRules(
  previousRules: unknown,
  snapshot: Awaited<ReturnType<typeof fetchSportsRuFantasyGraphqlSnapshot>>,
  tournamentHru: string
) {
  const previous = storedSportsRuSeasons(previousRules);
  const existing = previous.find((season) => season.seasonId === snapshot.seasonId);
  const canonicalOffset = existing?.canonicalOffset
    ?? previous.reduce((maximum, season) => Math.max(maximum, season.canonicalOffset + season.tours.length), 0);
  const current: StoredSportsRuSeason = {
    seasonId: snapshot.seasonId!,
    canonicalOffset,
    tours: snapshot.tours.length > 0 ? snapshot.tours : existing?.tours ?? []
  };
  const sportsRuSeasons = [...previous.filter((season) => season.seasonId !== current.seasonId), current]
    .sort((left, right) => left.canonicalOffset - right.canonicalOffset)
    .slice(-4);
  return {
    sportsRuSeasonId: snapshot.seasonId,
    sportsRuSeasons,
    tournamentHru,
    priceSource: "graphql-current-season",
    transfersPerRound: 3,
    importedAt: new Date().toISOString()
  };
}

function storedSportsRuSeasons(value: unknown): StoredSportsRuSeason[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = (value as Record<string, unknown>).sportsRuSeasons;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): StoredSportsRuSeason[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    if (typeof record.seasonId !== "string" || !Number.isSafeInteger(record.canonicalOffset) || !Array.isArray(record.tours)) return [];
    const tours = record.tours.flatMap((tour): StoredSportsRuSeason["tours"] => {
      if (!tour || typeof tour !== "object" || Array.isArray(tour)) return [];
      const item = tour as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.name !== "string") return [];
      return [{
        id: item.id,
        name: item.name,
        status: typeof item.status === "string" ? item.status : null,
        startedAt: typeof item.startedAt === "string" ? item.startedAt : null,
        finishedAt: typeof item.finishedAt === "string" ? item.finishedAt : null
      }];
    });
    return [{ seasonId: record.seasonId, canonicalOffset: Number(record.canonicalOffset), tours }];
  });
}

async function fetchSportsRuPage(url: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(url, { headers: { "user-agent": "MacheteFantasyImporter/2.0" } });
  if (!response.ok) throw new Error(`Sports.ru page request failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function inferredMaxPlayersPerTeam(leagueName: string) {
  const value = leagueName.toLowerCase();
  return ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((name) => value.includes(name)) ? 3 : 2;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
