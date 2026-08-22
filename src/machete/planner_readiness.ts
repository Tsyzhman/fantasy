import type { PrismaClient } from "@prisma/client";

import type { SharedLeagueSeasonOption } from "./shared_read_model";

export type PlannerReadinessReason =
  | "NO_ACTIVE_PLAYERS"
  | "NO_UPCOMING_FIXTURES"
  | "NO_DATA_QUALITY_AUDIT"
  | "DATA_QUALITY_AUDIT_NOT_COMPLETED"
  | "DATA_QUALITY_GATE_FAILED"
  | "FORECAST_COVERAGE_GATE_FAILED"
  | "DATA_QUALITY_AUDIT_STALE"
  | "NO_INCREMENTAL_INGESTION"
  | "INCREMENTAL_INGESTION_NOT_COMPLETED"
  | "INCREMENTAL_INGESTION_STALE"
  | "INGESTION_FIXTURE_COUNT_MISMATCH"
  | "AUDIT_PREDATES_INGESTION";

export type PlannerReadiness = {
  leagueId: string;
  season: string;
  ready: boolean;
  reasons: PlannerReadinessReason[];
  activePlayers: number;
  upcomingFixtures: number;
  maximumAgeHours: number;
  audit: {
    id: string;
    status: string;
    gatePassed: boolean;
    plannerGatePassed: boolean;
    mode: "PRESEASON_FORECAST" | "FULL_DATA_QUALITY";
    coverageThreshold: number;
    forecastCoverage: number;
    finishedMatches: number;
    startedAt: string;
    completedAt: string | null;
    ageHours: number | null;
  } | null;
  ingestion: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    ageHours: number | null;
    upcomingFixturesDiscovered: number;
    upcomingFixturesPersisted: number | null;
    currentUpcomingFixturesFromDiscovery: number | null;
  } | null;
};

const forecastActionBlockingReadinessReasons = new Set<PlannerReadinessReason>([
  "NO_ACTIVE_PLAYERS",
  "NO_UPCOMING_FIXTURES",
  "NO_INCREMENTAL_INGESTION",
  "INCREMENTAL_INGESTION_NOT_COMPLETED",
  "INCREMENTAL_INGESTION_STALE",
  "INGESTION_FIXTURE_COUNT_MISMATCH"
]);

export function plannerReadinessBlocksForecastActions(readiness: Pick<PlannerReadiness, "reasons">) {
  return readiness.reasons.some((reason) => forecastActionBlockingReadinessReasons.has(reason));
}

export function plannerReadinessBlocksTransferSuggestions(readiness: Pick<PlannerReadiness, "reasons">) {
  return plannerReadinessBlocksForecastActions(readiness);
}

export type PlannerReadinessEvaluationInput = {
  leagueId: bigint;
  season: string;
  activePlayers: number;
  upcomingFixtures: number;
  maximumAgeHours: number;
  now: Date;
  audit: {
    id: string;
    status: string;
    gatePassed: boolean;
    coverageThreshold: number;
    forecastCoverage: number;
    finishedMatches: number;
    startedAt: Date;
    completedAt: Date | null;
  } | null;
  ingestion: {
    id: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    upcomingFixturesDiscovered: number;
    upcomingFixturesPersisted: number | null;
    currentUpcomingFixturesFromDiscovery: number | null;
  } | null;
};

