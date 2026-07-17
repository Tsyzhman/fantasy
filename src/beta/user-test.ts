export const betaTestMilestones = [
  "JOURNEY_STARTED",
  "PLAYER_FORECAST_FOUND",
  "PLANNER_OPENED",
  "AUTO_PICK_COMPLETED",
  "BUDGET_FORECAST_VIEWED",
  "TRANSFER_TIPS_VIEWED",
  "SQUAD_SAVED",
  "SQUAD_RESTORED",
  "JOURNEY_ABORTED"
] as const;

export const betaClientMilestones = betaTestMilestones.filter(
  (milestone): milestone is Exclude<BetaTestMilestone, "JOURNEY_STARTED"> => milestone !== "JOURNEY_STARTED"
);

export const betaWebVitalNames = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
export const betaWebVitalRatings = ["good", "needs-improvement", "poor"] as const;
export const betaModeratedEnvironments = [
  "DESKTOP_BROWSER",
  "IOS_SAFARI_PHYSICAL",
  "ANDROID_CHROME_PHYSICAL",
  "OTHER_MOBILE"
] as const;
export const betaClientErrorNames = [
  "PLAYER_POOL_LOAD_FAILED",
  "SQUAD_SAVE_FAILED",
  "WINDOW_ERROR",
  "UNHANDLED_REJECTION"
] as const;

export const betaRequiredJourneyMilestones = [
  "PLAYER_FORECAST_FOUND",
  "PLANNER_OPENED",
  "AUTO_PICK_COMPLETED",
  "BUDGET_FORECAST_VIEWED",
  "TRANSFER_TIPS_VIEWED",
  "SQUAD_SAVED",
  "SQUAD_RESTORED"
] as const;

export const betaJourneyMaximumDurationMs = 5 * 60 * 1_000;
export const betaRumMinimumLcpParticipants = 10;
export const betaRumMaximumLcpP75Ms = 2_500;

export type BetaTestMilestone = (typeof betaTestMilestones)[number];
export type BetaWebVitalName = (typeof betaWebVitalNames)[number];
export type BetaWebVitalRating = (typeof betaWebVitalRatings)[number];
export type BetaClientErrorName = (typeof betaClientErrorNames)[number];
export type BetaDeviceClass = "mobile" | "desktop";
export type BetaModeratedEnvironment = (typeof betaModeratedEnvironments)[number];
export type BetaObservationKind = "MILESTONE" | "PAGE_VIEW" | "WEB_VITAL" | "CLIENT_ERROR";

export type BetaTelemetryCommand =
  | {
      action: "start";
      runId: string;
      deviceClass: BetaDeviceClass;
      viewportWidth: number;
      synthetic: boolean;
    }
  | {
      action: "observe";
      runId: string;
      kind: BetaObservationKind;
      name: string;
      route: string;
      value: number | null;
      rating: BetaWebVitalRating | null;
    };

export type BetaTelemetryParseResult =
  | { ok: true; command: BetaTelemetryCommand }
  | { ok: false; error: string };

