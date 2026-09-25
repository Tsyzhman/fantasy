import type { PrismaClient } from "@prisma/client";

import { fetchSportsRuFantasyGraphqlSnapshot, parseSportsRuFantasyTournament } from "@/lib/providers/sports-ru-fantasy";
import { normalizeName } from "@/lib/text";
import {
  replaceFantasyProviderSchedule,
  validateFantasyProviderSchedule
} from "@/server/fantasy-provider-schedule";

import {
  autoMapSportsRuFantasyPlayers,
  reconcileSportsRuFantasyTeamAssignments
} from "./sports_ru_player_mapping";
import { sportsRuMaxPlayersPerTeamForLeague } from "./sports_ru_team_limits";
import { sportsRuSeasonAliases } from "./squad_planner";

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

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 * Sports.ru publishes the same "Sports.ru Premier League" title for England and
 * Russia; the HRU is the only stable discriminator.
 */
const SPORTS_RU_CONTEST_NAME_BY_HRU: Record<string, string> = {
  england: "English Premier League",
  russia: "Russian Premier League"
};

export function sportsRuContestDisplayName(tournamentHru: string, parsedName: string, leagueName: string): string {
  const known = SPORTS_RU_CONTEST_NAME_BY_HRU[tournamentHru.trim().toLowerCase()];
  if (known) return known;
  return parsedName === "Фэнтези" ? `Sports.ru ${leagueName}` : parsedName;
}

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
  const providerSchedule = sportsRuProviderScheduleRows(snapshot);
  if (!input.dryRun) validateFantasyProviderSchedule(providerSchedule.rounds, providerSchedule.fixtures);
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
    sportsRuMaxPlayersPerTeamForLeague(input.leagueId)
  );
  const contestName = sportsRuContestDisplayName(input.tournamentHru, parsed.contest.name, leagueSeason.league.name);
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
      const existingRow = row.providerPlayerId
        ? await tx.fantasyPlayerPrice.findUnique({
            where: {
              contestId_providerPlayerId: {
                contestId: contest.id,
                providerPlayerId: row.providerPlayerId
              }
            },
            select: { id: true }
          })
        : await tx.fantasyPlayerPrice.findFirst({
            where: {
              contestId: contest.id,
              normalizedName: row.normalizedName,
              teamName: row.teamName ?? "",
              providerPlayerId: null
            },
            select: { id: true }
          });
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
        selectedByPercent: row.selectedByPercent,
        sourceKind: row.sourceKind,
        sourceRowIndex: row.sourceRowIndex,
        lastSeenAt: new Date()
      };
      const imported = existingRow
        ? await tx.fantasyPlayerPrice.update({
            where: { id: existingRow.id },
            data: priceData
          })
        : await tx.fantasyPlayerPrice.create({
            data: {
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

  // Keep an accepted player identity, but move its fantasy row to the club
  // currently published by Sports.ru. This is deliberately separate from
  // identity matching: a provider transfer must not remap the person.
  const teamReconciliation = await reconcileSportsRuFantasyTeamAssignments(prisma, {
    leagueId: input.leagueId,
    season: input.season,
    contestId
  });
  // A routine price refresh may update names, clubs and prices, but it must
  // never reinterpret an identity that an earlier automatic or manual review
  // has already accepted. Only genuinely unmapped rows enter the matcher.
  const mapping = await autoMapSportsRuFantasyPlayers(prisma, {
    leagueId: input.leagueId,
    season: input.season,
    contestId,
    onlyUnmapped: true
  });
  const schedule = await syncSportsRuProviderSchedule(prisma, {
    contestId,
    leagueId: input.leagueId,
    season: input.season,
    snapshot
  });
  return {
    status: "SYNCED" as const,
    seasonId: snapshot.seasonId,
    prices: snapshot.prices.length,
    deletedStalePrices,
    teamReconciliation,
    mapping,
    schedule,
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
    tours: snapshot.tours.length > 0
      ? snapshot.tours.map(({ id, name, status, startedAt, finishedAt }) => ({ id, name, status, startedAt, finishedAt }))
      : existing?.tours ?? []
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

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

async function syncSportsRuProviderSchedule(
  prisma: PrismaClient,
  input: {
    contestId: string;
    leagueId: bigint;
    season: string;
    snapshot: Awaited<ReturnType<typeof fetchSportsRuFantasyGraphqlSnapshot>>;
  }
) {
  const tours = input.snapshot.tours;
  const fixtures = tours.flatMap((tour) => tour.fixtures);
  const providerSchedule = sportsRuProviderScheduleRows(input.snapshot);
  const storedPrices = await prisma.fantasyPlayerPrice.findMany({
    where: { contestId: input.contestId, provider: "SPORTS_RU" },
    select: { providerPlayerId: true, teamId: true, teamName: true }
  });
  const storedByProviderPlayerId = new Map(
    storedPrices.flatMap((row) => row.providerPlayerId ? [[row.providerPlayerId, row] as const] : [])
  );
  const teamCandidates = new Map<string, Map<bigint, number>>();
  const teamCandidatesByName = new Map<string, Map<bigint, number>>();
  for (const price of input.snapshot.prices) {
    const stored = price.providerPlayerId ? storedByProviderPlayerId.get(price.providerPlayerId) : null;
    if (!stored?.teamId) continue;
    if (price.providerStatTeamId) addTeamCandidate(teamCandidates, price.providerStatTeamId, stored.teamId);
    const teamName = normalizeName(price.teamName ?? stored.teamName);
    if (teamName) addTeamCandidate(teamCandidatesByName, teamName, stored.teamId);
  }
  for (const fixture of fixtures) {
    if (!teamCandidates.has(fixture.homeTeamId) && fixture.homeTeamName) {
      const candidates = teamCandidatesByName.get(normalizeName(fixture.homeTeamName));
      if (candidates) teamCandidates.set(fixture.homeTeamId, new Map(candidates));
    }
    if (!teamCandidates.has(fixture.awayTeamId) && fixture.awayTeamName) {
      const candidates = teamCandidatesByName.get(normalizeName(fixture.awayTeamName));
      if (candidates) teamCandidates.set(fixture.awayTeamId, new Map(candidates));
    }
  }
  const providerTeamIds = new Set(fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]));
  const teamResolutions = new Map(
    [...providerTeamIds].map((providerTeamId) => [
      providerTeamId,
      resolveSportsRuTeamCandidate(teamCandidates.get(providerTeamId) ?? new Map())
    ])
  );
  const teamIds = new Map(
    [...teamResolutions].map(([providerTeamId, resolution]) => [providerTeamId, resolution?.internalTeamId ?? null])
  );
  const fetchedAt = validProviderDate(input.snapshot.fetchedAt) ?? new Date();

  return prisma.$transaction(async (tx) => {
    for (const [providerTeamId, internalTeamId] of teamIds) {
      const resolution = teamResolutions.get(providerTeamId) ?? null;
      await tx.providerEntityMap.upsert({
        where: {
          provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
            provider: "SPORTS_RU",
            providerSeason: input.snapshot.seasonId ?? input.season,
            providerEntityType: "STAT_TEAM",
            providerEntityId: providerTeamId,
            internalEntityType: "TEAM"
          }
        },
        update: {
          contestId: input.contestId,
          internalEntityId: internalTeamId ? String(internalTeamId) : null,
          confidence: resolution?.confidence ?? 0,
          matchedBy: resolution?.matchedBy ?? null,
          status: internalTeamId ? "MATCHED" : "UNMATCHED"
        },
        create: {
          provider: "SPORTS_RU",
          contestId: input.contestId,
          providerSeason: input.snapshot.seasonId ?? input.season,
          providerEntityType: "STAT_TEAM",
          providerEntityId: providerTeamId,
          internalEntityType: "TEAM",
          internalEntityId: internalTeamId ? String(internalTeamId) : null,
          confidence: resolution?.confidence ?? 0,
          matchedBy: resolution?.matchedBy ?? null,
          status: internalTeamId ? "MATCHED" : "UNMATCHED"
        }
      });
    }
    return replaceFantasyProviderSchedule(tx, {
      contestId: input.contestId,
      provider: "SPORTS_RU",
      leagueId: input.leagueId,
      season: input.season,
      seasonAliases: sportsRuSeasonAliases(input.season),
      fetchedAt,
      rounds: providerSchedule.rounds,
      fixtures: providerSchedule.fixtures,
      teamIds
    });
  });
}

function addTeamCandidate(map: Map<string, Map<bigint, number>>, key: string, teamId: bigint) {
  const candidates = map.get(key) ?? new Map<bigint, number>();
  candidates.set(teamId, (candidates.get(teamId) ?? 0) + 1);
  map.set(key, candidates);
}

export function resolveSportsRuTeamCandidate(votes: ReadonlyMap<bigint, number>) {
  const ranked = [...votes]
    .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  if (ranked.length === 0) return null;
  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  const [internalTeamId, count] = ranked[0];
  if (ranked.length === 1) {
    return { internalTeamId, confidence: 1, matchedBy: "SPORTS_RU_PRICE_TEAM_CONSENSUS" };
  }
  const share = count / total;
  if (count < 3 || share < 0.75 || count === ranked[1][1]) return null;
  return { internalTeamId, confidence: share, matchedBy: "SPORTS_RU_PRICE_TEAM_DOMINANCE" };
}

function sportsRuTourOrdinal(_name: string, index: number) {
  // Sports.ru returns tours in fantasy order, while their opaque IDs are not
  // monotonic (Spain's tour 6 ID is lower than tours 4 and 5). Array order is
  // therefore the only generic ordinal that also works for playoff labels.
  return index + 1;
}

function sportsRuProviderScheduleRows(
  snapshot: Awaited<ReturnType<typeof fetchSportsRuFantasyGraphqlSnapshot>>
) {
  return {
    rounds: snapshot.tours.map((tour, index) => ({
      providerRoundId: tour.id,
      ordinal: sportsRuTourOrdinal(tour.name, index),
      name: tour.name,
      status: tour.status,
      deadlineAt: validProviderDate(tour.startedAt),
      startsAt: earliestDate(tour.fixtures.map((fixture) => validProviderDate(fixture.scheduledAt)))
        ?? validProviderDate(tour.startedAt),
      finishedAt: validProviderDate(tour.finishedAt)
    })),
    fixtures: snapshot.tours.flatMap((tour) => tour.fixtures.map((fixture) => ({
      providerFixtureId: fixture.id,
      providerRoundId: tour.id,
      providerHomeTeamId: fixture.homeTeamId,
      providerAwayTeamId: fixture.awayTeamId,
      providerHomeTeamName: fixture.homeTeamName,
      providerAwayTeamName: fixture.awayTeamName,
      kickoffAt: validProviderDate(fixture.scheduledAt),
      status: fixture.status,
      sourceRoundLabel: fixture.sourceRoundLabel
    })))
  };
}

function validProviderDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function earliestDate(values: Array<Date | null>) {
  const dates = values.filter((value): value is Date => value !== null);
  return dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}
