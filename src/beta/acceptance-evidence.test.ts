import assert from "node:assert/strict";
import test from "node:test";

import { loadBetaAcceptanceEvidence } from "./acceptance-evidence";

const environmentNames = [
  "BETA_TEST_SERVER_AUDIT_URL", "BETA_TEST_FIXED_WINDOW_EXPECTED_START",
  "BETA_TEST_FIXED_WINDOW_MIN_SPAN_MINUTES", "BETA_TEST_SERVER_AUDIT_MAX_AGE_MINUTES",
  "BETA_TEST_RUM_MIN_SPAN_HOURS", "BETA_TEST_RUM_MAX_AGE_HOURS"
] as const;

test("beta acceptance evidence combines explicit config with the retained server snapshot", async () => {
  await withEnvironment({
    BETA_TEST_SERVER_AUDIT_URL: "https://example.test/_monitor/beta-access-audit.json",
    BETA_TEST_FIXED_WINDOW_EXPECTED_START: "2026-07-17T00:00:00.000Z",
    BETA_TEST_FIXED_WINDOW_MIN_SPAN_MINUTES: "1440",
    BETA_TEST_SERVER_AUDIT_MAX_AGE_MINUTES: "90",
    BETA_TEST_RUM_MIN_SPAN_HOURS: "24",
    BETA_TEST_RUM_MAX_AGE_HOURS: "24"
  }, async () => {
    const evidence = await loadBetaAcceptanceEvidence({
      evaluatedAt: new Date("2026-07-18T01:00:00.000Z"),
      fetchImpl: async () => new Response(JSON.stringify({
        status: "ok", generatedAt: "2026-07-18T00:30:00.000Z", windowMode: "fixed_start",
        windowStart: "2026-07-17T00:00:00.000Z", retentionCoversWindowStart: true,
        requests: 100, serverErrors: 0, serverErrorRatePercent: 0, observedSpanMinutes: 1470
      }), { status: 200, headers: { "content-type": "application/json" } })
    });
    assert.equal(evidence.serverWindow?.expectedStart, "2026-07-17T00:00:00.000Z");
    assert.equal(evidence.serverWindow?.minimumObservedSpanMinutes, 1440);
    assert.deepEqual(evidence.rum, { minimumObservationSpanHours: 24, maximumLastObservationAgeHours: 24 });
  });
});

test("missing configuration remains fail-closed instead of inventing defaults", async () => {
  await withEnvironment({}, async () => {
    const evidence = await loadBetaAcceptanceEvidence();
    assert.equal(evidence.serverWindow, undefined);
    assert.equal(Number.isNaN(evidence.rum?.minimumObservationSpanHours), true);
  });
});

async function withEnvironment(values: Partial<Record<(typeof environmentNames)[number], string>>, action: () => Promise<void>) {
  const previous = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of environmentNames) {
      const value = values[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await action();
  } finally {
    for (const name of environmentNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
