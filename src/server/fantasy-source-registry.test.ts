/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import test from "node:test";
import assert from "node:assert/strict";
import { activeFantasyScope } from "./fantasy-source-registry";
import { sourceAgeStatus } from "./home-freshness";
test("season metadata cannot make an ended tournament or an absent source fresh", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  assert.equal(activeFantasyScope(77n, "2026", now), false);
  assert.equal(activeFantasyScope(47n, "2026/2027", now), true);
  assert.equal(activeFantasyScope(47n, "2025/2026", now), false);
  assert.equal(sourceAgeStatus(null, 7, now), "MISSING");
  assert.equal(sourceAgeStatus(new Date(now.getTime() - 8 * 3_600_000), 7, now), "STALE");
  assert.equal(sourceAgeStatus(new Date(now.getTime() - 6 * 3_600_000), 7, now), "FRESH");
});
