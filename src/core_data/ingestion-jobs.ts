import { Prisma, type IngestionJob, type PrismaClient } from "@prisma/client";

import { FantasyPointsRepository } from "@/machete/fantasy_repositories";
import { calculate_fantasy_points_for_match } from "@/machete/fantasy_points_engine";

import { createFotMobClient, type FotMobClient } from "./fotmob_client";
import {
  ingest_match,
  discover_matches_for_scope,
  fixtureRequiresDetailedPayload,
  reparse_match,
  upsert_discovered_fixture,
  type IngestMatchResult
} from "./ingestion";
import type { IngestionScope } from "./ingestion-scope";
import { canonicalLeagueIdForIdentity, dedupeAliases, expandScopesWithAliases, parseLeagueAliases, scopeCanonicalLeagueId, type LeagueAlias } from "./league-aliases";
import {
  enabledLeagueIngestionConfigs,
  configForLeague,
  INITIAL_BACKFILL_SEASON_WINDOW,
  scopesForCurrentSeasonLeagueBackfill,
  scopesForInitialBackfill,
  scopesForIncrementalUpdate,
  type LeagueIngestionConfig
} from "./league-season-policy";
import { sourceIdToBigInt } from "./models";
import { mergeDataQualityTotals } from "./payload-normalization";
import { CoreIngestionRepository } from "./repositories";
import { resolveProviderCurrentSeason, sync_league_season_rosters } from "./season-rosters";
import { ScopeTooBroadError } from "./scope-validation";

const activeStatuses = ["pending", "running"];
type IngestionJobType = "initial_backfill" | "incremental_update";
export type InitialBackfillMode = "current_league_47" | "full";

const defaultRuleset = {
  name: "Machete project fantasy model",
  version: "2025/26",
  rules: {
    engine: "project_fantasy_model",
    model_source: "MACHETE"
  }
};

type StartJobInput = {
  startedByUserId?: string | null;
  client?: FotMobClient;
  mode?: InitialBackfillMode;
  targetLeagueIds?: readonly number[];
};

type RunJobInput = {
  client?: FotMobClient;
};