export function evaluatePlannerReadiness(input: PlannerReadinessEvaluationInput): PlannerReadiness {
  const reasons: PlannerReadinessReason[] = [];
  const auditAgeHours = ageHours(input.audit?.completedAt ?? null, input.now);
  const ingestionAgeHours = ageHours(input.ingestion?.finishedAt ?? null, input.now);

  if (input.activePlayers <= 0) reasons.push("NO_ACTIVE_PLAYERS");
  if (input.upcomingFixtures <= 0) reasons.push("NO_UPCOMING_FIXTURES");

  if (!input.audit) {
    reasons.push("NO_DATA_QUALITY_AUDIT");
  } else {
    if (input.audit.status !== "COMPLETED" || !input.audit.completedAt) reasons.push("DATA_QUALITY_AUDIT_NOT_COMPLETED");
    if (input.audit.forecastCoverage < input.audit.coverageThreshold) reasons.push("FORECAST_COVERAGE_GATE_FAILED");
    if (input.audit.finishedMatches > 0 && !input.audit.gatePassed) reasons.push("DATA_QUALITY_GATE_FAILED");
    if (auditAgeHours === null || auditAgeHours < 0 || auditAgeHours > input.maximumAgeHours) reasons.push("DATA_QUALITY_AUDIT_STALE");
  }

  if (!input.ingestion) {
    reasons.push("NO_INCREMENTAL_INGESTION");
  } else {
    if (input.ingestion.status !== "completed" || !input.ingestion.finishedAt) reasons.push("INCREMENTAL_INGESTION_NOT_COMPLETED");
    if (ingestionAgeHours === null || ingestionAgeHours < 0 || ingestionAgeHours > input.maximumAgeHours) reasons.push("INCREMENTAL_INGESTION_STALE");
    const exactFixtureEvidenceAvailable = input.ingestion.upcomingFixturesPersisted !== null
      && input.ingestion.currentUpcomingFixturesFromDiscovery !== null;
    const fixtureCountsMatch = exactFixtureEvidenceAvailable
      ? input.ingestion.upcomingFixturesPersisted === input.ingestion.upcomingFixturesDiscovered
        && input.ingestion.currentUpcomingFixturesFromDiscovery === input.upcomingFixtures
      : input.ingestion.upcomingFixturesDiscovered === input.upcomingFixtures;
    if (!fixtureCountsMatch) reasons.push("INGESTION_FIXTURE_COUNT_MISMATCH");
  }

  if (input.audit?.startedAt && input.ingestion?.finishedAt && input.audit.startedAt < input.ingestion.finishedAt) {
    reasons.push("AUDIT_PREDATES_INGESTION");
  }

  return {
    leagueId: String(input.leagueId),
    season: input.season,
    ready: reasons.length === 0,
    reasons,
    activePlayers: input.activePlayers,
    upcomingFixtures: input.upcomingFixtures,
    maximumAgeHours: input.maximumAgeHours,
    audit: input.audit
      ? {
          id: input.audit.id,
          status: input.audit.status,
          gatePassed: input.audit.gatePassed,
          plannerGatePassed:
            input.audit.status === "COMPLETED"
            && input.audit.forecastCoverage >= input.audit.coverageThreshold
            && (input.audit.finishedMatches === 0 || input.audit.gatePassed),
          mode: input.audit.finishedMatches === 0 ? "PRESEASON_FORECAST" : "FULL_DATA_QUALITY",
          coverageThreshold: input.audit.coverageThreshold,
          forecastCoverage: input.audit.forecastCoverage,
          finishedMatches: input.audit.finishedMatches,
          startedAt: input.audit.startedAt.toISOString(),
          completedAt: input.audit.completedAt?.toISOString() ?? null,
          ageHours: auditAgeHours
        }
      : null,
    ingestion: input.ingestion
      ? {
          id: input.ingestion.id,
          status: input.ingestion.status,
          startedAt: input.ingestion.startedAt?.toISOString() ?? null,
          finishedAt: input.ingestion.finishedAt?.toISOString() ?? null,
          ageHours: ingestionAgeHours,
          upcomingFixturesDiscovered: input.ingestion.upcomingFixturesDiscovered,
          upcomingFixturesPersisted: input.ingestion.upcomingFixturesPersisted,
          currentUpcomingFixturesFromDiscovery: input.ingestion.currentUpcomingFixturesFromDiscovery
        }
      : null
  };
}

