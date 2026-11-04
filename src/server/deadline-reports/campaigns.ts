import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { fantasyProviderRoundKey } from "@/machete/squad_planner";
import { captureSportsOwnershipSnapshots } from "@/server/sports-trends/ownership";
import {
  DEADLINE_BUILD_HOUR,
  DEADLINE_BUILD_MINUTE,
  DEADLINE_LOOKAHEAD_DAYS,
  DEADLINE_REFRESH_HOUR,
  DEADLINE_REFRESH_MINUTE,
  DEADLINE_SQUAD_IMPORT_HOUR,
  deadlineClock,
  contestsWithEnabledSubscriptions,
  moscowDateKey,
  moscowDateTimeToUtc,
  moscowMinutesOfDay
} from "./config";
import { buildCampaignReports } from "./build";
import { deadlineTag } from "./tags";
import { lockDeadlinePublication, type ClaimedStageJob } from "./publication";
export type { ClaimedStageJob } from "./publication";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#deadlines
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 */
export const DEADLINE_EARLIEST_DELIVERY_MINUTES = 9 * 60;
export const DEADLINE_BUILD_CUTOFF_MINUTES = 8 * 60 + 50;

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
export function deadlineBuildCutoffAt(reportDate: string): Date {
  return dueAt(reportDate, Math.floor(DEADLINE_BUILD_CUTOFF_MINUTES / 60), DEADLINE_BUILD_CUTOFF_MINUTES % 60);
}

export interface CampaignPlanSummary {
  created: number;
  updated: number;
  blocked: number;
  skipped: number;
  details: Array<{ contestId: string; providerRoundId: string; status: string; reason?: string }>;
}

interface SportsScope {
  leagueId: bigint;
  season: string;
  tournamentHru: string;
}

function sportsScopeFromRules(rules: unknown, leagueId: bigint, season: string): SportsScope | null {
  if (!rules || typeof rules !== "object") return null;
  const record = rules as Record<string, unknown>;
  const tournamentHru = typeof record.tournamentHru === "string" && record.tournamentHru.trim() ? record.tournamentHru.trim() : null;
  if (!tournamentHru) return null;
  return { leagueId, season, tournamentHru };
}

