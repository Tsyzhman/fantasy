/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#style */
import { rankStyle } from "@/franchises/analytics";
import { rankFixture, referenceRankStyle } from "@/franchises/rank-reference";
import assert from "node:assert/strict";
const results = [250, 500, 1000, 2000, 3000].map(size => {
  const rows = rankFixture(size);
  assert.deepEqual(rankStyle(structuredClone(rows)), referenceRankStyle(structuredClone(rows)));
  const measure = (fn: typeof rankStyle) => Array.from({ length: 3 }, () => {
    const input = structuredClone(rows), start = performance.now(); fn(input); return performance.now() - start;
  }).sort((a,b) => a-b)[1];
  const beforeMs = measure(referenceRankStyle), afterMs = measure(rankStyle);
  return { size, beforeMs, afterMs, speedup: beforeMs / afterMs, exactEquality: true };
});
console.log(JSON.stringify({ node: process.version, synthetic: true, results }, null, 2));
