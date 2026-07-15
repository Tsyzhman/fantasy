import assert from "node:assert/strict";
import test from "node:test";

import { parseDataQualityAuditScopes, readDataQualityAuditScheduleConfig } from "./data_quality_schedule";

test("data-quality schedule parses multiple league seasons and removes duplicates", () => {
  assert.deepEqual(parseDataQualityAuditScopes("47:2025/2026, 17:2025 ;47:2025/2026"), [
    { leagueId: 47n, season: "2025/2026" },
    { leagueId: 17n, season: "2025" }
  ]);
});

test("data-quality schedule rejects malformed and non-positive league ids", () => {
  assert.throws(() => parseDataQualityAuditScopes("47"), /Expected <leagueId>:<season>/);
  assert.throws(() => parseDataQualityAuditScopes("zero:2025"), /Invalid league id/);
  assert.throws(() => parseDataQualityAuditScopes("0:2025"), /must be positive/);
});

test("data-quality schedule applies beta defaults", () => {
  assert.deepEqual(readDataQualityAuditScheduleConfig({ DATA_QUALITY_AUDIT_SCOPES: "47:2025/2026" }), {
    scopes: [{ leagueId: 47n, season: "2025/2026" }],
    coveragePercent: 98,
    maximumLatencyHours: 6,
    maximumRunAgeHours: 26
  });
});

test("data-quality schedule validates configured thresholds", () => {
  assert.throws(
    () => readDataQualityAuditScheduleConfig({ DATA_QUALITY_AUDIT_COVERAGE_PERCENT: "101" }),
    /between 0 and 100/
  );
  assert.throws(
    () => readDataQualityAuditScheduleConfig({ DATA_QUALITY_AUDIT_MAXIMUM_LATENCY_HOURS: "0" }),
    /positive number/
  );
  assert.throws(
    () => readDataQualityAuditScheduleConfig({ DATA_QUALITY_AUDIT_MAXIMUM_RUN_AGE_HOURS: "old" }),
    /positive number/
  );
});