function dueAt(reportDate: string, hour: number, minute: number): Date {
  const [year, month, day] = reportDate.split("-").map(Number);
  return moscowDateTimeToUtc({ year: year ?? 2000, month: month ?? 1, day: day ?? 1, hour, minute });
}

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
export async function deadlinePlanningVersion(prisma: PrismaClient) {
  const contestIds = (await contestsWithEnabledSubscriptions(prisma)).sort();
  const scopes = await prisma.fantasyContest.findMany({
    where: { id: { in: contestIds } }, orderBy: { id: "asc" },
    select: { id: true, scheduleRevision: true, rules: true,
      providerRounds: { orderBy: { ordinal: "asc" }, select: { providerRoundId: true, deadlineAt: true } } }
  });
  return createHash("sha256").update(JSON.stringify(scopes)).digest("hex");
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#deadlines
 */
export async function planDeadlineCampaigns(
  prisma: PrismaClient,
  options: { now?: Date; contestIds?: string[] } = {}
): Promise<CampaignPlanSummary> {
  const now = options.now ?? new Date();
  const contestIds = options.contestIds ?? (await contestsWithEnabledSubscriptions(prisma));
  const summary: CampaignPlanSummary = { created: 0, updated: 0, blocked: 0, skipped: 0, details: [] };
  for (const contestId of contestIds) {
    const contest = await prisma.fantasyContest.findUnique({
      where: { id: contestId },
      select: { id: true, name: true, season: true, provider: true, leagueId: true, rules: true, scheduleRevision: true }
    });
    if (!contest) {
      summary.skipped += 1;
      continue;
    }
    const rounds = await prisma.fantasyProviderRound.findMany({
      where: {
        contestId,
        deadlineAt: { gte: new Date(now.getTime() - 60 * 60 * 1000), lte: new Date(now.getTime() + DEADLINE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000) }
      },
      orderBy: { deadlineAt: "asc" },
      take: 3,
      select: { id: true, providerRoundId: true, ordinal: true, deadlineAt: true }
    });
    for (const round of rounds) {
      const existing = await prisma.deadlineCampaign.findUnique({
        where: { contestId_season_providerRoundId: { contestId, season: contest.season, providerRoundId: round.providerRoundId } }
      });
      if (existing && ["BUILT", "DELIVERING", "DONE"].includes(existing.status)) {
        if (existing.deadlineAt?.getTime() === round.deadlineAt?.getTime()
          && existing.scheduleVersion === (contest.scheduleRevision ?? null)) {
          summary.skipped += 1;
          continue;
        }
        if (existing.status === "DONE") {
          await prisma.deadlineCampaign.update({
            where: { id: existing.id },
            data: { deadlineAt: round.deadlineAt, scheduleVersion: contest.scheduleRevision ?? null }
          });
          summary.updated += 1;
          continue;
        }
      }
      const fixtures = await prisma.fantasyProviderFixture.findMany({
        where: { contestId, roundId: round.id },
        orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
        select: { kickoffAt: true, mappingStatus: true, homeTeamId: true, awayTeamId: true }
      });
      const deadlineAt = round.deadlineAt;
      const earliestKickoff = fixtures[0]?.kickoffAt ?? null;
      const scheduleKnown = fixtures.length > 0 && fixtures.every((fixture) => fixture.kickoffAt != null);
      const scheduleComplete = scheduleKnown && fixtures.every((fixture) => fixture.homeTeamId != null && fixture.awayTeamId != null && fixture.mappingStatus !== "UNMATCHED");
      let status = "ACTIVE";
      let blockedReason: string | null = null;
      let isEarlyDeadline = false;
      if (!deadlineAt) {
        status = "BLOCKED";
        blockedReason = "UNKNOWN_DEADLINE";
      } else if (!scheduleComplete) {
        status = "BLOCKED";
        blockedReason = "INCOMPLETE_SCHEDULE";
      } else if (!earliestKickoff) {
        status = "BLOCKED";
        blockedReason = "UNKNOWN_FIRST_KICKOFF";
      } else if (deadlineAt.getTime() > earliestKickoff.getTime() + 60_000) {
        status = "BLOCKED";
        blockedReason = "DEADLINE_CONFLICT";
      } else if (deadlineAt < now) {
        status = "CANCELLED";
        blockedReason = "PAST_DEADLINE";
      } else if (moscowMinutesOfDay(deadlineAt) < DEADLINE_EARLIEST_DELIVERY_MINUTES) {
        status = "BLOCKED";
        blockedReason = "EARLY_DEADLINE";
        isEarlyDeadline = true;
      } else if (!deadlineTag(contest.name, round.ordinal)) {
        status = "BLOCKED";
        blockedReason = "UNKNOWN_TAG";
      }
      const reportDate = deadlineAt ? moscowDateKey(deadlineAt) : null;
      const roundKey = fantasyProviderRoundKey(contest.provider, round.ordinal, round.providerRoundId);
      const unchanged = existing
        && existing.deadlineAt?.getTime() === deadlineAt?.getTime()
        && existing.scheduleVersion === (contest.scheduleRevision ?? null)
        && existing.status === status && existing.isEarlyDeadline === isEarlyDeadline
        && existing.blockedReason === blockedReason && existing.reportDate === reportDate
        && existing.roundKey === roundKey;
      const campaign = unchanged ? existing : await prisma.$transaction(async (tx) => {
        if (existing) await tx.$queryRaw`SELECT "id" FROM "deadline_campaigns" WHERE "id" = ${existing.id} FOR UPDATE`;
        const current = existing ? await tx.deadlineCampaign.findUnique({ where: { id: existing.id } }) : null;
        const campaignInputChanged = current && (current.deadlineAt?.getTime() !== deadlineAt?.getTime()
          || current.scheduleVersion !== (contest.scheduleRevision ?? null) || current.reportDate !== reportDate);
        if (current && !campaignInputChanged && ["BUILT", "DELIVERING", "DONE"].includes(current.status)) return current;
        const planned = await tx.deadlineCampaign.upsert({
          where: { contestId_season_providerRoundId: { contestId, season: contest.season, providerRoundId: round.providerRoundId } },
          create: {
            provider: contest.provider,
            contestId,
            season: contest.season,
            providerRoundId: round.providerRoundId,
            roundKey,
            roundLabel: `Тур ${round.ordinal}`,
            deadlineAt,
            deadlineSource: "PROVIDER_ROUND_DEADLINE_AT",
            verifiedAt: now,
            scheduleVersion: contest.scheduleRevision ?? null,
            status,
            inputVersion: 1,
            reportDate,
            isEarlyDeadline,
            blockedReason
          },
          update: {
            deadlineAt,
            verifiedAt: now,
            scheduleVersion: contest.scheduleRevision ?? null,
            status,
            isEarlyDeadline,
            blockedReason,
            reportDate,
            roundKey,
            roundLabel: `Тур ${round.ordinal}`,
            ...(campaignInputChanged ? { inputVersion: { increment: 1 } } : {})
          }
        });
        if (campaignInputChanged) {
          await tx.deadlineStageJob.updateMany({ where: { campaignId: planned.id, inputVersion: { not: planned.inputVersion }, status: { in: ["QUEUED", "FAILED", "RUNNING"] } }, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } });
          // Quarantine unsent old text atomically with the version change. A
          // rebuilt version may reopen STALE parts, but never cancelled consent
          // or any report that may already have reached Telegram.
          await tx.$executeRaw`
            UPDATE "telegram_outbox" unsent
            SET "state" = CASE WHEN EXISTS (
              SELECT 1 FROM "telegram_outbox" started
              WHERE started."campaign_id" = unsent."campaign_id" AND started."user_id" = unsent."user_id"
                AND started."report_kind" = unsent."report_kind" AND started."state" IN ('SENT', 'SENDING', 'DELIVERY_UNKNOWN')
            ) THEN 'CANCELLED' ELSE 'STALE' END,
              "lease_token" = NULL, "lease_until" = NULL, "updated_at" = ${now}
            WHERE unsent."campaign_id" = ${planned.id} AND unsent."state" IN ('PENDING', 'FAILED', 'STALE')
          `;
        }
        if (status === "BLOCKED" || status === "CANCELLED") {
          await tx.deadlineStageJob.updateMany({ where: { campaignId: planned.id, status: { in: ["QUEUED", "FAILED", "RUNNING"] } }, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } });
          await tx.telegramOutbox.updateMany({ where: { campaignId: planned.id, state: { in: ["PENDING", "STALE"] } }, data: { state: "CANCELLED", leaseToken: null, leaseUntil: null } });
        }
        return planned;
      });
      if (status === "BLOCKED") {
        summary.blocked += 1;
        summary.details.push({ contestId, providerRoundId: round.providerRoundId, status, reason: blockedReason ?? undefined });
        continue;
      }
      if (status === "CANCELLED") {
        summary.skipped += 1;
        continue;
      }
      if (reportDate) {
        const stages = [
          { stage: "SQUAD_IMPORT", dueAt: dueAt(reportDate, DEADLINE_SQUAD_IMPORT_HOUR, 0) },
          { stage: "DATA_REFRESH", dueAt: dueAt(reportDate, DEADLINE_REFRESH_HOUR, DEADLINE_REFRESH_MINUTE) },
          { stage: "BUILD_REPORTS", dueAt: dueAt(reportDate, DEADLINE_BUILD_HOUR, DEADLINE_BUILD_MINUTE - 35) }
        ];
        for (const stage of stages) {
          const existingStage = await prisma.deadlineStageJob.findUnique({
            where: { campaignId_stage_inputVersion_shardKey: { campaignId: campaign.id, stage: stage.stage,
              inputVersion: campaign.inputVersion, shardKey: "" } }, select: { dueAt: true }
          });
          if (existingStage?.dueAt.getTime() === stage.dueAt.getTime()) continue;
          await prisma.deadlineStageJob.upsert({
            where: { campaignId_stage_inputVersion_shardKey: { campaignId: campaign.id, stage: stage.stage, inputVersion: campaign.inputVersion, shardKey: "" } },
            create: {
              campaignId: campaign.id,
              stage: stage.stage,
              inputVersion: campaign.inputVersion,
              shardKey: "",
              status: "QUEUED",
              dueAt: stage.dueAt,
              nextAttemptAt: stage.dueAt
            },
            update: { dueAt: stage.dueAt }
          });
        }
      }
      if (unchanged) summary.skipped += 1;
      else if (existing) summary.updated += 1;
      else summary.created += 1;
      summary.details.push({ contestId, providerRoundId: round.providerRoundId, status });
    }
  }
  return summary;
}

