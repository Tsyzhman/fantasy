/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { aggregate, METRICS, type Fact, type Filters, type Snapshot } from "@/franchises/analytics";
import { franchiseReportMetadata, renderFranchiseReport, franchiseWorkerMetrics } from "@/server/franchises/report-worker";
import { FranchiseReportCache } from "@/server/franchises/report-cache";
import { validateSnapshot } from "@/server/franchises/snapshot";

async function main() {
  const path = resolve(".tmp/franchise-worker-fixture"); await mkdir(path, { recursive: true });
  const rows: Fact[] = Array.from({ length: 30000 }, (_, index) => {
    const manager = Math.floor(index / 10);
    return { franchise: manager % 8 + 1, slug: "a", round: index % 10 + 1, manager: "manager" + manager, team: "team" + manager,
      finished: true, n_buy: 1, ...Object.fromEntries(METRICS.map((key, metric) => [key, (manager * (metric + 1)) % 97])) };
  });
  const snapshot: Snapshot = { version: 1, season: "2026/2027", generated: "2026-10-10T10:00:00Z",
    acquisition: { from: "2026-08-01", to: "2026-09-10" }, leagues: { a: "A" },
    franchises: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: "Franchise" + index })),
    rounds: Array.from({ length: 10 }, (_, index) => ({ slug: "a", round: index + 1, finished: true, cutoff: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z` })),
    squads: rows, purchases: rows, xfoExamples: [], freeze: { events: [], basis: [] }, checks: {} };
  const filters: Filters = { from: "2026-07-01", to: "2027-06-30", leagues: [], completed: false };
  const raw = JSON.stringify(snapshot), compressed = gzipSync(raw);
  await writeFile(resolve(path, "snapshot.json.gz"), compressed); process.env.FRANCHISE_DATA_DIR = path;
  const expected = JSON.stringify(aggregate(snapshot, filters));
  const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
  // The interval keeps this CLI alive while the production worker is unreferenced.
  const keepAlive = setInterval(() => {}, 1000);
  const cache = new FranchiseReportCache<string>(undefined, renderFranchiseReport);
  try {
    await delay(20); lag.reset();
    const directTimerStart = performance.now();
    const directTimer = new Promise<number>(done => setTimeout(() => done(performance.now() - directTimerStart - 10), 10));
    const directStart = performance.now();
    assert.equal(JSON.stringify(aggregate(validateSnapshot(JSON.parse(gunzipSync(compressed).toString("utf8"))), filters)), expected);
    const directMs = performance.now() - directStart; await delay(20);
    const directMainEventLoopMaxMs = await directTimer;
    await delay(20); lag.reset();
    const started = performance.now(), metadata = await franchiseReportMetadata();
    const results = await Promise.all(Array.from({ length: 20 }, () => cache.get(metadata.revision, filters)));
    const coldMs = performance.now() - started; await delay(20);
    const coldLoopMaxMs = lag.max / 1e6;
    assert.ok(results.every(result => result === expected), "worker output must exactly equal the direct report");
    const warmStart = performance.now(); assert.equal(await cache.get(metadata.revision, filters), expected);
    const warmMs = performance.now() - warmStart;
    console.log(JSON.stringify({ synthetic: true, node: process.version, squads: rows.length, managers: 3000,
      rawBytes: Buffer.byteLength(raw), compressedBytes: compressed.length, reportBytes: Buffer.byteLength(expected),
      simultaneousRequests: 20, exactEquality: true, directMs, directMainEventLoopMaxMs, coldMs, warmMs, coldMainEventLoopMaxMs: coldLoopMaxMs,
      cache: cache.metrics(), worker: franchiseWorkerMetrics(), memory: process.memoryUsage() }, null, 2));
  } finally { clearInterval(keepAlive); lag.disable(); cache.clear(); await rm(path, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
