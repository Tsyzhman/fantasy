import assert from "node:assert/strict";
import test from "node:test";

import {
  betaRequiredJourneyMilestones,
  betaRumMaximumLcpP75Ms,
  buildBetaUserTestReport,
  parseBetaTelemetryCommand,
  summarizeBetaTechnicalRun,
  validateBetaReviewInput,
  type BetaTestRunForReport
} from "./user-test";

test("telemetry input accepts bounded allowlisted observations and rejects arbitrary data", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseBetaTelemetryCommand({
    action: "observe",
    runId,
    kind: "WEB_VITAL",
    name: "LCP",
    route: "/machete/players",
    value: 1234.5,
    rating: "good"
  }), {
    ok: true,
    command: {
      action: "observe",
      runId,
      kind: "WEB_VITAL",
      name: "LCP",
      route: "/machete/players",
      value: 1234.5,
      rating: "good"
    }
  });
  assert.equal(parseBetaTelemetryCommand({ action: "observe", runId, kind: "MILESTONE", name: "FAKE_SUCCESS", route: "/" }).ok, false);
  assert.equal(parseBetaTelemetryCommand({ action: "observe", runId, kind: "PAGE_VIEW", name: "ROUTE", route: "/players?email=x" }).ok, false);
  assert.equal(parseBetaTelemetryCommand({ action: "start", runId, deviceClass: "tablet", viewportWidth: 800, synthetic: false }).ok, false);
});

test("technical completion requires every milestone, correct order, and five-minute limit", () => {
  const complete = makeRun(1);
  assert.equal(summarizeBetaTechnicalRun(complete).technicalComplete, true);

  const slow = makeRun(2, { durationStepMs: 60_000 });
  assert.equal(summarizeBetaTechnicalRun(slow).technicalComplete, false);

  const missing = makeRun(3);
  missing.observations = missing.observations.filter((observation) => observation.name !== "TRANSFER_TIPS_VIEWED");
  const missingSummary = summarizeBetaTechnicalRun(missing);
  assert.equal(missingSummary.technicalComplete, false);
  assert.deepEqual(missingSummary.missingMilestones, ["TRANSFER_TIPS_VIEWED"]);

  const aborted = makeRun(4);
  aborted.observations.push({
    kind: "MILESTONE",
    name: "JOURNEY_ABORTED",
    route: "/machete/squad",
    value: null,
    rating: null,
    count: 1,
    createdAt: new Date(aborted.startedAt.getTime() + 20_000)
  });
  const abortedSummary = summarizeBetaTechnicalRun(aborted);
  assert.equal(abortedSummary.aborted, true);
  assert.equal(abortedSummary.technicalComplete, false);
});

test("beta gate passes exact SMART thresholds on first valid run per ten users", () => {
  const runs = Array.from({ length: 10 }, (_, index) => makeRun(index + 1, {
    withoutHelp: index < 8,
    transferReasonUnderstood: index < 7,
    usabilityRating: 4
  }));
  const report = buildBetaUserTestReport(runs);
  assert.equal(report.participants, 10);
  assert.equal(report.completionRate, 80);
  assert.equal(report.forecastFoundRate, 100);
  assert.equal(report.transferUnderstandingRate, 70);
  assert.equal(report.averageUsabilityRating, 4);
  assert.equal(report.rum.lcpParticipants, 10);
  assert.equal(report.rum.webVitals.LCP.p75, 2_000);
  assert.deepEqual(report.rum.webVitals.LCP.ratings, { good: 10, needsImprovement: 0, poor: 0 });
  assert.deepEqual(report.physicalDeviceCoverage, { iosSafari: 1, androidChrome: 1, inconsistent: 0, passed: true });
  assert.equal(report.rum.gate.passed, true);
  assert.equal(report.gate.passed, true);
});

test("beta gate rejects slow or insufficient real-user RUM", () => {
  const insufficient = buildBetaUserTestReport(Array.from({ length: 9 }, (_, index) => makeRun(index + 40)));
  assert.equal(insufficient.rum.gate.passed, false);
  assert.match(insufficient.rum.gate.violations.join(" "), /at least 10 distinct real participants/);

  const slowRuns = Array.from({ length: 10 }, (_, index) => makeRun(index + 60, { lcpMs: betaRumMaximumLcpP75Ms + 1 }));
  const slow = buildBetaUserTestReport(slowRuns);
  assert.equal(slow.rum.webVitals.LCP.p75, betaRumMaximumLcpP75Ms + 1);
  assert.equal(slow.rum.gate.passed, false);
  assert.equal(slow.gate.passed, false);
});

