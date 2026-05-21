import type { PrismaClient } from "@prisma/client";

import { createFotMobClient, FotMobFixtureDetailsUnavailableError, type FotMobClient } from "./fotmob_client";
import type { IngestionScope } from "./ingestion-scope";
import { configForLeague } from "./league-season-policy";
import {
  CORE_SCHEMA_VERSION,
  DEFAULT_PARSER_VERSION,
  FOTMOB_SOURCE,
  asRecord,
  payloadHash,
  sourceIdToBigInt,
  type ParsedMatchPayload,
  type TeamData
} from "./models";
import { normalizeParsedMatchPayloadLinks, type ParsedPayloadDataQuality } from "./payload-normalization";
import { parse_match_metadata, parse_payload } from "./parsers";
import {
  CoreEventRepository,
  CoreIngestionRepository,
  CoreMatchRepository,
  CorePlayerRepository,
  CoreShotRepository,
  CoreStatsRepository,
  CoreTeamRepository,
  RawPayloadRepository
} from "./repositories";
import { validate_ingestion_scope } from "./scope-validation";

export type IngestMatchOptions = {
  client?: FotMobClient;
  parserVersion?: string;
  schemaVersion?: string;
  leagueId?: bigint | string | number | null;
  season?: string | null;
  forceRefresh?: boolean;
  forceReparse?: boolean;
  requireDetailedPayload?: boolean;
};

export type IngestMatchResult = {
  matchId: bigint;
  fetched: boolean;
  skipped: boolean;
  rawPayloadHash?: string;
  shotsParsed: number;
  playerStatsParsed: number;
  teamStatsParsed: number;
  dataQuality: ParsedPayloadDataQuality;
};

const emptyDataQuality: ParsedPayloadDataQuality = {
  repaired: {
    teamStatsTeamIds: 0,
    teamStatsOpponentTeamIds: 0,
    playerStatsTeamIds: 0,
    playerStatsOpponentTeamIds: 0,
    shotTeamIds: 0,
    shotOpponentTeamIds: 0,
    eventTeamIds: 0
  },
  dropped: {
    teamStats: 0,
    playerStats: 0
  }
};

export async function ingest_match(prisma: PrismaClient, match_id: bigint | string | number, options: IngestMatchOptions = {}): Promise<IngestMatchResult> {
  const matchId = sourceIdToBigInt(match_id, "match");
  if (!matchId) throw new Error("match_id is required.");

  const matchRepository = new CoreMatchRepository(prisma);
  const rawRepository = new RawPayloadRepository(prisma);
  const [existingMatch, existingRaw] = await Promise.all([matchRepository.find(matchId), rawRepository.find(matchId)]);

  if (options.forceReparse && existingRaw) {
    return reparse_match(prisma, matchId, options.parserVersion ?? DEFAULT_PARSER_VERSION);
  }

  if (!options.forceRefresh && existingMatch?.finished && existingRaw?.isFinal && hasDetailedMatchPayload(existingRaw.payload)) {
    return {
      matchId,
      fetched: false,
      skipped: true,
      rawPayloadHash: existingRaw.payloadHash,
      shotsParsed: 0,
      playerStatsParsed: 0,
      teamStatsParsed: 0,
      dataQuality: emptyDataQuality
    };
  }

  const client = options.client ?? createFotMobClient();
  let details: Awaited<ReturnType<FotMobClient["getFixtureDetails"]>>;
  try {
    details = await client.getFixtureDetails(String(match_id));
  } catch (error) {
    if (error instanceof FotMobFixtureDetailsUnavailableError) {
      if (options.requireDetailedPayload) {
        throw new Error(
          `${error.message}. This ingestion scope requires detailed match payloads, so the job is failing instead of creating a misleading partial database.`
        );
      }
      console.warn(`[core_data] ${error.message}; skipping matchDetails fetch until FotMob exposes a usable payload.`);
      return {
        matchId,
        fetched: false,
        skipped: true,
        shotsParsed: 0,
        playerStatsParsed: 0,
        teamStatsParsed: 0,
        dataQuality: emptyDataQuality
      };
    }
    throw error;
  }

  return persist_match_payload(prisma, details, {
    ...options,
    matchId,
    fetched: true
  });
}