export function parseBetaTelemetryCommand(value: unknown): BetaTelemetryParseResult {
  const input = objectRecord(value);
  if (!input) return { ok: false, error: "Telemetry payload must be a JSON object." };
  const action = input.action;
  const runId = typeof input.runId === "string" ? input.runId : "";
  if (!isUuid(runId)) return { ok: false, error: "runId must be a UUID." };

  if (action === "start") {
    if (input.deviceClass !== "mobile" && input.deviceClass !== "desktop") {
      return { ok: false, error: "deviceClass must be mobile or desktop." };
    }
    const viewportWidth = finiteInteger(input.viewportWidth);
    if (viewportWidth === null || viewportWidth < 240 || viewportWidth > 10_000) {
      return { ok: false, error: "viewportWidth must be an integer between 240 and 10000." };
    }
    if (typeof input.synthetic !== "boolean") {
      return { ok: false, error: "synthetic must be a boolean." };
    }
    return {
      ok: true,
      command: { action, runId, deviceClass: input.deviceClass, viewportWidth, synthetic: input.synthetic }
    };
  }

  if (action !== "observe") return { ok: false, error: "action must be start or observe." };
  const route = parseBetaRoute(input.route);
  if (route === null) return { ok: false, error: "route must be a pathname without a query or fragment." };
  const kind = input.kind;
  const name = input.name;
  if (kind === "MILESTONE") {
    if (typeof name !== "string" || !betaClientMilestones.includes(name as never)) {
      return { ok: false, error: "Unknown beta-test milestone." };
    }
    return { ok: true, command: { action, runId, kind, name, route, value: null, rating: null } };
  }
  if (kind === "PAGE_VIEW") {
    if (name !== "ROUTE") return { ok: false, error: "PAGE_VIEW name must be ROUTE." };
    return { ok: true, command: { action, runId, kind, name, route, value: null, rating: null } };
  }
  if (kind === "CLIENT_ERROR") {
    if (typeof name !== "string" || !betaClientErrorNames.includes(name as never)) {
      return { ok: false, error: "Unknown client error category." };
    }
    return { ok: true, command: { action, runId, kind, name, route, value: null, rating: null } };
  }
  if (kind === "WEB_VITAL") {
    if (typeof name !== "string" || !betaWebVitalNames.includes(name as never)) {
      return { ok: false, error: "Unknown Web Vital name." };
    }
    const metricValue = finiteNumber(input.value);
    if (metricValue === null || metricValue < 0 || metricValue > 1_000_000) {
      return { ok: false, error: "Web Vital value is outside the accepted range." };
    }
    if (typeof input.rating !== "string" || !betaWebVitalRatings.includes(input.rating as never)) {
      return { ok: false, error: "Unknown Web Vital rating." };
    }
    return {
      ok: true,
      command: { action, runId, kind, name, route, value: metricValue, rating: input.rating as BetaWebVitalRating }
    };
  }
  return { ok: false, error: "Unknown telemetry observation kind." };
}

export function parseBetaRoute(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) return null;
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || /[\r\n\0]/.test(value)) return null;
  return value;
}

export type BetaTestObservationForReport = {
  kind: string;
  name: string;
  route: string;
  value: number | null;
  rating: string | null;
  count: number;
  createdAt: Date;
};

export type BetaTestRunForReport = {
  id: string;
  userId: string;
  deviceClass: string;
  synthetic: boolean;
  valid: boolean | null;
  withoutHelp: boolean | null;
  transferReasonUnderstood: boolean | null;
  usabilityRating: number | null;
  criticalIssue: boolean | null;
  moderatedEnvironment: string | null;
  invalidReason: string | null;
  startedAt: Date;
  observations: BetaTestObservationForReport[];
};

export type BetaTechnicalRunSummary = {
  runId: string;
  deviceClass: string;
  technicalComplete: boolean;
  aborted: boolean;
  durationMs: number | null;
  forecastFound: boolean;
  transferTipsViewed: boolean;
  clientErrors: number;
  missingMilestones: string[];
};

