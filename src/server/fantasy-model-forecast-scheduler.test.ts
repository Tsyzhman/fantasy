import assert from "node:assert/strict";
import test from "node:test";

import { activeScopesFromRows, forecastSyncIntervalMs } from "@/server/fantasy-model-forecast-scheduler";

test("recalculation interval honors the configured hours and clamps below the minimum", () => {
  assert.equal(forecastSyncIntervalMs(undefined), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("1"), 3_600_000);
  assert.equal(forecastSyncIntervalMs("0.5"), Math.round(0.5 * 3_600_000));
  assert.equal(forecastSyncIntervalMs("0.01"), 6 * 3_600_000);
  assert.equal(forecastSyncIntervalMs("not-a-number"), 6 * 3_600_000);
});

test("active scopes are deduplicated per league and season and sorted deterministically", () => {
  const scopes = activeScopesFromRows([
    { leagueId: 47n, season: "2026/2027" },
    { leagueId: 47n, season: "2026/2027" },
    { leagueId: null, season: "2026/2027" },
    { leagueId: 63n, season: null },
    { leagueId: 63n, season: "  " },
    { leagueId: 2n, season: "2025/2026" }
  ]);
  assert.deepEqual(scopes.map((scope) => `${scope.leagueId}:${scope.season}`), ["2:2025/2026", "47:2026/2027"]);
});
