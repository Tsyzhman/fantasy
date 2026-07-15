import assert from "node:assert/strict";
import test from "node:test";

import {
  betaRequiredJourneyMilestones,
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
  assert.equal(report.gate.passed, true);
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

test("valid moderator review requires every human-only judgment", () => {
  const base = {
    runId: "22222222-2222-4222-8222-222222222222",
    valid: true,
    withoutHelp: true,
    transferReasonUnderstood: true,
    usabilityRating: 5,
    criticalIssue: false,
    invalidReason: null,
    moderatorNotes: null
  };
  assert.equal(validateBetaReviewInput(base).ok, true);
  assert.equal(validateBetaReviewInput({ ...base, transferReasonUnderstood: null }).ok, false);
  assert.equal(validateBetaReviewInput({ ...base, usabilityRating: 6 }).ok, false);
  assert.equal(validateBetaReviewInput({ ...base, valid: false, invalidReason: "Environment failed", withoutHelp: null }).ok, true);
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
  } = {}
): BetaTestRunForReport {
  const startedAt = new Date(Date.UTC(2026, 6, 15, 12, 0, 0) + (overrides.startedAtOffsetMs ?? index * 1_000));
  const durationStepMs = overrides.durationStepMs ?? 20_000;
  const milestones = ["JOURNEY_STARTED", ...betaRequiredJourneyMilestones];
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
    startedAt,
    observations: milestones.map((name, milestoneIndex) => ({
      kind: "MILESTONE",
      name,
      route: milestoneIndex < 2 ? "/machete/players" : "/machete/squad",
      value: null,
      count: 1,
      createdAt: new Date(startedAt.getTime() + milestoneIndex * durationStepMs)
    }))
  };
}