export async function getIngestionAdminStatus(prisma: PrismaClient) {
  const [activeJob, latestCompletedInitialBackfills, latestJob] = await Promise.all([
    prisma.ingestionJob.findFirst({
      where: { status: { in: activeStatuses } },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.ingestionJob.findMany({
      where: { jobType: "initial_backfill", status: "completed" },
      orderBy: { finishedAt: "desc" },
      take: 100
    }),
    prisma.ingestionJob.findFirst({
      orderBy: { updatedAt: "desc" }
    })
  ]);
  const latestInitialBackfill = latestCompletedInitialBackfills.find((job) => backfillModeFromMetadata(job.metadata) === "full") ?? null;
  const configs = enabledLeagueIngestionConfigs();
  const initialScopes = await scopesForInitialBackfillMode(prisma, "full");

  return {
    initial_backfill_completed: Boolean(latestInitialBackfill),
    initial_backfill_completed_at: latestInitialBackfill?.finishedAt ?? null,
    total_configured_leagues: configs.length,
    total_configured_scopes: initialScopes.length,
    active_job: activeJob ? serializeIngestionJob(activeJob) : null,
    latest_job: latestJob ? serializeIngestionJob(latestJob) : null,
    latest_initial_backfill: latestInitialBackfill ? serializeIngestionJob(latestInitialBackfill) : null,
    start_seasons: {
      season_window: INITIAL_BACKFILL_SEASON_WINDOW,
      mode: "last_n_seasons",
      uefa_club_tournaments: "current_season_only"
    }
  };
}

export async function start_initial_backfill(prisma: PrismaClient, input: StartJobInput) {
  const mode = input.mode ?? "full";
  const scopes = await scopesForInitialBackfillMode(prisma, mode);
  const result = await createLockedJob(prisma, {
    jobType: "initial_backfill",
    data: {
      jobType: "initial_backfill",
      status: "pending",
      startedByUserId: input.startedByUserId ?? null,
      startedAt: new Date(),
      totalScopes: scopes.length,
      metadata: jsonValue({
        backfill_mode: mode,
        start_seasons: {
          season_window: mode === "current_league_47" ? 1 : INITIAL_BACKFILL_SEASON_WINDOW,
          mode: mode === "current_league_47" ? "current_league_47_current_season" : "last_n_seasons",
          uefa_club_tournaments: "current_season_only"
        }
      })
    }
  });

  if (!result.started) return { job: serializeIngestionJob(result.job), started: false };

  return { job: serializeIngestionJob(result.job), started: true };
}

export async function run_incremental_update(prisma: PrismaClient, input: StartJobInput) {
  const completedInitialBackfills = await prisma.ingestionJob.findMany({
    where: { jobType: "initial_backfill", status: "completed" },
    select: { id: true, metadata: true },
    orderBy: { finishedAt: "desc" },
    take: 100
  });
  const completedInitialBackfill = completedInitialBackfills.find((job) => backfillModeFromMetadata(job.metadata) === "full") ?? null;
  if (!completedInitialBackfill) {
    throw new Error("Initial backfill must complete before incremental updates.");
  }

  const client = input.client ?? createFotMobClient();
  const targetLeagueIds = normalizeTargetLeagueIds(input.targetLeagueIds);
  const scopes = await buildIncrementalScopes(prisma, client, targetLeagueIds);
  const result = await createLockedJob(prisma, {
    jobType: "incremental_update",
    data: {
      jobType: "incremental_update",
      status: "pending",
      startedByUserId: input.startedByUserId ?? null,
      startedAt: new Date(),
      totalScopes: scopes.length,
      metadata: jsonValue({
        incremental_only: true,
        ...(targetLeagueIds ? { target_league_ids: targetLeagueIds } : {})
      })
    }
  });

  if (!result.started) return { job: serializeIngestionJob(result.job), started: false };

  return { job: serializeIngestionJob(result.job), started: true };
}

export async function run_next_ingestion_job(prisma: PrismaClient, input: RunJobInput = {}) {
  const job = await runningJob(prisma);
  if (!job) return { job: null, ran: false };
  if (!canCurrentWorkerRunJob(job, input)) return { job: serializeIngestionJob(job), ran: false };

  return run_ingestion_job_by_id(prisma, job.id, input);
}

export async function run_ingestion_job_by_id(prisma: PrismaClient, jobId: string, input: RunJobInput = {}) {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) return { job: null, ran: false };
  if (!activeStatuses.includes(job.status)) return { job: serializeIngestionJob(job), ran: false };
  if (!canCurrentWorkerRunJob(job, input)) return { job: serializeIngestionJob(job), ran: false };

  const client = input.client ?? createFotMobClient();
  const scopes = await scopesForJob(prisma, job, client);
  await runIngestionJob(prisma, job.id, job.jobType as IngestionJobType, scopes, client);

  const updatedJob = await prisma.ingestionJob.findUnique({ where: { id: job.id } });
  return { job: updatedJob ? serializeIngestionJob(updatedJob) : null, ran: true };
}

export async function cancel_running_ingestion(prisma: PrismaClient) {
  const job = await runningJob(prisma);
  if (!job) return { job: null, cancelled: false };

  const cancelledJob = await prisma.ingestionJob.update({
    where: { id: job.id },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
      metadata: mergeMetadata(job.metadata, { cancel_requested: true })
    }
  });

  return { job: serializeIngestionJob(cancelledJob), cancelled: true };
}

export function serializeIngestionJob(job: IngestionJob) {
  return {
    id: job.id,
    job_type: job.jobType,
    status: job.status,
    started_by_user_id: job.startedByUserId,
    started_at: job.startedAt?.toISOString() ?? null,
    finished_at: job.finishedAt?.toISOString() ?? null,
    total_scopes: job.totalScopes,
    processed_scopes: job.processedScopes,
    total_matches: job.totalMatches,
    fetched_matches: job.fetchedMatches,
    skipped_matches: job.skippedMatches,
    failed_matches: job.failedMatches,
    current_league_id: job.currentLeagueId === null ? null : String(job.currentLeagueId),
    current_season: job.currentSeason,
    current_match_id: job.currentMatchId === null ? null : String(job.currentMatchId),
    error_message: job.errorMessage,
    metadata: job.metadata
  };
}