test("beta gate requires moderator-confirmed physical Safari iOS and Chrome Android", () => {
  const desktopOnly = Array.from({ length: 10 }, (_, index) => makeRun(index + 100, {
    moderatedEnvironment: "DESKTOP_BROWSER"
  }));
  const report = buildBetaUserTestReport(desktopOnly);
  assert.deepEqual(report.physicalDeviceCoverage, { iosSafari: 0, androidChrome: 0, inconsistent: 0, passed: false });
  assert.match(report.gate.violations.join(" "), /physical Safari iOS/);
  assert.match(report.gate.violations.join(" "), /physical Chrome Android/);
  assert.equal(report.gate.passed, false);

  const mismatchRuns = desktopOnly.map((run) => ({ ...run }));
  mismatchRuns[0] = { ...mismatchRuns[0]!, deviceClass: "desktop", moderatedEnvironment: "IOS_SAFARI_PHYSICAL" };
  const mismatch = buildBetaUserTestReport(mismatchRuns);
  assert.equal(mismatch.physicalDeviceCoverage.inconsistent, 1);
  assert.match(mismatch.gate.violations.join(" "), /conflict with the recorded viewport device class/);
});

test("RUM includes every real run and excludes synthetic telemetry", () => {
  const pendingWithError = makeRun(80, { valid: null, clientErrorCount: 2 });
  const invalid = makeRun(81, { valid: false });
  const synthetic = makeRun(82, { synthetic: true, clientErrorCount: 5 });
  const report = buildBetaUserTestReport([pendingWithError, invalid, synthetic]);
  assert.equal(report.rum.realRuns, 2);
  assert.equal(report.rum.distinctParticipants, 2);
  assert.equal(report.rum.clientErrors, 1);
  assert.equal(report.rum.runsWithClientErrors, 1);
  assert.equal(report.rum.clientErrorAffectedRunRate, 50);
});

test("repeat successes cannot erase a participant's first valid failure", () => {
  const first = makeRun(20);
  first.observations = first.observations.filter((observation) => observation.name !== "SQUAD_RESTORED");
  const retry = makeRun(21, { userId: first.userId, startedAtOffsetMs: 600_000 });
  const report = buildBetaUserTestReport([retry, first]);
  assert.equal(report.participants, 1);
  assert.equal(report.validRuns, 2);
  assert.equal(report.repeatValidRuns, 1);
  assert.equal(report.completionRate, 0);
  assert.equal(report.gate.passed, false);
});

test("synthetic, invalid, and unreviewed runs never satisfy the participant gate", () => {
  const synthetic = makeRun(30, { synthetic: true });
  const invalid = makeRun(31, { valid: false });
  const pending = makeRun(32, { valid: null });
  const report = buildBetaUserTestReport([synthetic, invalid, pending]);
  assert.equal(report.syntheticRuns, 1);
  assert.equal(report.invalidRuns, 1);
  assert.equal(report.pendingReviewRuns, 1);
  assert.equal(report.pendingReviews.length, 1);
  assert.equal(report.pendingReviews[0]?.runId, pending.id);
  assert.equal(report.pendingReviews[0]?.participantCode, pending.id.slice(0, 8));
  assert.equal(report.pendingReviews[0]?.technicalComplete, true);
  assert.equal(JSON.stringify(report.pendingReviews).includes(pending.userId), false);
  assert.equal(report.participants, 0);
  assert.equal(report.gate.passed, false);
});

test("pending real attempts keep an otherwise passing beta gate closed", () => {
  const passingRuns = Array.from({ length: 10 }, (_, index) => makeRun(index + 300));
  const pending = makeRun(399, { valid: null });
  const report = buildBetaUserTestReport([...passingRuns, pending]);

  assert.equal(report.participants, 10);
  assert.equal(report.pendingReviewRuns, 1);
  assert.equal(report.gate.passed, false);
  assert.match(report.gate.violations.join(" "), /awaiting moderator review/);
});