export function summarizeBetaTechnicalRun(run: BetaTestRunForReport): BetaTechnicalRunSummary {
  const firstMilestoneAt = new Map<string, Date>();
  let clientErrors = 0;
  for (const observation of run.observations) {
    if (observation.kind === "MILESTONE") {
      const current = firstMilestoneAt.get(observation.name);
      if (!current || observation.createdAt < current) firstMilestoneAt.set(observation.name, observation.createdAt);
    }
    if (observation.kind === "CLIENT_ERROR") clientErrors += 1;
  }

  const missingMilestones = betaRequiredJourneyMilestones.filter((milestone) => !firstMilestoneAt.has(milestone));
  const aborted = firstMilestoneAt.has("JOURNEY_ABORTED");
  const restoredAt = firstMilestoneAt.get("SQUAD_RESTORED") ?? null;
  const durationMs = restoredAt ? Math.max(0, restoredAt.getTime() - run.startedAt.getTime()) : null;
  const orderedNames = ["PLAYER_FORECAST_FOUND", "PLANNER_OPENED", "AUTO_PICK_COMPLETED", "BUDGET_FORECAST_VIEWED", "SQUAD_SAVED", "SQUAD_RESTORED"];
  const orderedTimes = orderedNames.map((name) => firstMilestoneAt.get(name)?.getTime() ?? null);
  const sequenceIsOrdered = orderedTimes.every((time, index) => index === 0 || time === null || orderedTimes[index - 1] === null || time >= orderedTimes[index - 1]!);
  const tipsAt = firstMilestoneAt.get("TRANSFER_TIPS_VIEWED")?.getTime() ?? null;
  const plannerAt = firstMilestoneAt.get("PLANNER_OPENED")?.getTime() ?? null;
  const restoreTime = restoredAt?.getTime() ?? null;
  const tipsAreInJourney = tipsAt !== null && plannerAt !== null && restoreTime !== null && tipsAt >= plannerAt && tipsAt <= restoreTime;
  const technicalComplete =
    !aborted &&
    missingMilestones.length === 0 &&
    sequenceIsOrdered &&
    tipsAreInJourney &&
    durationMs !== null &&
    durationMs <= betaJourneyMaximumDurationMs;

  return {
    runId: run.id,
    deviceClass: run.deviceClass,
    technicalComplete,
    aborted,
    durationMs,
    forecastFound: firstMilestoneAt.has("PLAYER_FORECAST_FOUND"),
    transferTipsViewed: firstMilestoneAt.has("TRANSFER_TIPS_VIEWED"),
    clientErrors,
    missingMilestones
  };
}