async function runIngestionJob(prisma: PrismaClient, jobId: string, jobType: IngestionJobType, scopes: IngestionScope[], client: FotMobClient) {
  const ingestionRepository = new CoreIngestionRepository(prisma);
  const ruleset = await new FantasyPointsRepository(prisma).createRuleset(defaultRuleset);
  const jobSnapshot = await prisma.ingestionJob.findUnique({
    where: { id: jobId },
    select: { status: true, metadata: true, processedScopes: true, startedAt: true }
  });
  if (!jobSnapshot || jobSnapshot.status === "cancelled") return;

  let jobMetadata: Prisma.JsonValue = jobSnapshot?.metadata ?? {};
  const mergeJobMetadata = (next: Record<string, unknown>) => {
    const merged = mergeMetadata(jobMetadata, next);
    jobMetadata = merged as Prisma.JsonValue;
    return merged;
  };
  let processedScopes = Math.max(0, jobSnapshot.processedScopes ?? 0);
  let hasScopeErrors = metadataBoolean(metadataRecord(jobMetadata), "has_scope_errors") ?? false;
  const canonicalLeagueIdsWithAliases = new Set(
    scopes
      .filter((scope) => scope.canonical_league_id && scope.canonical_league_id !== scope.league_id)
      .map((scope) => scope.canonical_league_id)
  );

  try {
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: jobSnapshot.startedAt ?? new Date()
      }
    });

    console.info(`[ingestion] Running ${jobType} job ${jobId} from scope ${processedScopes + 1}/${scopes.length}.`);

    for (let scopeIndex = processedScopes; scopeIndex < scopes.length; scopeIndex += 1) {
      const scope = scopes[scopeIndex];
      const canonicalLeagueId = scopeCanonicalLeagueId(scope);
      const isAliasScope = canonicalLeagueId !== scope.league_id;
      const hasAliasScopeForCanonical = canonicalLeagueIdsWithAliases.has(canonicalLeagueId);
      if (await isCancelled(prisma, jobId)) return;

      const scopeOrdinal = scopeIndex + 1;
      const currentMetadata = metadataRecord(jobMetadata);
      const isResumingSameScope = metadataNumber(currentMetadata, "current_scope_index") === scopeOrdinal;
      const knownScopeTotal = isResumingSameScope ? metadataNumber(currentMetadata, "current_scope_total_matches") : null;
      const knownScopeProcessed = isResumingSameScope ? metadataNumber(currentMetadata, "current_scope_processed_matches") ?? 0 : 0;
      // A resumed scope is replayed from the beginning. Its previous attempt
      // must not poison the replacement result after the underlying failure is fixed.
      let scopeFixtureFailures = 0;
      let rosterSynced = false;

      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          currentLeagueId: BigInt(scope.league_id),
          currentSeason: scope.season,
          currentMatchId: null,
          metadata: mergeJobMetadata({
            current_scope_index: scopeOrdinal,
            current_scope_source_league_id: scope.league_id,
            current_scope_canonical_league_id: canonicalLeagueId,
            current_scope_total_matches: knownScopeTotal,
            current_scope_processed_matches: knownScopeProcessed,
            current_scope_fixture_failures: scopeFixtureFailures,
            current_scope_roster_synced: null,
            current_scope_status: "syncing_rosters"
          })
        }
      });

      console.info(
        `[ingestion] Scope ${scopeOrdinal}/${scopes.length}: league ${scope.league_id}${
          isAliasScope ? ` -> ${canonicalLeagueId}` : ""
        }, season ${scope.season}.`
      );

      try {
        console.info(`[ingestion] Scope ${scopeOrdinal}/${scopes.length}: syncing rosters.`);
        await sync_league_season_rosters(prisma, client, {
          leagueId: scope.league_id,
          canonicalLeagueId,
          season: scope.season,
          isCurrent: jobType === "incremental_update",
          deactivateMissing: !hasAliasScopeForCanonical
        });
        rosterSynced = true;
        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: { metadata: mergeJobMetadata({ current_scope_roster_synced: true }) }
        });
        console.info(`[ingestion] Scope ${scopeOrdinal}/${scopes.length}: rosters synced.`);
      } catch (error) {
        hasScopeErrors = true;
        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: {
            errorMessage: error instanceof Error ? error.message : "Unknown roster sync error",
            metadata: mergeJobMetadata({
              has_scope_errors: true,
              current_scope_roster_synced: false
            })
          }
        });
      }

      console.info(`[ingestion] Scope ${scopeOrdinal}/${scopes.length}: discovering fixtures.`);
      const discoveredMatches = await discover_matches_for_scope(client, scope);
      console.info(`[ingestion] Scope ${scopeOrdinal}/${scopes.length}: discovered ${discoveredMatches.length} fixtures.`);
      const shouldIncrementTotalMatches = !isResumingSameScope || knownScopeTotal === null;
      // Fixture lists can be inserted, removed, or reordered between attempts.
      // Re-run the idempotent scope from the start instead of treating an old
      // ordinal as a stable cursor and silently skipping a newly inserted id.
      let currentScopeProcessedMatches = 0;
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          ...(shouldIncrementTotalMatches ? { totalMatches: { increment: discoveredMatches.length } } : {}),
          metadata: mergeJobMetadata({
            current_scope_total_matches: discoveredMatches.length,
            current_scope_processed_matches: currentScopeProcessedMatches,
            current_scope_status: "ingesting_matches"
          })
        }
      });

      for (const fixture of discoveredMatches) {
        if (await isCancelled(prisma, jobId)) return;

        const matchId = sourceIdToBigInt(fixture.id, "match");
        if (!matchId) continue;

        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: {
            currentLeagueId: BigInt(scope.league_id),
            currentSeason: scope.season,
            currentMatchId: matchId
          }
        });

        try {
          if (currentScopeProcessedMatches === 0 || (currentScopeProcessedMatches + 1) % 25 === 0) {
            console.info(
              `[ingestion] Scope ${scopeOrdinal}/${scopes.length}: fetching match ${currentScopeProcessedMatches + 1}/${discoveredMatches.length} (${fixture.id}).`
            );
          }
          await upsert_discovered_fixture(prisma, fixture, BigInt(canonicalLeagueId), scope.season);
          if (!fixtureRequiresDetailedPayload(fixture)) {
            await prisma.ingestionJob.update({
              where: { id: jobId },
              data: {
                metadata: mergeJobMetadata({
                  current_scope_processed_matches: ++currentScopeProcessedMatches,
                  fixture_only_matches: (metadataNumber(metadataRecord(jobMetadata), "fixture_only_matches") ?? 0) + 1
                })
              }
            });
            await ingestionRepository.upsertCheckpoint({
              jobType,
              leagueId: BigInt(scope.league_id),
              season: scope.season,
              lastProcessedMatchId: matchId,
              lastProcessedDate: new Date(),
              cursor: { match_id: fixture.id }
            });
            continue;
          }
          const result = await ingest_match(prisma, fixture.id, {
            client,
            leagueId: canonicalLeagueId,
            season: scope.season,
            forceRefresh: scope.force_refresh,
            forceReparse: scope.force_reparse,
            requireDetailedPayload: scope.require_detailed_payloads
          });
          const shouldCalculateFantasy = await ensureNormalizedForFantasy(prisma, result, ruleset.id);
          if (shouldCalculateFantasy) {
            await calculate_fantasy_points_for_match(prisma, result.matchId, ruleset.id);
          }
          await prisma.ingestionJob.update({
            where: { id: jobId },
            data: {
              ...(result.skipped ? { skippedMatches: { increment: 1 } } : { fetchedMatches: { increment: result.fetched ? 1 : 0 } }),
              metadata: mergeJobMetadata({
                current_scope_processed_matches: ++currentScopeProcessedMatches,
                data_quality: mergeDataQualityTotals(metadataRecord(jobMetadata).data_quality, result.dataQuality)
              })
            }
          });
          if (currentScopeProcessedMatches % 25 === 0 || currentScopeProcessedMatches === discoveredMatches.length) {
            console.info(
              `[ingestion] Scope ${scopeOrdinal}/${scopes.length}: ${currentScopeProcessedMatches}/${discoveredMatches.length} matches processed.`
            );
          }
          await ingestionRepository.upsertCheckpoint({
            jobType,
            leagueId: BigInt(scope.league_id),
            season: scope.season,
            lastProcessedMatchId: result.matchId,
            lastProcessedDate: new Date(),
            cursor: { match_id: fixture.id }
          });
        } catch (error) {
          scopeFixtureFailures += 1;
          hasScopeErrors = true;
          console.error(
            `[ingestion] Scope ${scopeOrdinal}/${scopes.length}: match ${fixture.id} failed: ${
              error instanceof Error ? error.message : "Unknown match ingestion error"
            }`
          );
          await prisma.ingestionJob.update({
            where: { id: jobId },
            data: {
              failedMatches: { increment: 1 },
              errorMessage: error instanceof Error ? error.message : "Unknown match ingestion error",
              metadata: mergeJobMetadata({
                current_scope_processed_matches: ++currentScopeProcessedMatches,
                current_scope_fixture_failures: scopeFixtureFailures,
                has_scope_errors: true
              })
            }
          });
          if (scope.require_detailed_payloads) throw error;
        }
      }

      processedScopes = scopeIndex + 1;
      const minimumMatches = scope.league_id === canonicalLeagueId
        ? configForLeague(canonicalLeagueId)?.minimum_matches ?? 1
        : 1;
      const discoveryComplete = discoveredMatches.length >= minimumMatches;
      if (!discoveryComplete) hasScopeErrors = true;
      const scopeStatus = rosterSynced && scopeFixtureFailures === 0 && discoveryComplete ? "completed" : "completed_with_errors";
      const completedScopes = upsertCompletedScope(metadataRecord(jobMetadata).completed_scopes, {
        source_league_id: scope.league_id,
        canonical_league_id: canonicalLeagueId,
        season: scope.season,
        status: scopeStatus,
        roster_synced: rosterSynced,
        fixture_failures: scopeFixtureFailures,
        fixtures_discovered: discoveredMatches.length,
        upcoming_fixtures_discovered: discoveredMatches.filter((fixture) => fixture.status === "SCHEDULED").length,
        fixture_ids: discoveredMatches.map((fixture) => String(fixture.id)),
        upcoming_fixture_ids: discoveredMatches
          .filter((fixture) => fixture.status === "SCHEDULED")
          .map((fixture) => String(fixture.id)),
        minimum_fixtures_required: minimumMatches,
        finished_at: new Date().toISOString()
      });
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          processedScopes,
          currentMatchId: null,
          metadata: mergeJobMetadata({
            current_scope_index: null,
            current_scope_total_matches: null,
            current_scope_processed_matches: null,
            current_scope_fixture_failures: null,
            current_scope_roster_synced: null,
            completed_scopes: completedScopes,
            has_scope_errors: hasScopeErrors,
            current_scope_status: "between_scopes"
          }),
          ...(!discoveryComplete
            ? { errorMessage: `League ${canonicalLeagueId} / ${scope.season} returned ${discoveredMatches.length} fixtures; minimum ${minimumMatches} required.` }
            : {})
        }
      });
      console.info(`[ingestion] Scope ${scopeOrdinal}/${scopes.length} completed.`);
    }

    const completedCanonicalScopes = aggregateCompletedCanonicalScopes(scopes, metadataRecord(jobMetadata).completed_scopes);
    const finalHasScopeErrors = completedCanonicalScopes.some((scope) => scope.status !== "completed");
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: finalHasScopeErrors ? "completed_with_errors" : "completed",
        finishedAt: new Date(),
        currentLeagueId: null,
        currentSeason: null,
        currentMatchId: null,
        metadata: mergeJobMetadata({
          current_scope_index: null,
          current_scope_total_matches: null,
          current_scope_processed_matches: null,
          current_scope_status: "completed",
          has_scope_errors: finalHasScopeErrors,
          completed_canonical_scopes: completedCanonicalScopes
        })
      }
    });
    console.info(`[ingestion] ${jobType} job ${jobId} completed.`);
  } catch (error) {
    console.error(
      `[ingestion] ${jobType} job ${jobId} failed: ${error instanceof Error ? error.message : "Unknown ingestion job error"}`
    );
    const status = error instanceof ScopeTooBroadError ? "failed" : "failed";
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown ingestion job error"
      }
    });
  }
}

