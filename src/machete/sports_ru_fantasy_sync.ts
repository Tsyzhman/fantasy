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
  const deletedStalePrices = await prisma.$transaction(async (tx) => {
    await tx.sportsRuFantasyContest.upsert({
      where: { provider_leagueId_season: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season } },
      update: {
        name: contestName,
        budgetLimit: parsed.contest.budgetLimit,
        squadSize: parsed.contest.squadSize,
        maxPlayersPerTeam,
        sourceUrl,
        rules: {
          parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam,
          sportsRuSeasonId: snapshot.seasonId,
          tournamentHru: input.tournamentHru,
          priceSource: "graphql-current-season",
          transfersPerRound: 3,
          importedAt: new Date().toISOString()
        },
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
        rules: {
          parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam,
          sportsRuSeasonId: snapshot.seasonId,
          tournamentHru: input.tournamentHru,
          priceSource: "graphql-current-season",
          transfersPerRound: 3,
          importedAt: new Date().toISOString()
        },
        lastSyncedAt: new Date()
      }
    });

    const importedIds: string[] = [];
    for (const row of snapshot.prices) {
      const existingProviderRow = row.providerPlayerId
        ? await tx.fantasyPlayerPrice.findFirst({
            where: {
              provider: "SPORTS_RU",
              leagueId: input.leagueId,
              season: input.season,
              providerPlayerId: row.providerPlayerId
            },
            select: { id: true }
          })
        : null;
      const priceData = {
        providerPlayerId: row.providerPlayerId,
        playerName: row.playerName,
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
          provider_leagueId_season_normalizedName_teamName: {
            provider: "SPORTS_RU",
            leagueId: input.leagueId,
            season: input.season,
            normalizedName: row.normalizedName,
            teamName: row.teamName ?? ""
          }
        },
        update: priceData,
        create: {
          leagueId: input.leagueId,
          season: input.season,
          provider: "SPORTS_RU",
          ...priceData
        }
      });
      importedIds.push(imported.id);
    }

    const staleRows = await tx.fantasyPlayerPrice.findMany({
      where: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season, id: { notIn: importedIds } },
      select: { id: true }
    });
    if (staleRows.length > 0) {
      const staleIds = staleRows.map((row) => row.id);
      await tx.providerEntityMap.deleteMany({
        where: {
          provider: "SPORTS_RU",
          providerEntityType: "FANTASY_PLAYER_PRICE",
          providerEntityId: { in: staleIds },
          internalEntityType: "PLAYER"
        }
      });
      await tx.fantasyPlayerPrice.deleteMany({ where: { id: { in: staleIds } } });
    }
    return staleRows.length;
  });

  const mapping = await autoMapSportsRuFantasyPlayers(prisma, { leagueId: input.leagueId, season: input.season });
  return {
    status: "SYNCED" as const,
    seasonId: snapshot.seasonId,
    prices: snapshot.prices.length,
    deletedStalePrices,
    mapping,
    databaseChanged: true
  };
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