export async function loadPlannerReadinessByScope(
  prisma: PrismaClient,
  scopes: Array<Pick<SharedLeagueSeasonOption, "leagueId" | "season">>,
  options: { now?: Date; maximumAgeHours?: number } = {}
) {
  const now = options.now ?? new Date();
  const maximumAgeHours = positiveHours(options.maximumAgeHours, 26);
  const ingestionJobs = await prisma.ingestionJob.findMany({
    where: {
      jobType: "incremental_update",
      status: { in: ["completed", "completed_with_errors", "failed"] },
      finishedAt: { gte: new Date(now.getTime() - maximumAgeHours * 60 * 60 * 1000) }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, startedAt: true, finishedAt: true, currentSeason: true, metadata: true }
  });

  const entries = await Promise.all(
    scopes.map(async (scope) => {
      const scopeIngestion = selectLatestIngestionAttempt(ingestionJobs, scope.leagueId, scope.season);
      const exactUpcomingFixtureIds = scopeIngestion
        ? completedIngestionUpcomingFixtureIds(scopeIngestion.job.metadata, scope.leagueId, scope.season)
        : null;
      const exactUpcomingFixtureBigInts = exactUpcomingFixtureIds
        ? parseFixtureIds(exactUpcomingFixtureIds)
        : null;
      const exactFixtureEvidenceAvailable = exactUpcomingFixtureBigInts !== null
        && exactUpcomingFixtureBigInts.length === exactUpcomingFixtureIds?.length;
      const [audit, activePlayers, upcomingFixtures, upcomingFixturesPersisted, currentUpcomingFixturesFromDiscovery] = await Promise.all([
        prisma.dataQualityAuditRun.findFirst({
          where: { leagueId: scope.leagueId, season: scope.season },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            gatePassed: true,
            coverageThreshold: true,
            forecastCoverage: true,
            finishedMatches: true,
            startedAt: true,
            completedAt: true
          }
        }),
        prisma.teamPlayerSeason.count({
          where: { leagueId: scope.leagueId, season: scope.season, active: true }
        }),
        prisma.coreMatch.count({
          where: {
            leagueId: scope.leagueId,
            season: scope.season,
            finished: false,
            cancelled: false,
            matchDate: { gt: now }
          }
        }),
        exactFixtureEvidenceAvailable
          ? prisma.coreMatch.count({
              where: {
                leagueId: scope.leagueId,
                season: scope.season,
                id: { in: exactUpcomingFixtureBigInts }
              }
            })
          : Promise.resolve(null),
        exactFixtureEvidenceAvailable
          ? prisma.coreMatch.count({
              where: {
                leagueId: scope.leagueId,
                season: scope.season,
                id: { in: exactUpcomingFixtureBigInts },
                finished: false,
                cancelled: false,
                matchDate: { gt: now }
              }
            })
          : Promise.resolve(null)
      ]);
      const readiness = evaluatePlannerReadiness({
        leagueId: scope.leagueId,
        season: scope.season,
        activePlayers,
        upcomingFixtures,
        maximumAgeHours,
        now,
        audit,
        ingestion: scopeIngestion
          ? {
              id: scopeIngestion.job.id,
              status: String(scopeIngestion.evidence.status),
              startedAt: scopeIngestion.job.startedAt,
              finishedAt: validDate(scopeIngestion.evidence?.finished_at) ?? scopeIngestion.job.finishedAt,
              upcomingFixturesDiscovered: Number(scopeIngestion.evidence?.upcoming_fixtures_discovered ?? 0),
              upcomingFixturesPersisted,
              currentUpcomingFixturesFromDiscovery
            }
          : null
      });
      return [plannerReadinessKey(scope), readiness] as const;
    })
  );

  return new Map(entries);
}

export function completedIngestionScope(metadataValue: unknown, leagueId: bigint, season: string) {
  const metadata = metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)
    ? metadataValue as Record<string, unknown>
    : {};
  const scopes = Array.isArray(metadata.completed_canonical_scopes) ? metadata.completed_canonical_scopes : [];
  return scopes
    .map((value) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null)
    .find((scope) => scope
      && String(scope.league_id) === String(leagueId)
      && String(scope.season) === season) ?? null;
}

