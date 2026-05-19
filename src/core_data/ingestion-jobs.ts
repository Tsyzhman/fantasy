import { Prisma, type IngestionJob, type PrismaClient } from "@prisma/client";

import { FantasyPointsRepository } from "@/machete/fantasy_repositories";
import { calculate_fantasy_points_for_match } from "@/machete/fantasy_points_engine";

import { createFotMobClient, type FotMobClient } from "./fotmob_client";
import { ingest_match, discover_matches_for_scope } from "./ingestion";
import type { IngestionScope } from "./ingestion-scope";
import {
  enabledLeagueIngestionConfigs,
  scopesForInitialBackfill,
  scopesForIncrementalUpdate,
  type LeagueIngestionConfig
} from "./league-season-policy";
import { sourceIdToBigInt } from "./models";
import { CoreIngestionRepository } from "./repositories";
import { resolveProviderCurrentSeason, sync_league_season_rosters } from "./season-rosters";
import { ScopeTooBroadError } from "./scope-validation";

const activeStatuses = ["pending", "running"];
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
};

export async function getIngestionAdminStatus(prisma: PrismaClient) {
  const [activeJob, latestInitialBackfill, latestJob] = await Promise.all([
    prisma.ingestionJob.findFirst({
      where: { status: { in: activeStatuses } },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.ingestionJob.findFirst({
      where: { jobType: "initial_backfill", status: "completed" },
      orderBy: { finishedAt: "desc" }
    }),
    prisma.ingestionJob.findFirst({
      orderBy: { updatedAt: "desc" }
    })
  ]);
  const configs = enabledLeagueIngestionConfigs();
  const initialScopes = scopesForInitialBackfill(configs);

  return {
    initial_backfill_completed: Boolean(latestInitialBackfill),
    initial_backfill_completed_at: latestInitialBackfill?.finishedAt ?? null,
    total_configured_leagues: configs.length,
    total_configured_scopes: initialScopes.length,
    active_job: activeJob ? serializeIngestionJob(activeJob) : null,
    latest_job: latestJob ? serializeIngestionJob(latestJob) : null,
    latest_initial_backfill: latestInitialBackfill ? serializeIngestionJob(latestInitialBackfill) : null,
    start_seasons: {
      autumn_spring: "2023/2024",
      spring_autumn: "2023"
    }
  };
}

export async function start_initial_backfill(prisma: PrismaClient, input: StartJobInput) {
  const scopes = scopesForInitialBackfill();
  const result = await createLockedJob(prisma, {
    jobType: "initial_backfill",
    data: {
      jobType: "initial_backfill",
      status: "running",
      startedByUserId: input.startedByUserId ?? null,
      startedAt: new Date(),
      totalScopes: scopes.length,
      metadata: jsonValue({
        start_seasons: {
          autumn_spring: "2023/2024",
          spring_autumn: "2023"
        }
      })
    }
  });

  if (!result.started) return { job: serializeIngestionJob(result.job), started: false };

  void runIngestionJob(prisma, result.job.id, "initial_backfill", scopes, input.client ?? createFotMobClient());
  return { job: serializeIngestionJob(result.job), started: true };
}

export async function run_incremental_update(prisma: PrismaClient, input: StartJobInput) {
  const completedInitialBackfill = await prisma.ingestionJob.findFirst({
    where: { jobType: "initial_backfill", status: "completed" },
    select: { id: true }
  });
  if (!completedInitialBackfill) {
    throw new Error("Initial backfill must complete before incremental updates.");
  }

  const client = input.client ?? createFotMobClient();
  const scopes = await buildIncrementalScopes(prisma, client);
  const result = await createLockedJob(prisma, {
    jobType: "incremental_update",
    data: {
      jobType: "incremental_update",
      status: "running",
      startedByUserId: input.startedByUserId ?? null,
      startedAt: new Date(),
      totalScopes: scopes.length,
      metadata: jsonValue({ incremental_only: true })
    }
  });

  if (!result.started) return { job: serializeIngestionJob(result.job), started: false };

  void runIngestionJob(prisma, result.job.id, "incremental_update", scopes, client);
  return { job: serializeIngestionJob(result.job), started: true };
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

async function runIngestionJob(prisma: PrismaClient, jobId: string, jobType: "initial_backfill" | "incremental_update", scopes: IngestionScope[], client: FotMobClient) {
  const ingestionRepository = new CoreIngestionRepository(prisma);
  const ruleset = await new FantasyPointsRepository(prisma).createRuleset(defaultRuleset);
  let processedScopes = 0;

  try {
    for (const scope of scopes) {
      if (await isCancelled(prisma, jobId)) return;

      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          currentLeagueId: BigInt(scope.league_id),
          currentSeason: scope.season,
          currentMatchId: null
        }
      });

      try {
        await sync_league_season_rosters(prisma, client, {
          leagueId: scope.league_id,
          season: scope.season,
          isCurrent: jobType === "incremental_update"
        });
      } catch (error) {
        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: {
            errorMessage: error instanceof Error ? error.message : "Unknown roster sync error"
          }
        });
      }

      const discoveredMatches = await discover_matches_for_scope(client, scope);
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: { totalMatches: { increment: discoveredMatches.length } }
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
          const result = await ingest_match(prisma, fixture.id, {
            client,
            leagueId: scope.league_id,
            season: scope.season,
            forceRefresh: scope.force_refresh,
            forceReparse: scope.force_reparse
          });
          if (!result.skipped) {
            await calculate_fantasy_points_for_match(prisma, result.matchId, ruleset.id);
          }
          await prisma.ingestionJob.update({
            where: { id: jobId },
            data: result.skipped ? { skippedMatches: { increment: 1 } } : { fetchedMatches: { increment: result.fetched ? 1 : 0 } }
          });
          await ingestionRepository.upsertCheckpoint({
            jobType,
            leagueId: BigInt(scope.league_id),
            season: scope.season,
            lastProcessedMatchId: result.matchId,
            lastProcessedDate: new Date(),
            cursor: { match_id: fixture.id }
          });
        } catch (error) {
          await prisma.ingestionJob.update({
            where: { id: jobId },
            data: {
              failedMatches: { increment: 1 },
              errorMessage: error instanceof Error ? error.message : "Unknown match ingestion error"
            }
          });
        }
      }

      processedScopes += 1;
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          processedScopes,
          currentMatchId: null
        }
      });
    }

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        currentLeagueId: null,
        currentSeason: null,
        currentMatchId: null
      }
    });
  } catch (error) {
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

async function runningJob(prisma: PrismaClient) {
  return prisma.ingestionJob.findFirst({
    where: { status: { in: activeStatuses } },
    orderBy: { updatedAt: "desc" }
  });
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

async function buildIncrementalScopes(prisma: PrismaClient, client: FotMobClient) {
  const configs = enabledLeagueIngestionConfigs();
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

  return Promise.all(baseScopes.map(async (scope) => {
    const config = configs.find((candidate) => candidate.league_id === scope.league_id);
    const providerSeason = config ? await resolveProviderCurrentSeason(client, config, scope.season) : scope.season;
    const season = latestSeason(scope.season, seasonsByLeagueId.get(scope.league_id));
    const latestProviderSeason = latestSeason(season, providerSeason);
    return {
      ...scope,
      season: latestProviderSeason,
      include_live: true,
      include_upcoming: false,
      force_refresh: false,
      force_reparse: false
    };
  }));
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