export function buildBetaUserTestReport(runs: BetaTestRunForReport[]) {
  const realRuns = runs.filter((run) => !run.synthetic);
  const invalidRuns = realRuns.filter((run) => run.valid === false);
  const pendingRuns = realRuns
    .filter((run) => run.valid === null)
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime() || left.id.localeCompare(right.id));
  const validRuns = realRuns.filter((run) => run.valid === true).sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  const firstValidRunByUser = new Map<string, BetaTestRunForReport>();
  for (const run of validRuns) {
    if (!firstValidRunByUser.has(run.userId)) firstValidRunByUser.set(run.userId, run);
  }
  const primaryRuns = [...firstValidRunByUser.values()];
  const summaries = primaryRuns.map((run) => ({ run, technical: summarizeBetaTechnicalRun(run) }));
  const participants = summaries.length;
  const completionSuccesses = summaries.filter(
    ({ run, technical }) => technical.technicalComplete && run.withoutHelp === true && run.criticalIssue === false
  ).length;
  const forecastSuccesses = summaries.filter(({ technical }) => technical.forecastFound).length;
  const transferUnderstandingSuccesses = summaries.filter(({ run }) => run.transferReasonUnderstood === true).length;
  const ratings = summaries.map(({ run }) => run.usabilityRating).filter((rating): rating is number => typeof rating === "number");
  const averageUsabilityRating = ratings.length > 0 ? round(ratings.reduce((total, rating) => total + rating, 0) / ratings.length, 3) : null;
  const criticalIssues = summaries.filter(({ run }) => run.criticalIssue === true).length;
  const mobileCriticalIssues = summaries.filter(({ run }) => run.deviceClass === "mobile" && run.criticalIssue === true).length;
  const physicalIosSafariRuns = summaries.filter(
    ({ run }) => run.deviceClass === "mobile" && run.moderatedEnvironment === "IOS_SAFARI_PHYSICAL"
  ).length;
  const physicalAndroidChromeRuns = summaries.filter(
    ({ run }) => run.deviceClass === "mobile" && run.moderatedEnvironment === "ANDROID_CHROME_PHYSICAL"
  ).length;
  const physicalEnvironmentMismatches = summaries.filter(
    ({ run }) =>
      run.deviceClass !== "mobile" &&
      (run.moderatedEnvironment === "IOS_SAFARI_PHYSICAL" || run.moderatedEnvironment === "ANDROID_CHROME_PHYSICAL")
  ).length;
  const incompleteReviews = summaries.filter(
    ({ run }) =>
      run.withoutHelp === null ||
      run.transferReasonUnderstood === null ||
      run.usabilityRating === null ||
      run.criticalIssue === null ||
      !betaModeratedEnvironments.includes(run.moderatedEnvironment as BetaModeratedEnvironment)
  ).length;
  const completionRate = percentage(completionSuccesses, participants);
  const forecastFoundRate = percentage(forecastSuccesses, participants);
  const transferUnderstandingRate = percentage(transferUnderstandingSuccesses, participants);
  const webVitals = summarizeWebVitals(primaryRuns);
  const rum = summarizeRealBetaRum(realRuns);
  const violations: string[] = [];
  if (pendingRuns.length > 0) violations.push(`${pendingRuns.length} real beta-test runs are still awaiting moderator review.`);
  if (participants < 10) violations.push(`Need at least 10 distinct valid participants; observed ${participants}.`);
  if (incompleteReviews > 0) violations.push(`${incompleteReviews} primary participant reviews are incomplete.`);
  if (completionRate === null || completionRate < 80) violations.push(`Independent completion rate must be at least 80%; observed ${formatRate(completionRate)}.`);
  if (forecastFoundRate === null || forecastFoundRate < 80) violations.push(`Forecast discovery rate must be at least 80%; observed ${formatRate(forecastFoundRate)}.`);
  if (transferUnderstandingRate === null || transferUnderstandingRate < 70) violations.push(`Transfer-reason understanding must be at least 70%; observed ${formatRate(transferUnderstandingRate)}.`);
  if (averageUsabilityRating === null || averageUsabilityRating < 4) violations.push(`Average usability rating must be at least 4/5; observed ${averageUsabilityRating ?? "not measured"}.`);
  if (criticalIssues > 0) violations.push(`${criticalIssues} primary participants reported a critical/blocker issue.`);
  if (mobileCriticalIssues > 0) violations.push(`${mobileCriticalIssues} mobile primary participants reported a critical/blocker issue.`);
  if (physicalIosSafariRuns < 1) violations.push("Need at least one moderator-confirmed physical Safari iOS primary run.");
  if (physicalAndroidChromeRuns < 1) violations.push("Need at least one moderator-confirmed physical Chrome Android primary run.");
  if (physicalEnvironmentMismatches > 0) violations.push(`${physicalEnvironmentMismatches} physical-device reviews conflict with the recorded viewport device class.`);
  violations.push(...rum.gate.violations);

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    syntheticRuns: runs.filter((run) => run.synthetic).length,
    pendingReviewRuns: pendingRuns.length,
    pendingReviews: pendingRuns.map((run) => {
      const technical = summarizeBetaTechnicalRun(run);
      return {
        runId: run.id,
        participantCode: run.id.slice(0, 8),
        startedAt: run.startedAt.toISOString(),
        deviceClass: run.deviceClass,
        technicalComplete: technical.technicalComplete,
        aborted: technical.aborted,
        durationMs: technical.durationMs,
        missingMilestones: technical.missingMilestones,
        clientErrors: technical.clientErrors
      };
    }),
    invalidRuns: invalidRuns.length,
    invalidAttempts: invalidRuns.map((run) => {
      const technical = summarizeBetaTechnicalRun(run);
      return {
        participantCode: run.id.slice(0, 8),
        startedAt: run.startedAt.toISOString(),
        deviceClass: run.deviceClass,
        moderatedEnvironment: run.moderatedEnvironment,
        invalidReason: run.invalidReason,
        technicalComplete: technical.technicalComplete,
        aborted: technical.aborted,
        missingMilestones: technical.missingMilestones,
        clientErrors: technical.clientErrors
      };
    }),
    validRuns: validRuns.length,
    repeatValidRuns: Math.max(0, validRuns.length - participants),
    participants,
    completionSuccesses,
    completionRate,
    forecastSuccesses,
    forecastFoundRate,
    transferUnderstandingSuccesses,
    transferUnderstandingRate,
    averageUsabilityRating,
    criticalIssues,
    mobileCriticalIssues,
    physicalDeviceCoverage: {
      iosSafari: physicalIosSafariRuns,
      androidChrome: physicalAndroidChromeRuns,
      inconsistent: physicalEnvironmentMismatches,
      passed: physicalIosSafariRuns > 0 && physicalAndroidChromeRuns > 0
    },
    incompleteReviews,
    clientErrors: summaries.reduce((total, summary) => total + summary.technical.clientErrors, 0),
    webVitals,
    rum,
    primaryRuns: summaries.map(({ run, technical }) => ({
      participantCode: run.id.slice(0, 8),
      startedAt: run.startedAt.toISOString(),
      withoutHelp: run.withoutHelp,
      transferReasonUnderstood: run.transferReasonUnderstood,
      usabilityRating: run.usabilityRating,
      criticalIssue: run.criticalIssue,
      moderatedEnvironment: run.moderatedEnvironment,
      ...technical
    })),
    gate: { passed: violations.length === 0, violations }
  };
}