async function ensureNormalizedForFantasy(prisma: PrismaClient, result: IngestMatchResult, rulesetId: bigint) {
  if (!result.skipped) return result.playerStatsParsed > 0;

  const [teamStatsCount, playerStatsCount, fantasyPointsCount] = await Promise.all([
    prisma.matchTeamStat.count({ where: { matchId: result.matchId } }),
    prisma.matchPlayerStat.count({ where: { matchId: result.matchId } }),
    prisma.fantasyPoint.count({
      where: {
        matchId: result.matchId,
        rulesetId
      }
    })
  ]);

  if (playerStatsCount === 0) return false;

  const raw = teamStatsCount === 0
    ? await prisma.rawMatchPayload.findUnique({
        where: { matchId: result.matchId },
        select: { matchId: true }
      })
    : null;
  if (raw) {
    const reparsed = await reparse_match(prisma, result.matchId);
    return reparsed.playerStatsParsed > 0;
  }

  return fantasyPointsCount < playerStatsCount;
}

async function runningJob(prisma: PrismaClient) {
  return prisma.ingestionJob.findFirst({
    where: { status: { in: activeStatuses } },
    orderBy: { updatedAt: "desc" }
  });
}

async function scopesForJob(prisma: PrismaClient, job: IngestionJob, client: FotMobClient) {
  if (job.jobType === "initial_backfill") return scopesForInitialBackfillMode(prisma, backfillModeFromMetadata(job.metadata));
  if (job.jobType === "incremental_update") return buildIncrementalScopes(prisma, client, incrementalTargetLeagueIds(job.metadata));
  throw new Error(`Unsupported ingestion job type: ${job.jobType}`);
}