export async function discover_matches_for_scope(client: FotMobClient, scope: IngestionScope) {
  const fixtures = await client.getFixtures(String(scope.league_id), scope.season);
  const discovered = fixtures.filter((fixture) => {
    if (fixture.status === "FINISHED") return scope.include_finished;
    if (fixture.status === "LIVE") return scope.include_live;
    return scope.include_upcoming;
  });
  validate_ingestion_scope(scope, discovered);
  return discovered;
}

export async function ingest_scope(
  prisma: PrismaClient,
  scope: IngestionScope,
  options: { client?: FotMobClient; parserVersion?: string; schemaVersion?: string; onMatchStart?: (matchId: bigint) => Promise<void> | void } = {}
) {
  const client = options.client ?? createFotMobClient();
  const fixtures = await discover_matches_for_scope(client, scope);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  const affectedMatchIds: bigint[] = [];

  for (const fixture of fixtures) {
    const matchId = sourceIdToBigInt(fixture.id, "match");
    if (!matchId) continue;
    await options.onMatchStart?.(matchId);
    try {
      await upsertDiscoveredFixture(prisma, fixture, BigInt(scope.league_id), scope.season);
      const result = await ingest_match(prisma, fixture.id, {
        client,
        leagueId: scope.league_id,
        season: scope.season,
        parserVersion: options.parserVersion,
        schemaVersion: options.schemaVersion,
            forceRefresh: scope.force_refresh,
            forceReparse: scope.force_reparse,
            requireDetailedPayload: scope.require_detailed_payloads
          });
      if (result.skipped) skipped += 1;
      else fetched += result.fetched ? 1 : 0;
      if (!result.skipped) affectedMatchIds.push(result.matchId);
    } catch (error) {
      failed += 1;
      console.warn(`[core_data] Match ingestion failed for ${fixture.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    scope,
    matchesDiscovered: fixtures.length,
    fetched,
    skipped,
    failed,
    affectedMatchIds
  };
}

export async function persist_match_payload(
  prisma: PrismaClient,
  payload: unknown,
  options: IngestMatchOptions & { matchId?: bigint | null; fetched?: boolean } = {}
): Promise<IngestMatchResult> {
  const canonicalPayload = canonicalMatchPayload(payload);
  const parsed = parse_payload(canonicalPayload);
  const matchId = options.matchId ?? parsed.match.id;
  if (!matchId || matchId === 0n) throw new Error("FotMob match payload does not contain a usable match id.");

  const overrideLeagueId = sourceIdToBigInt(options.leagueId, "league");
  const enriched: ParsedMatchPayload = {
    ...parsed,
    leagues: ensureScopeLeague(parsed.leagues, overrideLeagueId),
    match: {
      ...parsed.match,
      id: matchId,
      leagueId: overrideLeagueId ?? parsed.match.leagueId,
      season: parsed.match.season ?? options.season ?? null
    },
    teamStats: parsed.teamStats.map((row) => ({ ...row, matchId })),
    playerStats: parsed.playerStats.map((row) => ({ ...row, matchId })),
    events: parsed.events.map((row) => ({ ...row, matchId })),
    shots: parsed.shots.map((row) => ({ ...row, matchId }))
  };

  const normalized = normalizeParsedMatchPayloadLinks(enriched);
  await upsertParsedPayload(prisma, normalized.parsed);

  const rawPayloadHash = payloadHash(canonicalPayload);
  await new RawPayloadRepository(prisma).upsert({
    matchId,
    payload: canonicalPayload,
    payloadHash: rawPayloadHash,
    parserVersion: options.parserVersion ?? DEFAULT_PARSER_VERSION,
    schemaVersion: options.schemaVersion ?? CORE_SCHEMA_VERSION,
    isFinal: enriched.match.finished && hasDetailedMatchPayload(canonicalPayload)
  });

  await invalidate_shotmap_cache_for_match(prisma, matchId);

  return {
    matchId,
    fetched: options.fetched ?? false,
    skipped: false,
    rawPayloadHash,
    shotsParsed: normalized.parsed.shots.length,
    playerStatsParsed: normalized.parsed.playerStats.length,
    teamStatsParsed: normalized.parsed.teamStats.length,
    dataQuality: normalized.dataQuality
  };
}

export async function reparse_match(prisma: PrismaClient, match_id: bigint | string | number, parser_version = DEFAULT_PARSER_VERSION) {
  const matchId = sourceIdToBigInt(match_id, "match");
  if (!matchId) throw new Error("match_id is required.");

  const raw = await new RawPayloadRepository(prisma).find(matchId);
  if (!raw) throw new Error(`No raw FotMob payload stored for match ${String(match_id)}.`);
  const existingMatch = await new CoreMatchRepository(prisma).find(matchId);

  const result = await persist_match_payload(prisma, raw.payload, {
    matchId,
    leagueId: existingMatch?.leagueId ?? undefined,
    season: existingMatch?.season ?? undefined,
    parserVersion: parser_version,
    schemaVersion: raw.schemaVersion ?? CORE_SCHEMA_VERSION,
    fetched: false
  });

  return {
    ...result,
    fetched: false
  };
}

export async function backfill_league_season(
  prisma: PrismaClient,
  league_id: bigint | string | number,
  season: string,
  options: { client?: FotMobClient; parserVersion?: string; schemaVersion?: string } = {}
) {
  const leagueId = sourceIdToBigInt(league_id, "league");
  if (!leagueId) throw new Error("league_id is required.");

  const client = options.client ?? createFotMobClient();
  const ingestionRepository = new CoreIngestionRepository(prisma);
  const run = await ingestionRepository.createRun({ jobType: "BACKFILL_LEAGUE_SEASON", leagueId, season });
  let matchesFetched = 0;
  let matchesSkipped = 0;
  let matchesFailed = 0;

  try {
    const scope = {
      source: "fotmob" as const,
      league_id: Number(league_id),
      season,
      date_from: null,
      date_to: null,
      include_finished: true,
      include_live: false,
      include_upcoming: false,
      max_matches: null,
      force_refresh: false,
      force_reparse: false,
      require_detailed_payloads: false
    };
    const fixtures = await discover_matches_for_scope(client, scope);
    await new CoreMatchRepository(prisma).upsertLeague({
      id: leagueId,
      name: `FotMob league ${String(league_id)}`,
      country: null,
      rawRef: String(league_id)
    });

    for (const fixture of fixtures) {
      await upsertDiscoveredFixture(prisma, fixture, leagueId, season);
    }

    for (const fixture of fixtures) {
      try {
        const result = await ingest_match(prisma, fixture.id, {
          client,
          leagueId,
          season,
          parserVersion: options.parserVersion,
          schemaVersion: options.schemaVersion
        });

        if (result.skipped) matchesSkipped += 1;
        else if (result.fetched) matchesFetched += 1;

        await ingestionRepository.upsertCheckpoint({
          jobType: "BACKFILL_LEAGUE_SEASON",
          leagueId,
          season,
          lastProcessedMatchId: result.matchId,
          lastProcessedDate: new Date(),
          cursor: { match_id: fixture.id }
        });
      } catch (error) {
        matchesFailed += 1;
        console.warn(`[core_data] Backfill failed for match ${fixture.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    await ingestionRepository.updateRun(run.id, {
      status: matchesFailed > 0 ? "COMPLETED_WITH_ERRORS" : "SUCCEEDED",
      finishedAt: new Date(),
      matchesDiscovered: fixtures.length,
      matchesFetched,
      matchesSkipped,
      matchesFailed
    });

    return {
      runId: run.id,
      matchesDiscovered: fixtures.length,
      matchesFetched,
      matchesSkipped,
      matchesFailed
    };
  } catch (error) {
    await ingestionRepository.updateRun(run.id, {
      status: "ERROR",
      finishedAt: new Date(),
      matchesFetched,
      matchesSkipped,
      matchesFailed,
      errorMessage: error instanceof Error ? error.message : "Unknown backfill error"
    });
    throw error;
  }
}

async function upsertParsedPayload(prisma: PrismaClient, parsed: ParsedMatchPayload) {
  const matchRepository = new CoreMatchRepository(prisma);
  const teamRepository = new CoreTeamRepository(prisma);
  const playerRepository = new CorePlayerRepository(prisma);
  const statsRepository = new CoreStatsRepository(prisma);

  for (const league of parsed.leagues) {
    await matchRepository.upsertLeague(league);
  }
  await matchRepository.ensureLeaguePlaceholders(missingReferencedLeagueIds(parsed));
  await teamRepository.upsertMany(parsed.teams);
  await teamRepository.ensurePlaceholders(missingReferencedTeamIds(parsed));
  await playerRepository.upsertMany(parsed.players);
  await playerRepository.ensurePlaceholders(missingReferencedPlayerIds(parsed));
  await matchRepository.upsert(parsed.match);
  await upsertMatchDerivedSeasonLinks(prisma, parsed);
  await statsRepository.upsertTeamStats(parsed.teamStats);
  await statsRepository.upsertPlayerStats(parsed.playerStats);
  await new CoreEventRepository(prisma).replaceMatchEvents(parsed.match.id, parsed.events);
  await new CoreShotRepository(prisma).upsertShots(parsed.shots);
}

async function upsertMatchDerivedSeasonLinks(prisma: PrismaClient, parsed: ParsedMatchPayload) {
  const leagueId = parsed.match.leagueId;
  const season = parsed.match.season;
  if (!leagueId || !season) return;

  await prisma.leagueSeason.upsert({
    where: {
      leagueId_season: {
        leagueId,
        season
      }
    },
    update: {
      source: FOTMOB_SOURCE
    },
    create: {
      leagueId,
      season,
      source: FOTMOB_SOURCE,
      calendarType: null,
      isCurrent: false,
      providerSeason: season,
      name: null,
      country: null,
      metadata: { derived_from_match_payload: true }
    }
  });

  const now = new Date();
  const teamIds = uniqueBigints([
    parsed.match.homeTeamId,
    parsed.match.awayTeamId,
    ...parsed.teamStats.flatMap((row) => [row.teamId, row.opponentTeamId]),
    ...parsed.playerStats.flatMap((row) => [row.teamId, row.opponentTeamId])
  ].filter((teamId): teamId is bigint => teamId !== null && teamId !== undefined && teamId > 0n));

  for (const teamId of teamIds) {
    await prisma.leagueSeasonTeam.upsert({
      where: {
        leagueId_season_teamId: {
          leagueId,
          season,
          teamId
        }
      },
      update: {
        active: true,
        lastSeenAt: now
      },
      create: {
        leagueId,
        season,
        teamId,
        source: FOTMOB_SOURCE,
        active: true,
        firstSeenAt: now,
        lastSeenAt: now,
        metadata: { derived_from_match_payload: true }
      }
    });
  }

  const seenPlayerTeams = new Set<string>();
  for (const row of parsed.playerStats) {
    if (!row.teamId || row.teamId <= 0n || !row.playerId || row.playerId <= 0n) continue;
    const key = `${row.teamId}:${row.playerId}`;
    if (seenPlayerTeams.has(key)) continue;
    seenPlayerTeams.add(key);
    await prisma.teamPlayerSeason.upsert({
      where: {
        leagueId_season_teamId_playerId: {
          leagueId,
          season,
          teamId: row.teamId,
          playerId: row.playerId
        }
      },
      update: {
        active: true,
        lastSeenAt: now
      },
      create: {
        leagueId,
        season,
        teamId: row.teamId,
        playerId: row.playerId,
        source: FOTMOB_SOURCE,
        active: true,
        position: row.position,
        shirtNumber: row.shirtNumber,
        nationality: null,
        age: null,
        photoUrl: null,
        firstSeenAt: now,
        lastSeenAt: now,
        rosterPayload: { derived_from_match_payload: true }
      }
    });
  }
}

function missingReferencedLeagueIds(parsed: ParsedMatchPayload) {
  const knownLeagueIds = new Set(parsed.leagues.map((league) => String(league.id)));
  return uniqueBigints([parsed.match.leagueId].filter((leagueId): leagueId is bigint => leagueId !== null && leagueId !== undefined && leagueId > 0n)).filter(
    (leagueId) => !knownLeagueIds.has(String(leagueId))
  );
}

function missingReferencedTeamIds(parsed: ParsedMatchPayload) {
  const knownTeamIds = new Set(parsed.teams.map((team) => String(team.id)));
  return referencedTeamIds(parsed).filter((teamId) => !knownTeamIds.has(String(teamId)));
}

function referencedTeamIds(parsed: ParsedMatchPayload) {
  return uniqueBigints([
    ...parsed.teams.map((team) => team.id),
    parsed.match.homeTeamId,
    parsed.match.awayTeamId,
    ...parsed.teamStats.flatMap((row) => [row.teamId, row.opponentTeamId]),
    ...parsed.playerStats.flatMap((row) => [row.teamId, row.opponentTeamId]),
    ...parsed.events.map((row) => row.teamId),
    ...parsed.shots.flatMap((row) => [row.teamId, row.opponentTeamId])
  ].filter((teamId): teamId is bigint => teamId !== null && teamId !== undefined && teamId > 0n));
}

function missingReferencedPlayerIds(parsed: ParsedMatchPayload) {
  const knownPlayerIds = new Set(parsed.players.map((player) => String(player.id)));
  return referencedPlayerIds(parsed).filter((playerId) => !knownPlayerIds.has(String(playerId)));
}

function referencedPlayerIds(parsed: ParsedMatchPayload) {
  return uniqueBigints([
    ...parsed.players.map((player) => player.id),
    ...parsed.playerStats.map((row) => row.playerId),
    ...parsed.events.flatMap((row) => [row.playerId, row.relatedPlayerId]),
    ...parsed.shots.map((row) => row.playerId)
  ].filter((playerId): playerId is bigint => playerId !== null && playerId !== undefined && playerId > 0n));
}

async function upsertDiscoveredFixture(
  prisma: PrismaClient,
  fixture: { id: string; leagueId: string; homeTeamId: string; awayTeamId: string; kickoffAt: string; status: string; homeScore?: number; awayScore?: number },
  leagueId: bigint,
  season: string
) {
  await new CoreMatchRepository(prisma).upsertLeague(scopeLeagueData(leagueId));
  const teamRepository = new CoreTeamRepository(prisma);
  const teams = [fixture.homeTeamId, fixture.awayTeamId]
    .map((teamId) => placeholderTeam(teamId))
    .filter((team): team is TeamData => team !== null);
  await teamRepository.upsertMany(teams);

  const match = parse_match_metadata(fixture);
  await new CoreMatchRepository(prisma).upsert({
    ...match,
    leagueId,
    season,
    status: fixture.status,
    finished: fixture.status === "FINISHED",
    started: fixture.status === "FINISHED" || fixture.status === "LIVE",
    homeScore: fixture.homeScore ?? null,
    awayScore: fixture.awayScore ?? null
  });
}

function ensureScopeLeague(leagues: ParsedMatchPayload["leagues"], leagueId: bigint | null) {
  if (!leagueId || leagues.some((league) => league.id === leagueId)) return leagues;
  return [scopeLeagueData(leagueId), ...leagues];
}

function scopeLeagueData(leagueId: bigint) {
  const config = configForLeague(Number(leagueId));
  return {
    id: leagueId,
    name: config?.name ?? `FotMob league ${String(leagueId)}`,
    country: null,
    rawRef: String(leagueId)
  };
}

async function invalidate_shotmap_cache_for_match(prisma: PrismaClient, matchId: bigint) {
  const cacheRows = await prisma.shotmapComparisonsCache.findMany({
    select: {
      cacheKey: true,
      sourceMatchIds: true
    }
  });
  const matchIdStrings = new Set([String(matchId), matchId.toString()]);
  const staleKeys = cacheRows
    .filter((row) => jsonArray(row.sourceMatchIds).some((value) => matchIdStrings.has(String(value))))
    .map((row) => row.cacheKey);

  if (staleKeys.length > 0) {
    await prisma.shotmapComparisonsCache.deleteMany({
      where: {
        cacheKey: { in: staleKeys }
      }
    });
  }
}

function placeholderTeam(teamId: string | number | bigint | null | undefined): TeamData | null {
  const id = sourceIdToBigInt(teamId, "team");
  if (!id) return null;
  return {
    id,
    name: `FotMob team ${String(teamId)}`,
    country: null,
    ccode: null,
    rawRef: String(teamId)
  };
}

function canonicalMatchPayload(payload: unknown) {
  const record = asRecord(payload);
  const raw = asRecord(record.raw);
  return Object.keys(raw).length > 0 ? raw : payload;
}

function hasDetailedMatchPayload(payload: unknown) {
  const content = asRecord(asRecord(payload).content);
  return ["playerStats", "shotmap", "lineup", "stats", "matchFacts"].some((key) => content[key] !== undefined);
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function uniqueBigints(values: bigint[]) {
  const seen = new Set<string>();
  const result: bigint[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