test("invalid attempts remain auditable with environment, reason, and technical evidence", () => {
  const report = buildBetaUserTestReport([
    makeRun(45, { valid: false, moderatedEnvironment: "ANDROID_CHROME_PHYSICAL" })
  ]);

  assert.equal(report.invalidRuns, 1);
  assert.equal(report.invalidAttempts.length, 1);
  assert.equal(report.invalidAttempts[0]?.moderatedEnvironment, "ANDROID_CHROME_PHYSICAL");
  assert.equal(report.invalidAttempts[0]?.invalidReason, "Technical environment failure");
  assert.equal(report.invalidAttempts[0]?.technicalComplete, true);
});

test("valid moderator review requires every human-only judgment", () => {
  const base = {
    runId: "22222222-2222-4222-8222-222222222222",
    valid: true,
    withoutHelp: true,
    transferReasonUnderstood: true,
    usabilityRating: 5,
    criticalIssue: false,
    moderatedEnvironment: "DESKTOP_BROWSER" as const,
    invalidReason: null,
    moderatorNotes: null
  };
  assert.equal(validateBetaReviewInput(base).ok, true);
  assert.equal(validateBetaReviewInput({ ...base, transferReasonUnderstood: null }).ok, false);
  assert.equal(validateBetaReviewInput({ ...base, usabilityRating: 6 }).ok, false);
  assert.equal(validateBetaReviewInput({ ...base, valid: false, invalidReason: "Environment failed", withoutHelp: null }).ok, true);
  assert.equal(validateBetaReviewInput({ ...base, valid: false, invalidReason: "Environment failed", moderatedEnvironment: null }).ok, false);
});

function makeRun(
  index: number,
  overrides: {
    userId?: string;
    synthetic?: boolean;
    valid?: boolean | null;
    withoutHelp?: boolean;
    transferReasonUnderstood?: boolean;
    usabilityRating?: number;
    criticalIssue?: boolean;
    durationStepMs?: number;
    startedAtOffsetMs?: number;
    lcpMs?: number;
    clientErrorCount?: number;
    moderatedEnvironment?: BetaTestRunForReport["moderatedEnvironment"];
  } = {}
): BetaTestRunForReport {
  const startedAt = new Date(Date.UTC(2026, 6, 15, 12, 0, 0) + (overrides.startedAtOffsetMs ?? index * 1_000));
  const durationStepMs = overrides.durationStepMs ?? 20_000;
  const milestones = ["JOURNEY_STARTED", ...betaRequiredJourneyMilestones];
  const observations: BetaTestRunForReport["observations"] = milestones.map((name, milestoneIndex) => ({
    kind: "MILESTONE",
    name,
    route: milestoneIndex < 2 ? "/machete/players" : "/machete/squad",
    value: null,
    rating: null,
    count: 1,
    createdAt: new Date(startedAt.getTime() + milestoneIndex * durationStepMs)
  }));
  observations.push({
    kind: "WEB_VITAL",
    name: "LCP",
    route: "/machete/squad",
    value: overrides.lcpMs ?? 2_000,
    rating: (overrides.lcpMs ?? 2_000) <= betaRumMaximumLcpP75Ms ? "good" : "needs-improvement",
    count: 1,
    createdAt: new Date(startedAt.getTime() + 1_000)
  });
  if ((overrides.clientErrorCount ?? 0) > 0) {
    observations.push({
      kind: "CLIENT_ERROR",
      name: "WINDOW_ERROR",
      route: "/machete/squad",
      value: null,
      rating: null,
      count: overrides.clientErrorCount!,
      createdAt: new Date(startedAt.getTime() + 2_000)
    });
  }
  return {
    id: `${index.toString(16).padStart(8, "0")}-1111-4111-8111-${index.toString(16).padStart(12, "0")}`,
    userId: overrides.userId ?? `user-${index}`,
    deviceClass: index % 2 === 0 ? "mobile" : "desktop",
    synthetic: overrides.synthetic ?? false,
    valid: overrides.valid === undefined ? true : overrides.valid,
    withoutHelp: overrides.withoutHelp ?? true,
    transferReasonUnderstood: overrides.transferReasonUnderstood ?? true,
    usabilityRating: overrides.usabilityRating ?? 5,
    criticalIssue: overrides.criticalIssue ?? false,
    moderatedEnvironment:
      overrides.moderatedEnvironment ??
      (index % 10 === 2 ? "IOS_SAFARI_PHYSICAL" : index % 10 === 4 ? "ANDROID_CHROME_PHYSICAL" : index % 2 === 0 ? "OTHER_MOBILE" : "DESKTOP_BROWSER"),
    invalidReason: overrides.valid === false ? "Technical environment failure" : null,
    startedAt,
    observations
  };
}
