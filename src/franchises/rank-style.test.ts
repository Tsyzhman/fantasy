/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#style */
import test from "node:test";
import assert from "node:assert/strict";
import { rankStyle } from "./analytics";
import { rankFixture, referenceRankStyle } from "./rank-reference";
test("sorted ranks are exactly equal to the historical algorithm for ties, nulls, empty and singleton populations", () => {
  for (const size of [0, 1, 2, 75, 811, 3000]) {
    const rows = rankFixture(size);
    assert.deepEqual(rankStyle(structuredClone(rows)), referenceRankStyle(structuredClone(rows)));
  }
  const ties = rankFixture(20).map(row => ({ ...row, metrics: { own_cohort_gap: 0, cap_gap: 0, buy_delta_gap: 0 } }));
  assert.deepEqual(rankStyle(structuredClone(ties)), referenceRankStyle(structuredClone(ties)));
  assert.equal(rankStyle(ties)[0].rank, 1);
});
