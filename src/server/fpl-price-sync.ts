import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { normalizeName } from "@/lib/text";
import {
  FPL_BOOTSTRAP_URL,
  FPL_LEAGUE_ID,
  FPL_PROVIDER,
  FPL_SEASON,
  fplChipDefinitions,
  FplPublicClient,
  fplPlayerEntityIdentity,
  fplPriceRows,
  fplTeamNameCandidates,
  fplTeamEntityIdentity,
  latestFinalizedFplGameweek,
  latestPublishedFplGameweek,
  type FplBootstrap,
  type FplClientOptions,
  type FplFixture,
  type FplPriceRow
} from "@/lib/providers/fpl";
import { fpl202627Rules, fplRulesetJson, FPL_RULESET_NAME, FPL_RULESET_VERSION } from "@/lib/providers/fpl-rules";

import { replaceFantasyProviderSchedule } from "./fantasy-provider-schedule";

const FPL_LOCK_KEY = "fantasy-scout:fpl:price-sync";
const FPL_JOB_TYPE = "FPL_PRICE_SYNC";
const FPL_PRICE_SYNC_FORMAT_VERSION = "provider-schedule-ownership-v4";

export type FplPriceSyncResult = {
  status: "SYNCED" | "SKIPPED";
  contestId: string;
  snapshotKey: string;
  prices: number;
  mappedPlayers: number;
  mappedTeams: number;
  unmatchedPlayers: number;
  unmatchedTeams: number;
  payloadHash: string;
  latestPublishedGameweek: number | null;
  latestFinalizedGameweek: number | null;
  scheduleFixtures: number;
};

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
export async function syncFplPrices(
  prisma: PrismaClient = defaultPrisma,
  options: {
    client?: FplPublicClient;
    clientOptions?: FplClientOptions;
    now?: Date;
    trigger?: "STARTUP" | "SCHEDULED" | "MANUAL";
  } = {}
): Promise<FplPriceSyncResult> {
  const now = options.now ?? new Date();
  const client = options.client ?? new FplPublicClient(options.clientOptions);
  const bootstrap = await client.getBootstrap();
  const fixtures = await client.getFixtures();
  const rows = fplPriceRows(bootstrap);
  const teamByProviderId = new Map(bootstrap.teams.map((team) => [team.id, team]));
  if (rows.length === 0) throw new Error("FPL bootstrap produced no price rows; preserving the previous snapshot.");
  const payloadHash = hashFplSnapshot(bootstrap, fixtures);
  const snapshotKey = fplSnapshotKey(now);
  const latestPublishedGameweek = latestPublishedFplGameweek(bootstrap.events, now)?.id ?? null;
  const latestFinalizedGameweek = latestFinalizedFplGameweek(bootstrap.events, now)?.id ?? null;
  const trigger = options.trigger ?? "SCHEDULED";

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${FPL_LOCK_KEY}))`);
    const contest = await tx.fantasyContest.upsert({
      where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
      update: {
        budgetLimit: fpl202627Rules.budgetLimit,
        squadSize: fpl202627Rules.squadSize,
        maxPlayersPerTeam: fpl202627Rules.maxPlayersPerTeam,
        rules: fplRulesetJson() as Prisma.InputJsonValue,
        sourceUrl: FPL_BOOTSTRAP_URL,
        lastSyncedAt: now
      },
      create: {
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        providerContestId: FPL_SEASON,
        slug: "fpl",
        name: "Fantasy Premier League",
        budgetLimit: fpl202627Rules.budgetLimit,
        squadSize: fpl202627Rules.squadSize,
        maxPlayersPerTeam: fpl202627Rules.maxPlayersPerTeam,
        rules: fplRulesetJson() as Prisma.InputJsonValue,
        sourceUrl: FPL_BOOTSTRAP_URL,
        lastSyncedAt: now
      },
      select: { id: true }
    });
    const idempotencyKey = `${snapshotKey}:${payloadHash}:${FPL_PRICE_SYNC_FORMAT_VERSION}`;
    const existingRun = await tx.fantasyProviderSyncRun.findUnique({
      where: { provider_contestId_idempotencyKey: { provider: FPL_PROVIDER, contestId: contest.id, idempotencyKey } },
      select: { status: true }
    });
    if (existingRun?.status === "SUCCEEDED") {
      return {
        status: "SKIPPED",
        contestId: contest.id,
        snapshotKey,
        prices: rows.length,
        mappedPlayers: 0,
        mappedTeams: 0,
        unmatchedPlayers: 0,
        unmatchedTeams: 0,
        payloadHash,
        latestPublishedGameweek,
        latestFinalizedGameweek,
        scheduleFixtures: fixtures.length
      };
    }

    const run = await tx.fantasyProviderSyncRun.upsert({
      where: { provider_contestId_idempotencyKey: { provider: FPL_PROVIDER, contestId: contest.id, idempotencyKey } },
      update: { status: "RUNNING", trigger, startedAt: now, finishedAt: null, errorMessage: null },
      create: {
        contestId: contest.id,
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        jobType: FPL_JOB_TYPE,
        trigger,
        idempotencyKey,
        status: "RUNNING",
        startedAt: now,
        sourceUrl: FPL_BOOTSTRAP_URL,
        payloadHash
      },
      select: { id: true }
    });

    const mapping = await resolveFplMappings(tx, contest.id, bootstrap, rows);
    for (const [sourceRowIndex, row] of rows.entries()) {
      const playerMapping = mapping.players.get(row.providerPlayerId);
      const teamMapping = mapping.teams.get(row.providerTeamId);
      await tx.fantasyPlayerPrice.upsert({
        where: { contestId_providerPlayerId: { contestId: contest.id, providerPlayerId: row.providerPlayerId } },
        update: fplPriceUpdate(
          row,
          mapping.teamNames.get(row.providerTeamId) ?? row.providerTeamId,
          teamMapping?.internalId ?? null,
          playerMapping?.internalId ?? null,
          now
        ),
        create: {
          contestId: contest.id,
          leagueId: FPL_LEAGUE_ID,
          season: FPL_SEASON,
          provider: FPL_PROVIDER,
          providerPlayerId: row.providerPlayerId,
          playerId: playerMapping?.internalId ?? null,
          teamId: teamMapping?.internalId ?? null,
          playerName: row.playerName,
          normalizedName: row.normalizedName,
          teamName: mapping.teamNames.get(row.providerTeamId) ?? row.providerTeamId,
          positionLabel: row.position,
          sourceKind: "FPL_BOOTSTRAP_STATIC",
          sourceRowIndex,
          position: row.position,
          price: row.price,
          selectedByPercent: row.selectedByPercent,
          firstSeenAt: now,
          lastSeenAt: now
        }
      });
    }
    await tx.fantasyPlayerPrice.deleteMany({
      where: { contestId: contest.id, providerPlayerId: { notIn: rows.map((row) => row.providerPlayerId) } }
    });
    await tx.providerEntityMap.deleteMany({
      where: {
        contestId: contest.id,
        provider: FPL_PROVIDER,
        providerSeason: FPL_SEASON,
        providerEntityType: "PLAYER",
        providerEntityId: { notIn: rows.map((row) => row.providerPlayerId) },
        internalEntityType: "PLAYER"
      }
    });
    await tx.providerEntityMap.deleteMany({
      where: {
        contestId: contest.id,
        provider: FPL_PROVIDER,
        providerSeason: FPL_SEASON,
        providerEntityType: "TEAM",
        providerEntityId: { notIn: bootstrap.teams.map((team) => String(team.id)) },
        internalEntityType: "TEAM"
      }
    });
    for (const row of mapping.entityMaps) {
      await tx.providerEntityMap.upsert({
        where: {
          provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
            provider: row.provider,
            providerSeason: row.providerSeason,
            providerEntityType: row.providerEntityType,
            providerEntityId: row.providerEntityId,
            internalEntityType: row.internalEntityType
          }
        },
        update: {
          contestId: contest.id,
          providerEntityCode: row.providerEntityCode,
          internalEntityId: row.internalEntityId,
          confidence: row.confidence,
          matchedBy: row.matchedBy,
          status: row.status
        },
        create: {
          contestId: contest.id,
          provider: row.provider,
          providerSeason: row.providerSeason,
          providerEntityCode: row.providerEntityCode,
          providerEntityType: row.providerEntityType,
          providerEntityId: row.providerEntityId,
          internalEntityType: row.internalEntityType,
          internalEntityId: row.internalEntityId,
          confidence: row.confidence,
          matchedBy: row.matchedBy,
          status: row.status
        }
      });
    }
    const schedule = await replaceFantasyProviderSchedule(tx, {
      contestId: contest.id,
      provider: FPL_PROVIDER,
      leagueId: FPL_LEAGUE_ID,
      season: FPL_SEASON,
      fetchedAt: bootstrap.fetchedAt,
      rounds: bootstrap.events.map((event) => ({
        providerRoundId: String(event.id),
        ordinal: event.id,
        name: event.name,
        status: event.finished ? "FINISHED" : event.isCurrent ? "CURRENT" : event.isNext ? "NEXT" : "SCHEDULED",
        deadlineAt: event.deadlineTime,
        startsAt: earliestFplFixtureDate(fixtures, event.id) ?? event.deadlineTime,
        finishedAt: event.finished ? latestFplFixtureDate(fixtures, event.id) : null
      })),
      fixtures: fixtures.map((fixture) => ({
        providerFixtureId: String(fixture.id),
        providerRoundId: fixture.event === null ? null : String(fixture.event),
        providerHomeTeamId: String(fixture.homeTeamId),
        providerAwayTeamId: String(fixture.awayTeamId),
        providerHomeTeamName: teamByProviderId.get(fixture.homeTeamId)?.name ?? null,
        providerAwayTeamName: teamByProviderId.get(fixture.awayTeamId)?.name ?? null,
        kickoffAt: fixture.kickoffTime,
        status: fixture.finished ? "FINISHED" : fixture.started ? "STARTED" : "SCHEDULED",
        sourceRoundLabel: null
      })),
      teamIds: new Map([...mapping.teams].map(([providerTeamId, team]) => [providerTeamId, team.internalId]))
    });
    await tx.fantasyPlayerPriceSnapshot.upsert({
      where: { contestId_snapshotKey: { contestId: contest.id, snapshotKey } },
      update: {
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        status: "READY",
        sourceUrl: FPL_BOOTSTRAP_URL,
        payloadHash,
        prices: rows as unknown as Prisma.InputJsonValue,
        fetchedAt: bootstrap.fetchedAt
      },
      create: {
        contestId: contest.id,
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        snapshotKey,
        status: "READY",
        sourceUrl: FPL_BOOTSTRAP_URL,
        payloadHash,
        prices: rows as unknown as Prisma.InputJsonValue,
        fetchedAt: bootstrap.fetchedAt
      }
    });
    for (const definition of fplChipDefinitions(bootstrap)) {
      await tx.fantasyChipDefinition.upsert({
        where: { contestId_code_half: { contestId: contest.id, code: definition.code, half: definition.half } },
        update: { provider: FPL_PROVIDER, season: FPL_SEASON, maxUses: definition.maxUses, rules: definition.rules as Prisma.InputJsonValue },
        create: {
          contestId: contest.id,
          provider: FPL_PROVIDER,
          season: FPL_SEASON,
          code: definition.code,
          half: definition.half,
          maxUses: definition.maxUses,
          rules: definition.rules as Prisma.InputJsonValue
        }
      });
    }
    await tx.fantasyRuleset.upsert({
      where: { provider_name_version: { provider: FPL_PROVIDER, name: FPL_RULESET_NAME, version: FPL_RULESET_VERSION } },
      update: { contestId: contest.id, rules: fplRulesetJson() as Prisma.InputJsonValue },
      create: {
        provider: FPL_PROVIDER,
        contestId: contest.id,
        name: FPL_RULESET_NAME,
        version: FPL_RULESET_VERSION,
        rules: fplRulesetJson() as Prisma.InputJsonValue
      }
    });
    await tx.fantasyProviderSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: now,
        counts: {
          prices: rows.length,
          mappedPlayers: mapping.mappedPlayers,
          mappedTeams: mapping.mappedTeams,
          unmatchedPlayers: mapping.unmatchedPlayers,
          unmatchedTeams: mapping.unmatchedTeams,
          scheduleRounds: schedule.rounds,
          scheduleFixtures: schedule.fixtures,
          scheduleMatchedFixtures: schedule.matchedFixtures,
          scheduleTeamMappedFixtures: schedule.teamMappedFixtures,
          scheduleUnmatchedFixtures: schedule.unmatchedFixtures
        } as Prisma.InputJsonValue
      }
    });
    return {
      status: "SYNCED",
      contestId: contest.id,
      snapshotKey,
      prices: rows.length,
      mappedPlayers: mapping.mappedPlayers,
      mappedTeams: mapping.mappedTeams,
      unmatchedPlayers: mapping.unmatchedPlayers,
      unmatchedTeams: mapping.unmatchedTeams,
      payloadHash,
      latestPublishedGameweek,
      latestFinalizedGameweek,
      scheduleFixtures: schedule.fixtures
    } satisfies FplPriceSyncResult;
  });
}

type FplMapping = {
  internalId: bigint | null;
  confidence: number;
  matchedBy: string | null;
  status: string;
};

async function resolveFplMappings(tx: Prisma.TransactionClient, contestId: string, bootstrap: FplBootstrap, rows: readonly FplPriceRow[]) {
  const providerPlayerIds = rows.map((row) => row.providerPlayerId);
  const providerTeamIds = bootstrap.teams.map((team) => String(team.id));
  const [existingMaps, coreTeams, activeSeasonTeams, corePlayers] = await Promise.all([
    tx.providerEntityMap.findMany({
      where: {
        contestId,
        provider: FPL_PROVIDER,
        providerSeason: FPL_SEASON,
        providerEntityId: { in: [...providerPlayerIds, ...providerTeamIds] },
        internalEntityType: { in: ["PLAYER", "TEAM"] }
      },
      select: { providerEntityType: true, providerEntityId: true, internalEntityType: true, internalEntityId: true, confidence: true, matchedBy: true, status: true }
    }),
    tx.coreTeam.findMany({ select: { id: true, name: true } }),
    tx.leagueSeasonTeam.findMany({ where: { leagueId: FPL_LEAGUE_ID, season: FPL_SEASON, active: true }, select: { teamId: true } }),
    tx.corePlayer.findMany({ select: { id: true, name: true } })
  ]);
  const activeTeamIds = new Set(activeSeasonTeams.map((row) => String(row.teamId)));
  const existing = new Map(existingMaps.map((row) => [`${row.providerEntityType}:${row.providerEntityId}:${row.internalEntityType}`, row]));
  const coreTeamIdsByName = new Map<string, bigint[]>();
  for (const team of coreTeams) {
    const key = normalizeName(team.name);
    const ids = coreTeamIdsByName.get(key) ?? [];
    ids.push(team.id);
    coreTeamIdsByName.set(key, ids);
  }
  const playerIdsByName = new Map<string, bigint[]>();
  for (const player of corePlayers) {
    const key = normalizeName(player.name);
    const ids = playerIdsByName.get(key) ?? [];
    ids.push(player.id);
    playerIdsByName.set(key, ids);
  }
  const rosterCandidates = await tx.teamPlayerSeason.findMany({
    where: { leagueId: FPL_LEAGUE_ID, season: FPL_SEASON, active: true },
    select: { playerId: true, teamId: true, position: true }
  });
  const rosterByPlayerId = new Map<string, Array<{ teamId: bigint; position: string | null }>>();
  for (const roster of rosterCandidates) {
    const values = rosterByPlayerId.get(String(roster.playerId)) ?? [];
    values.push({ teamId: roster.teamId, position: roster.position });
    rosterByPlayerId.set(String(roster.playerId), values);
  }
  const players = new Map<string, FplMapping>();
  const teams = new Map<string, FplMapping>();
  const entityMaps: Array<{
    provider: "FPL";
    providerSeason: string;
    providerEntityType: "PLAYER" | "TEAM";
    providerEntityId: string;
    providerEntityCode: string | null;
    internalEntityType: "PLAYER" | "TEAM";
    internalEntityId: string | null;
    confidence: number;
    matchedBy: string | null;
    status: string;
  }> = [];

  for (const team of bootstrap.teams) {
    const providerTeamId = String(team.id);
    const map = existing.get(`TEAM:${providerTeamId}:TEAM`);
    const existingCandidate = map?.status === "MATCHED" ? validBigInt(map.internalEntityId) : null;
    const existingInternalId = existingCandidate && activeTeamIds.has(String(existingCandidate)) ? existingCandidate : null;
    const exactNameCandidates = fplTeamNameCandidates(team).flatMap((candidate) => coreTeamIdsByName.get(normalizeName(candidate)) ?? []);
    const uniqueExactNameCandidates = [...new Set(exactNameCandidates.map((candidate) => String(candidate)))].map((candidate) => BigInt(candidate));
    const activeExactNameCandidates = uniqueExactNameCandidates.filter((candidate) => activeTeamIds.has(String(candidate)));
    const exactName = activeExactNameCandidates.length === 1 ? activeExactNameCandidates[0] : null;
    const internalId = existingInternalId ?? exactName;
    const mapping: FplMapping = internalId
      ? { internalId, confidence: existingInternalId ? map?.confidence ?? 1 : 1, matchedBy: existingInternalId ? map?.matchedBy ?? "EXISTING_PROVIDER_MAP" : "FPL_TEAM_NAME_EXACT", status: "MATCHED" }
      : { internalId: null, confidence: 0, matchedBy: null, status: "UNMATCHED" };
    teams.set(providerTeamId, mapping);
    const identity = fplTeamEntityIdentity(team);
    entityMaps.push({ ...identity, internalEntityType: "TEAM", internalEntityId: internalId ? String(internalId) : null, confidence: mapping.confidence, matchedBy: mapping.matchedBy, status: mapping.status });
  }
  for (const row of rows) {
    const map = existing.get(`PLAYER:${row.providerPlayerId}:PLAYER`);
    const existingInternalId = map?.status === "MATCHED" ? validBigInt(map.internalEntityId) : null;
    const exactNameCandidates = playerIdsByName.get(normalizeName(row.fullName)) ?? [];
    const exactRosterCandidates = exactNameCandidates.filter((playerId) => {
      const roster = rosterByPlayerId.get(String(playerId)) ?? [];
      const mappedTeam = teams.get(row.providerTeamId)?.internalId;
      return mappedTeam !== null && mappedTeam !== undefined && roster.some((entry) => entry.teamId === mappedTeam && positionMatches(entry.position, row.position));
    });
    const identityFromRoster = exactRosterCandidates.length === 1 ? exactRosterCandidates[0] : null;
    const internalId = existingInternalId ?? identityFromRoster;
    const mapping: FplMapping = internalId
      ? { internalId, confidence: existingInternalId ? map?.confidence ?? 1 : 1, matchedBy: existingInternalId ? map?.matchedBy ?? "EXISTING_PROVIDER_MAP" : "FPL_EXACT_NAME_TEAM_POSITION", status: "MATCHED" }
      : { internalId: null, confidence: 0, matchedBy: null, status: "UNMATCHED" };
    players.set(row.providerPlayerId, mapping);
    const identity = fplPlayerEntityIdentity(row);
    entityMaps.push({ ...identity, internalEntityType: "PLAYER", internalEntityId: internalId ? String(internalId) : null, confidence: mapping.confidence, matchedBy: mapping.matchedBy, status: mapping.status });
  }
  return {
    players,
    teams,
    teamNames: new Map(bootstrap.teams.map((team) => [String(team.id), team.name])),
    entityMaps,
    mappedPlayers: [...players.values()].filter((row) => row.internalId !== null).length,
    mappedTeams: [...teams.values()].filter((row) => row.internalId !== null).length,
    unmatchedPlayers: [...players.values()].filter((row) => row.internalId === null).length,
    unmatchedTeams: [...teams.values()].filter((row) => row.internalId === null).length
  };
}

function fplPriceUpdate(row: FplPriceRow, teamName: string, teamId: bigint | null, playerId: bigint | null, now: Date) {
  return {
    leagueId: FPL_LEAGUE_ID,
    season: FPL_SEASON,
    provider: FPL_PROVIDER,
    teamId,
    playerId,
    playerName: row.playerName,
    normalizedName: row.normalizedName,
    teamName,
    positionLabel: row.position,
    sourceKind: "FPL_BOOTSTRAP_STATIC",
    position: row.position,
    price: row.price,
    selectedByPercent: row.selectedByPercent,
    lastSeenAt: now
  };
}

function positionMatches(position: string | null, fplPosition: string) {
  if (!position) return false;
  const normalized = position.trim().toUpperCase();
  return normalized === fplPosition || (fplPosition === "GK" && ["GKP", "GOALKEEPER"].includes(normalized)) || (fplPosition === "FWD" && ["FW", "FORWARD"].includes(normalized));
}

function hashFplSnapshot(bootstrap: FplBootstrap, fixtures: readonly FplFixture[]) {
  return createHash("sha256").update(JSON.stringify({
    events: bootstrap.events,
    teams: bootstrap.teams,
    elements: bootstrap.elements,
    elementTypes: bootstrap.elementTypes,
    chips: bootstrap.chips,
    gameConfig: bootstrap.gameConfig,
    fixtures
  })).digest("hex");
}

function earliestFplFixtureDate(fixtures: readonly FplFixture[], eventId: number) {
  return fplFixtureDateBoundary(fixtures, eventId, "MIN");
}

function latestFplFixtureDate(fixtures: readonly FplFixture[], eventId: number) {
  return fplFixtureDateBoundary(fixtures, eventId, "MAX");
}

function fplFixtureDateBoundary(fixtures: readonly FplFixture[], eventId: number, direction: "MIN" | "MAX") {
  const values = fixtures
    .filter((fixture) => fixture.event === eventId && fixture.kickoffTime)
    .map((fixture) => fixture.kickoffTime!.getTime());
  if (values.length === 0) return null;
  return new Date(direction === "MIN" ? Math.min(...values) : Math.max(...values));
}

export function fplSnapshotKey(date: Date) {
  const timeZone = "Europe/London";
  const parts = getFplZonedParts(date, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < 1) {
    const previousLocalDay = getFplZonedParts(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12) - 24 * 60 * 60 * 1000), timeZone);
    return `${previousLocalDay.year}-${pad(previousLocalDay.month)}-${pad(previousLocalDay.day)}-1201`;
  }
  const hour = minutes >= 12 * 60 + 1 ? 12 : 0;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}-${pad(hour)}01`;
}

function getFplZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute")
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function validBigInt(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    const id = BigInt(value);
    return id > 0n ? id : null;
  } catch {
    return null;
  }
}