function summarizeRealBetaRum(runs: BetaTestRunForReport[]) {
  const participantIds = new Set(runs.map((run) => run.userId));
  const lcpParticipantIds = new Set<string>();
  const runsWithClientErrors = new Set<string>();
  let pageViews = 0;
  let clientErrors = 0;
  let firstObservedAt: Date | null = null;
  let lastObservedAt: Date | null = null;

  for (const run of runs) {
    firstObservedAt = earlierDate(firstObservedAt, run.startedAt);
    lastObservedAt = laterDate(lastObservedAt, run.startedAt);
    for (const observation of run.observations) {
      lastObservedAt = laterDate(lastObservedAt, observation.createdAt);
      if (observation.kind === "PAGE_VIEW") pageViews += 1;
      if (observation.kind === "CLIENT_ERROR") {
        clientErrors += 1;
        runsWithClientErrors.add(run.id);
      }
      if (observation.kind === "WEB_VITAL" && observation.name === "LCP" && observation.value !== null) {
        lcpParticipantIds.add(run.userId);
      }
    }
  }

  const webVitals = summarizeWebVitals(runs);
  const lcp = webVitals.LCP;
  const violations: string[] = [];
  if (lcpParticipantIds.size < betaRumMinimumLcpParticipants) {
    violations.push(
      `RUM needs LCP observations from at least ${betaRumMinimumLcpParticipants} distinct real participants; observed ${lcpParticipantIds.size}.`
    );
  }
  if (lcp.p75 === null) {
    violations.push("RUM LCP p75 is not measured.");
  } else if (lcp.p75 > betaRumMaximumLcpP75Ms) {
    violations.push(`RUM LCP p75 must be at most ${betaRumMaximumLcpP75Ms} ms; observed ${lcp.p75} ms.`);
  }

  return {
    realRuns: runs.length,
    distinctParticipants: participantIds.size,
    lcpParticipants: lcpParticipantIds.size,
    firstObservedAt: firstObservedAt?.toISOString() ?? null,
    lastObservedAt: lastObservedAt?.toISOString() ?? null,
    observationWindowHours:
      firstObservedAt && lastObservedAt
        ? round(Math.max(0, lastObservedAt.getTime() - firstObservedAt.getTime()) / (60 * 60 * 1_000), 3)
        : null,
    pageViews,
    clientErrors,
    runsWithClientErrors: runsWithClientErrors.size,
    clientErrorAffectedRunRate: percentage(runsWithClientErrors.size, runs.length),
    webVitals,
    gate: {
      passed: violations.length === 0,
      maximumLcpP75Ms: betaRumMaximumLcpP75Ms,
      minimumLcpParticipants: betaRumMinimumLcpParticipants,
      violations
    }
  };
}