const STAGE_LEASE_MS = 15 * 60 * 1000;
const STAGE_MAX_ATTEMPTS = 5;

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
export async function claimDueStageJob(prisma: PrismaClient, now: Date): Promise<ClaimedStageJob | null> {
  // Recover bounded abandoned leases before checking refresh dependencies.
  await prisma.$executeRaw`
    UPDATE "deadline_stage_jobs"
    SET "status" = CASE WHEN "attempts" < ${STAGE_MAX_ATTEMPTS} THEN 'QUEUED' ELSE 'FAILED' END,
        "next_attempt_at" = ${now}, "lease_token" = NULL, "lease_until" = NULL,
        "last_error" = 'STAGE_LEASE_EXPIRED', "updated_at" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "deadline_stage_jobs"
      WHERE "status" = 'RUNNING' AND "lease_until" < ${now}
      LIMIT 500 FOR UPDATE SKIP LOCKED
    )
  `;
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + STAGE_LEASE_MS);
  const rows = await prisma.$queryRaw<ClaimedStageJob[]>`
    UPDATE "deadline_stage_jobs"
    SET "status" = 'RUNNING',
        "lease_token" = ${token},
        "lease_until" = ${leaseUntil},
        "fence" = "fence" + 1,
        "attempts" = "attempts" + 1,
        "started_at" = COALESCE("started_at", ${now}),
        "updated_at" = ${now}
    WHERE "id" = (
      SELECT queued."id" FROM "deadline_stage_jobs" queued
      WHERE queued."status" = 'QUEUED' AND queued."next_attempt_at" <= ${now} AND queued."due_at" <= ${now} AND queued."attempts" < ${STAGE_MAX_ATTEMPTS}
        AND EXISTS (
          SELECT 1 FROM "deadline_campaigns" campaign
          WHERE campaign."id" = queued."campaign_id" AND campaign."input_version" = queued."input_version"
            AND campaign."status" IN ('PLANNED', 'ACTIVE', 'BUILT', 'DELIVERING')
        )
        AND (queued."stage" <> 'BUILD_REPORTS' OR NOT EXISTS (
          SELECT 1 FROM "deadline_stage_jobs" refresh
          WHERE refresh."campaign_id" = queued."campaign_id" AND refresh."input_version" = queued."input_version"
            AND refresh."stage" = 'DATA_REFRESH'
            AND (refresh."status" = 'RUNNING' OR (refresh."status" = 'QUEUED' AND refresh."attempts" < ${STAGE_MAX_ATTEMPTS}))
        ))
      ORDER BY queued."due_at" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "campaign_id" AS "campaignId", "stage", "input_version" AS "inputVersion", "attempts", "lease_token" AS "leaseToken"
  `;
  return rows[0] ?? null;
}

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data */
export async function finishStageJob(
  prisma: PrismaClient,
  job: ClaimedStageJob,
  outcome: { status: "SUCCEEDED" | "DEGRADED" | "FAILED" | "CANCELLED"; result?: unknown; error?: string | null; retryInMs?: number | null },
  now: Date,
  publish?: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<boolean> {
  // Start before acquiring a pooled connection, so a slow pool cannot freeze the
  // lease check at the time the caller requested completion.
  const clock = deadlineClock(now);
  return prisma.$transaction(async (tx) => {
    if (!await lockDeadlinePublication(tx, { campaignId: job.campaignId, inputVersion: job.inputVersion, job }, clock)) return false;
    if (publish) await publish(tx);
    const finishedAt = clock();
    await tx.deadlineStageJob.update({
      where: { id: job.id },
      data: {
        status: outcome.status,
        finishedAt,
        leaseToken: null,
        leaseUntil: null,
        lastError: outcome.error ?? null,
        result: (outcome.result ?? {}) as Prisma.InputJsonValue,
        ...(outcome.retryInMs
          ? { status: "QUEUED", nextAttemptAt: new Date(finishedAt.getTime() + outcome.retryInMs), finishedAt: null }
          : {})
      }
    });
    return true;
  });
}

export interface StageExecutionSummary {
  executed: number;
  succeeded: number;
  degraded: number;
  failed: number;
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#freshness
 */
export async function executeDueStageJobs(prisma: PrismaClient, options: { now?: Date; maxJobs?: number; clock?: () => Date } = {}): Promise<StageExecutionSummary> {
  const clock = options.clock ?? deadlineClock(options.now);
  const summary: StageExecutionSummary = { executed: 0, succeeded: 0, degraded: 0, failed: 0 };
  const maxJobs = options.maxJobs ?? 4;
  for (let index = 0; index < maxJobs; index += 1) {
    const now = clock();
    const job = await claimDueStageJob(prisma, now);
    if (!job) break;
    summary.executed += 1;
    const campaign = await prisma.deadlineCampaign.findUnique({ where: { id: job.campaignId } });
    if (!campaign || campaign.inputVersion !== job.inputVersion || ["CANCELLED", "BLOCKED", "DONE"].includes(campaign.status)) {
      await finishStageJob(prisma, job, { status: "CANCELLED" }, now);
      continue;
    }
    const contest = await prisma.fantasyContest.findUnique({
      where: { id: campaign.contestId },
      select: { id: true, name: true, leagueId: true, season: true, rules: true }
    });
    const scope = contest ? sportsScopeFromRules(contest.rules, contest.leagueId, contest.season) : null;
    const cutoff = campaign.reportDate ? deadlineBuildCutoffAt(campaign.reportDate) : null;

    try {
      if (job.stage === "SQUAD_IMPORT") {
        if (!scope) throw new Error("Sports sync scope is not configured for the contest.");
        const { syncSportsRuSquadSnapshots } = await import("@/machete/sports_ru_squad_snapshots");
        const result = await syncSportsRuSquadSnapshots(prisma, [scope]);
        const published = await finishStageJob(prisma, job, { status: "SUCCEEDED", result }, clock(), async (tx) => {
          await tx.deadlineDataSnapshot.upsert({
            where: { campaignId_inputVersion_dataset: { campaignId: campaign.id, inputVersion: job.inputVersion, dataset: "SQUAD_IMPORT" } },
            create: { campaignId: campaign.id, inputVersion: job.inputVersion, dataset: "SQUAD_IMPORT", status: "READY", revision: null, coverage: result as Prisma.InputJsonValue, freshness: { at: now.toISOString() } },
            update: { status: "READY", coverage: result as Prisma.InputJsonValue, freshness: { at: now.toISOString() }, capturedAt: now }
          });
        });
        if (published) summary.succeeded += 1;
      } else if (job.stage === "DATA_REFRESH") {
        const { runSportsRuFantasySyncNow } = await import("@/server/sports-ru-fantasy-sync-scheduler");
        const { runSorareInsideSyncNow } = await import("@/server/sorareinside-scheduler");
        const xiThreshold = campaign.reportDate ? dueAt(campaign.reportDate, DEADLINE_REFRESH_HOUR, DEADLINE_REFRESH_MINUTE) : now;
        const [syncResult, xi] = await Promise.all([
          scope ? runSportsRuFantasySyncNow("manual", [scope]) : Promise.resolve(null),
          runSorareInsideSyncNow({ notBefore: xiThreshold })
        ]);
        const ownership = await captureSportsOwnershipSnapshots(prisma, { contestIds: [campaign.contestId], now: () => now });
        const sync = syncResult?.started === true && syncResult.failed === 0 && syncResult.unavailable === 0 && syncResult.succeeded > 0;
        const xiCoverage = contest && xi ? xi.byScope[`${contest.leagueId}:${contest.season}`] ?? {} : {};
        const xiCount = Object.values(xiCoverage).reduce((total, count) => total + count, 0);
        const xiReady = xi != null && Date.parse(xi.startedAt) >= xiThreshold.getTime() && xiCount > 0 &&
          (xiCoverage.APPLIED ?? 0) + (xiCoverage.UNCHANGED ?? 0) === xiCount;
        const degraded = !sync || !xiReady;
        const result = { ownership, sync, xi: xi ? { status: xi.status, startedAt: xi.startedAt, finishedAt: xi.finishedAt ?? null, coverage: xiCoverage } : null };
        const finishedAt = clock();
        const retryInMs = xi?.status === "ALREADY_RUNNING" && job.attempts < STAGE_MAX_ATTEMPTS && cutoff && finishedAt < cutoff ? 5 * 60 * 1000 : null;
        const published = await finishStageJob(prisma, job, { status: degraded ? "DEGRADED" : "SUCCEEDED", result,
          error: degraded ? !sync ? "SPORTS_SYNC_DEGRADED" : "XI_REFRESH_DEGRADED" : null, retryInMs }, finishedAt, async (tx) => {
          await tx.deadlineDataSnapshot.upsert({
            where: { campaignId_inputVersion_dataset: { campaignId: campaign.id, inputVersion: job.inputVersion, dataset: "DATA_REFRESH" } },
            create: {
              campaignId: campaign.id,
              inputVersion: job.inputVersion,
              dataset: "DATA_REFRESH",
              status: degraded ? "DEGRADED" : "READY",
              coverage: result as unknown as Prisma.InputJsonValue,
              freshness: { at: now.toISOString() }
            },
            update: { status: degraded ? "DEGRADED" : "READY", coverage: result as unknown as Prisma.InputJsonValue, freshness: { at: now.toISOString() }, capturedAt: now }
          });
        });
        if (!published) continue;
        if (degraded) summary.degraded += 1;
        else summary.succeeded += 1;
      } else if (job.stage === "BUILD_REPORTS") {
        const result = await buildCampaignReports(prisma, { campaignId: campaign.id, now, stageJob: job, clock });
        const finishedAt = clock();
        const retryable = result.built === 0 && cutoff != null && finishedAt < cutoff && job.attempts < STAGE_MAX_ATTEMPTS;
        const published = await finishStageJob(
          prisma,
          job,
          {
            status: result.built > 0 ? "SUCCEEDED" : "DEGRADED",
            result,
            error: result.built > 0 ? null : "NO_REPORTS_BUILT",
            retryInMs: retryable ? 5 * 60 * 1000 : null
          },
          finishedAt,
          async (tx) => {
            if (result.built > 0) await tx.deadlineCampaign.update({ where: { id: campaign.id }, data: { status: "BUILT" } });
          }
        );
        if (!published) continue;
        if (result.built > 0) {
          summary.succeeded += 1;
        } else {
          summary.degraded += 1;
        }
      } else {
        await finishStageJob(prisma, job, { status: "CANCELLED" }, clock());
      }
    } catch (error) {
      const retryInMs = job.attempts < STAGE_MAX_ATTEMPTS ? 5 * 60 * 1000 : null;
      await finishStageJob(
        prisma,
        job,
        { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "unknown", retryInMs },
        clock()
      );
      summary.failed += 1;
    }
  }
  return summary;
}