async function scopesForInitialBackfillMode(prisma: PrismaClient, mode: InitialBackfillMode) {
  const baseScopes = mode === "current_league_47" ? scopesForCurrentSeasonLeagueBackfill(47) : scopesForInitialBackfill();
  return expandScopesWithAliases(baseScopes, await loadLeagueAliases(prisma));
}

function backfillModeFromMetadata(metadataValue: unknown): InitialBackfillMode {
  return metadataRecord(metadataValue).backfill_mode === "current_league_47" ? "current_league_47" : "full";
}

function canCurrentWorkerRunJob(_job: IngestionJob, _input: RunJobInput) {
  // Pre-Turnstile-bypass era used to route `current_league_47` jobs to a
  // dedicated browser-mode worker because matchDetails required a real
  // Chromium session. The unified worker now handles every job type via the
  // unsigned playbyplay next-data endpoint, so there is nothing to gate on.
  return true;
}

async function createLockedJob(
  prisma: PrismaClient,
  input: {
    jobType: "initial_backfill" | "incremental_update";
    data: Prisma.IngestionJobCreateInput;
  }
) {
  return prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(2026051901) AS locked`;
    if (!lockRows[0]?.locked) {
      const existing = await tx.ingestionJob.findFirst({
        where: { status: { in: activeStatuses } },
        orderBy: { updatedAt: "desc" }
      });
      if (existing) return { job: existing, started: false };
      throw new Error("Another ingestion start request is in progress.");
    }

    const existing = await tx.ingestionJob.findFirst({
      where: { status: { in: activeStatuses } },
      orderBy: { updatedAt: "desc" }
    });
    if (existing) return { job: existing, started: false };

    const job = await tx.ingestionJob.create({ data: input.data });
    return { job, started: true };
  });
}

async function isCancelled(prisma: PrismaClient, jobId: string) {
  const job = await prisma.ingestionJob.findUnique({
    where: { id: jobId },
    select: { status: true }
  });
  return job?.status === "cancelled";
}

export async function buildIncrementalScopes(
  prisma: PrismaClient,
  client: FotMobClient,
  targetLeagueIds?: readonly number[]
) {
  const requestedLeagueIds = normalizeTargetLeagueIds(targetLeagueIds);
  const configs = requestedLeagueIds
    ? enabledLeagueIngestionConfigs().filter((config) => requestedLeagueIds.includes(config.league_id))
    : enabledLeagueIngestionConfigs();
  if (requestedLeagueIds && configs.length !== requestedLeagueIds.length) {
    const configured = new Set(configs.map((config) => config.league_id));
    const missing = requestedLeagueIds.filter((leagueId) => !configured.has(leagueId));
    throw new Error(`Incremental ingestion target contains disabled or unknown league ids: ${missing.join(", ")}.`);
  }
  const baseScopes = scopesForIncrementalUpdate(configs);
  const sharedLeagueSeasons = await prisma.leagueSeason.findMany({
    where: {
      source: "fotmob"
    },
    select: {
      leagueId: true,
      season: true
    }
  });
  const seasonsByLeagueId = new Map<number, string>();
  for (const league of sharedLeagueSeasons) {
    const leagueId = Number(league.leagueId);
    if (!Number.isFinite(leagueId)) continue;
    seasonsByLeagueId.set(leagueId, latestSeason(seasonsByLeagueId.get(leagueId), league.season));
  }

  const resolvedBaseScopes = await Promise.all(baseScopes.map(async (scope) => {
    const config = configs.find((candidate) => candidate.league_id === scope.league_id);
    const providerSeason = config ? await resolveProviderCurrentSeason(client, config, scope.season) : scope.season;
    const season = latestSeason(scope.season, seasonsByLeagueId.get(scope.league_id));
    const latestProviderSeason = latestSeason(season, providerSeason);
    return {
      ...scope,
      season: latestProviderSeason,
      include_live: true,
      include_upcoming: true,
      force_refresh: false,
      force_reparse: false
    };
  }));
  return expandScopesWithAliases(resolvedBaseScopes, await loadLeagueAliases(prisma));
}

function incrementalTargetLeagueIds(metadataValue: unknown) {
  const value = metadataRecord(metadataValue).target_league_ids;
  return Array.isArray(value) ? normalizeTargetLeagueIds(value.map(Number)) : undefined;
}

function normalizeTargetLeagueIds(value: readonly number[] | undefined) {
  if (value === undefined) return undefined;
  const normalized = [...new Set(value.filter((leagueId) => Number.isSafeInteger(leagueId) && leagueId > 0))].sort((a, b) => a - b);
  if (normalized.length === 0) throw new Error("At least one positive target league id is required.");
  return normalized;
}

async function loadLeagueAliases(prisma: PrismaClient): Promise<LeagueAlias[]> {
  const dbLeagues = await prisma.coreLeague.findMany({
    select: {
      id: true,
      name: true,
      country: true
    }
  });
  const aliases: LeagueAlias[] = parseLeagueAliases(process.env.MACHETE_FOTMOB_LEAGUE_ALIASES);

  for (const league of dbLeagues) {
    const sourceLeagueId = Number(league.id);
    if (!Number.isSafeInteger(sourceLeagueId) || sourceLeagueId <= 0) continue;

    const canonicalLeagueId = canonicalLeagueIdForIdentity({
      id: league.id,
      name: league.name,
      country: league.country
    });
    if (!canonicalLeagueId || canonicalLeagueId === sourceLeagueId) continue;

    aliases.push({ sourceLeagueId, canonicalLeagueId });
  }

  return dedupeAliases(aliases);
}

function latestSeason(first: string | undefined, second: string | undefined) {
  if (!first) return second ?? "";
  if (!second) return first;
  return seasonRank(second) > seasonRank(first) ? second : first;
}

function seasonRank(season: string) {
  const parts = season.match(/\d{2,4}/g);
  if (!parts?.length) return Number.NEGATIVE_INFINITY;

  const startYear = Number(parts[0]);
  if (!Number.isFinite(startYear)) return Number.NEGATIVE_INFINITY;

  let endYear = startYear;
  if (parts[1]) {
    endYear = Number(parts[1]);
    if (parts[1].length === 2) {
      endYear = Math.floor(startYear / 100) * 100 + endYear;
      if (endYear < startYear) endYear += 100;
    }
  }

  return endYear * 10_000 + startYear;
}

function mergeMetadata(current: Prisma.JsonValue, next: Record<string, unknown>) {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  return jsonValue({ ...base, ...next });
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

type CompletedScopeMetadata = {
  source_league_id: number;
  canonical_league_id: number;
  season: string;
  status: "completed" | "completed_with_errors";
  roster_synced: boolean;
  fixture_failures: number;
  fixtures_discovered: number;
  upcoming_fixtures_discovered: number;
  fixture_ids?: string[];
  upcoming_fixture_ids?: string[];
  minimum_fixtures_required: number;
  finished_at: string;
};

function upsertCompletedScope(value: unknown, next: CompletedScopeMetadata) {
  const scopes = Array.isArray(value)
    ? value.filter((item): item is CompletedScopeMetadata => Boolean(item) && typeof item === "object")
    : [];
  return [
    ...scopes.filter((scope) => !(
      Number(scope.source_league_id) === next.source_league_id
      && String(scope.season) === next.season
    )),
    next
  ];
}

export function aggregateCompletedCanonicalScopes(scopes: IngestionScope[], value: unknown) {
  const completed = Array.isArray(value)
    ? value.filter((item): item is CompletedScopeMetadata => Boolean(item) && typeof item === "object")
    : [];
  const keys = new Map<string, { canonicalLeagueId: number; season: string; sourceLeagueIds: number[] }>();
  for (const scope of scopes) {
    const canonicalLeagueId = scopeCanonicalLeagueId(scope);
    const key = `${canonicalLeagueId}:${scope.season}`;
    const entry = keys.get(key) ?? { canonicalLeagueId, season: scope.season, sourceLeagueIds: [] };
    if (!entry.sourceLeagueIds.includes(scope.league_id)) entry.sourceLeagueIds.push(scope.league_id);
    keys.set(key, entry);
  }

  return [...keys.values()].map((entry) => {
    const rows = entry.sourceLeagueIds.map((sourceLeagueId) => completed.find((row) =>
      Number(row.source_league_id) === sourceLeagueId
      && Number(row.canonical_league_id) === entry.canonicalLeagueId
      && String(row.season) === entry.season
    ));
    const successful = rows.length > 0 && rows.every((row) => row?.status === "completed");
    const fixtureIds = new Set(rows.flatMap((row) => Array.isArray(row?.fixture_ids) ? row.fixture_ids.map(String) : []));
    const upcomingFixtureIds = new Set(rows.flatMap((row) =>
      Array.isArray(row?.upcoming_fixture_ids) ? row.upcoming_fixture_ids.map(String) : []
    ));
    const hasExactFixtureIds = rows.every((row) => Array.isArray(row?.fixture_ids));
    const hasExactUpcomingFixtureIds = rows.every((row) => Array.isArray(row?.upcoming_fixture_ids));
    return {
      league_id: entry.canonicalLeagueId,
      season: entry.season,
      status: successful ? "completed" : "completed_with_errors",
      source_league_ids: entry.sourceLeagueIds.sort((left, right) => left - right),
      fixtures_discovered: hasExactFixtureIds
        ? fixtureIds.size
        : rows.reduce((total, row) => total + (row?.fixtures_discovered ?? 0), 0),
      upcoming_fixtures_discovered: hasExactUpcomingFixtureIds
        ? upcomingFixtureIds.size
        : rows.reduce((total, row) => total + (row?.upcoming_fixtures_discovered ?? 0), 0),
      finished_at: rows.map((row) => row?.finished_at).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null
    };
  });
}
