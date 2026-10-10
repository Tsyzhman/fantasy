/** @spec spec://common/INFRA-006-continuous-deployment#observability */
import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticSqlWindow, recordSqlQuery } from "./runtime-diagnostics";
test("SQL diagnostics bound cardinality and retain no query text or parameters", () => {
  for (let index = 0; index < 5000; index++) recordSqlQuery(`SELECT ${index}, 'private-fixture-value'`, index % 100);
  const window = diagnosticSqlWindow();
  assert.ok(window.fingerprints <= 128); assert.equal(window.top.length, 20);
  assert.ok(window.top.some(row => row.fingerprint === "other"));
  assert.ok(!JSON.stringify(window).includes("private-fixture-value"));
});