export function completedIngestionUpcomingFixtureIds(metadataValue: unknown, leagueId: bigint, season: string) {
  const metadata = metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)
    ? metadataValue as Record<string, unknown>
    : {};
  const scopes = Array.isArray(metadata.completed_scopes) ? metadata.completed_scopes : [];
  const matchingScopes = scopes
    .map((value) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null)
    .filter((scope): scope is Record<string, unknown> => Boolean(scope)
      && String(scope?.canonical_league_id) === String(leagueId)
      && String(scope?.season) === season);
  if (matchingScopes.length === 0 || matchingScopes.some((scope) => !Array.isArray(scope.upcoming_fixture_ids))) return null;

  return [...new Set(matchingScopes.flatMap((scope) => (scope.upcoming_fixture_ids as unknown[]).map(String)))];
}

type IngestionAttemptJob = {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  currentSeason: string | null;
  metadata: unknown;
};

export function selectLatestIngestionAttempt(jobs: IngestionAttemptJob[], leagueId: bigint, season: string) {
  for (const job of jobs) {
    const completedEvidence = completedIngestionScope(job.metadata, leagueId, season);
    if (completedEvidence) return { job, evidence: completedEvidence };

    const metadata = job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata as Record<string, unknown>
      : {};
    const currentCanonicalLeagueId = metadata.current_scope_canonical_league_id;
    if (job.status === "failed"
      && String(currentCanonicalLeagueId) === String(leagueId)
      && job.currentSeason === season) {
      return {
        job,
        evidence: {
          league_id: String(leagueId),
          season,
          status: "failed",
          upcoming_fixtures_discovered: 0,
          finished_at: job.finishedAt?.toISOString() ?? null
        }
      };
    }
  }
  return null;
}

function validDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFixtureIds(values: string[]) {
  try {
    return values.map((value) => BigInt(value));
  } catch {
    return null;
  }
}

export function selectPlannerSeason(
  requestedSeason: string | undefined,
  seasons: SharedLeagueSeasonOption[],
  readinessByScope: ReadonlyMap<string, PlannerReadiness>
) {
  const explicitlyRequested = requestedSeason ? seasons.find((option) => option.season === requestedSeason) ?? null : null;
  if (explicitlyRequested) {
    return {
      option: explicitlyRequested,
      readiness: readinessByScope.get(plannerReadinessKey(explicitlyRequested)) ?? null,
      explicit: true
    };
  }

  const option = [...seasons]
    .filter((candidate) => readinessByScope.get(plannerReadinessKey(candidate))?.ready === true)
    .sort(compareNewestSeason)[0] ?? null;
  return {
    option,
    readiness: option ? readinessByScope.get(plannerReadinessKey(option)) ?? null : null,
    explicit: false
  };
}

export function evaluatePlannerDefaultScope(
  leagueId: string,
  seasons: SharedLeagueSeasonOption[],
  readinessByScope: ReadonlyMap<string, PlannerReadiness>,
  configuredScopeKeys: ReadonlySet<string>
) {
  const selection = selectPlannerSeason(undefined, seasons, readinessByScope);
  const scopeKey = selection.option ? plannerReadinessKey(selection.option) : null;
  const configured = scopeKey !== null && configuredScopeKeys.has(scopeKey);
  return {
    leagueId,
    healthy: selection.readiness?.ready === true && configured,
    reason: !selection.option ? "NO_FORECAST_READY_SEASON" as const : configured ? null : "DEFAULT_PLANNER_SCOPE_NOT_CONFIGURED" as const,
    scope: selection.option ? { leagueId, season: selection.option.season } : null,
    configured,
    readiness: selection.readiness
  };
}

export function plannerReadinessKey(scope: Pick<SharedLeagueSeasonOption, "leagueId" | "season">) {
  return `${scope.leagueId}:${scope.season}`;
}

function compareNewestSeason(left: SharedLeagueSeasonOption, right: SharedLeagueSeasonOption) {
  return Number(right.isCurrent) - Number(left.isCurrent) || right.updatedAt.getTime() - left.updatedAt.getTime() || right.season.localeCompare(left.season);
}

function ageHours(value: Date | null, now: Date) {
  if (!value) return null;
  return Math.round(((now.getTime() - value.getTime()) / 3_600_000) * 1000) / 1000;
}

function positiveHours(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