export type BetaReviewInput = {
  runId: string;
  valid: boolean;
  withoutHelp: boolean | null;
  transferReasonUnderstood: boolean | null;
  usabilityRating: number | null;
  criticalIssue: boolean | null;
  moderatedEnvironment: BetaModeratedEnvironment | null;
  invalidReason: string | null;
  moderatorNotes: string | null;
};

export function validateBetaReviewInput(input: BetaReviewInput) {
  if (!isUuid(input.runId)) return { ok: false as const, error: "runId must be a UUID." };
  if (input.moderatorNotes && input.moderatorNotes.length > 500) return { ok: false as const, error: "moderatorNotes is too long." };
  if (!input.moderatedEnvironment || !betaModeratedEnvironments.includes(input.moderatedEnvironment)) {
    return { ok: false as const, error: "moderatedEnvironment is required for every reviewed run." };
  }
  if (!input.valid) {
    if (!input.invalidReason?.trim()) return { ok: false as const, error: "invalidReason is required for an invalid run." };
    if (input.invalidReason.length > 200) return { ok: false as const, error: "invalidReason is too long." };
    return { ok: true as const, value: input };
  }
  if (typeof input.withoutHelp !== "boolean") return { ok: false as const, error: "withoutHelp is required for a valid run." };
  if (typeof input.transferReasonUnderstood !== "boolean") return { ok: false as const, error: "transferReasonUnderstood is required for a valid run." };
  if (!Number.isInteger(input.usabilityRating) || (input.usabilityRating ?? 0) < 1 || (input.usabilityRating ?? 0) > 5) {
    return { ok: false as const, error: "usabilityRating must be an integer from 1 to 5." };
  }
  if (typeof input.criticalIssue !== "boolean") return { ok: false as const, error: "criticalIssue is required for a valid run." };
  return { ok: true as const, value: { ...input, invalidReason: null } };
}

function summarizeWebVitals(runs: BetaTestRunForReport[]) {
  const values = new Map<string, number[]>();
  const ratings = new Map<string, { good: number; needsImprovement: number; poor: number }>();
  for (const run of runs) {
    for (const observation of run.observations) {
      if (observation.kind !== "WEB_VITAL" || observation.value === null || !betaWebVitalNames.includes(observation.name as never)) continue;
      const current = values.get(observation.name) ?? [];
      current.push(observation.value);
      values.set(observation.name, current);
      const ratingCounts = ratings.get(observation.name) ?? { good: 0, needsImprovement: 0, poor: 0 };
      if (observation.rating === "good") ratingCounts.good += 1;
      if (observation.rating === "needs-improvement") ratingCounts.needsImprovement += 1;
      if (observation.rating === "poor") ratingCounts.poor += 1;
      ratings.set(observation.name, ratingCounts);
    }
  }
  return Object.fromEntries(
    betaWebVitalNames.map((name) => {
      const samples = values.get(name) ?? [];
      return [
        name,
        {
          samples: samples.length,
          p75: nearestRank(samples, 0.75),
          ratings: ratings.get(name) ?? { good: 0, needsImprovement: 0, poor: 0 }
        }
      ];
    })
  );
}

function earlierDate(current: Date | null, candidate: Date) {
  return !current || candidate < current ? candidate : current;
}

function laterDate(current: Date | null, candidate: Date) {
  return !current || candidate > current ? candidate : current;
}

function nearestRank(values: number[], percentile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)] ?? 0, 3);
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100, 3) : null;
}

function formatRate(value: number | null) {
  return value === null ? "not measured" : `${value}%`;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteInteger(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
