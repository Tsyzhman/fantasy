import test from "node:test";
import assert from "node:assert/strict";
import { evaluateXgGate } from "./gate";
test("XG-01 publication is insufficient; each independent coverage gate must pass", () => {
  const evidence = { provider: "synthetic", accessVerifiedAt: null, permissionReference: null, metricDefinition: null, stableIds: false, previousFullSeason: false, matches: 0, teamMatchCoverage: null, playerMatchCoverage: null, clubCoverage: {}, expectedClubs: ["a"], repeatedImport: false, correctionTest: false, freshnessWithin24h: null, observedDays: 0, modelVersion: null };
  assert.equal(evaluateXgGate(evidence).ready, false);
  const valid = { ...evidence, accessVerifiedAt: "2026-09-07T00:00:00Z", permissionReference: "synthetic-test-not-real-license", metricDefinition: "IXG per player match excludes shootouts", stableIds: true, previousFullSeason: true, matches: 100, teamMatchCoverage: .95, playerMatchCoverage: .95, clubCoverage: { a: .9 }, repeatedImport: true, correctionTest: true, freshnessWithin24h: .95, observedDays: 14 };
  assert.equal(evaluateXgGate(valid).ready, true);
  assert.equal(evaluateXgGate({ ...valid, clubCoverage: { a: .89 } }).ready, false);
});
