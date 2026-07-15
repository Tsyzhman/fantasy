import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBetaLoadUrl,
  evaluateBetaLoadGate,
  nearestRankPercentile,
  summarizeBetaLoadSamples,
  validateBetaLoadTestConfig,
  type BetaLoadTestResult
} from "./beta_load_test";

test("nearest-rank percentiles match the production performance convention", () => {
  const values = [480, 435, 393, 399, 2_280, 379, 343, 2_439, 449, 383];
  assert.equal(nearestRankPercentile(values, 0.75), 480);
  assert.equal(nearestRankPercentile(values, 0.95), 2_439);
  assert.equal(nearestRankPercentile([], 0.75), null);
});

test("load sample summary keeps latency, payload, and status evidence", () => {
  const summary = summarizeBetaLoadSamples([
    { durationMs: 100, status: 200, bytes: 1_000 },
    { durationMs: 300, status: 503, bytes: 200 },
    { durationMs: 200, status: 200, bytes: 600 },
    { durationMs: 400, status: 200, bytes: 600 }
  ]);

  assert.deepEqual(summary, {
    count: 4,
    p50Ms: 200,
    p75Ms: 300,
    p95Ms: 400,
    p99Ms: 400,
    maxMs: 400,
    averageBytes: 600,
    statuses: [200, 503]
  });
});

test("load gate treats the one-percent error limit as exclusive", () => {
  const passing = loadResult({ errorRate: 0.009, p75Ms: 2_500 });
  const failing = loadResult({ errorRate: 0.01, p75Ms: 2_501 });
  const gate = { maxErrorRateExclusive: 0.01, maxP75MsByTarget: { page: 2_500 } };

  assert.deepEqual(evaluateBetaLoadGate(passing, gate), { passed: true, violations: [] });
  const failure = evaluateBetaLoadGate(failing, gate);
  assert.equal(failure.passed, false);
  assert.equal(failure.violations.length, 2);
});

test("load URL preserves target query parameters and adds a cache buster", () => {
  const url = buildBetaLoadUrl("https://example.test", "/squad?leagueId=47&season=2026%2F2027", "run-1");
  assert.equal(url.origin, "https://example.test");
  assert.equal(url.searchParams.get("leagueId"), "47");
  assert.equal(url.searchParams.get("season"), "2026/2027");
  assert.equal(url.searchParams.get("_beta_load"), "run-1");
});

test("load test safety limits reject external cleartext targets and excessive concurrency", () => {
  assert.throws(
    () =>
      validateBetaLoadTestConfig({
        baseUrl: "http://example.test",
        targets: [{ name: "health", path: "/api/health" }],
        concurrency: 1,
        durationMs: 1_000,
        timeoutMs: 1_000
      }),
    /must use HTTPS/
  );
  assert.throws(
    () =>
      validateBetaLoadTestConfig({
        baseUrl: "http://127.0.0.1:3000",
        targets: [{ name: "health", path: "/api/health" }],
        concurrency: 21,
        durationMs: 1_000,
        timeoutMs: 1_000
      }),
    /between 1 and 20/
  );
});

function loadResult({ errorRate, p75Ms }: { errorRate: number; p75Ms: number }): BetaLoadTestResult {
  return {
    baseUrl: "https://example.test",
    concurrency: 5,
    requestedDurationMs: 60_000,
    actualDurationMs: 60_100,
    attempts: 100,
    failureCount: Math.round(errorRate * 100),
    errorRate,
    targets: {
      page: {
        count: 100,
        p50Ms: 500,
        p75Ms,
        p95Ms: 3_000,
        p99Ms: 4_000,
        maxMs: 4_100,
        averageBytes: 160_000,
        statuses: [200]
      }
    },
    failureExamples: []
  };
}
