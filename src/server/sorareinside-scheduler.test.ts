/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime */
import test from "node:test";
import assert from "node:assert/strict";
import {nextSorareInsideSyncAt, createSorareInsideRefreshRunner, type SorareInsideRefreshResult} from "./sorareinside-scheduler";
test("schedule runs at :05 every hour, including midnight rollover",()=> {
  for(const [now,next] of [["2026-09-11T12:04:59Z","2026-09-11T12:05:00.000Z"],["2026-09-11T12:05:00Z","2026-09-11T13:05:00.000Z"],["2026-09-11T23:59:59Z","2026-09-12T00:05:00.000Z"]]) assert.equal(nextSorareInsideSyncAt(new Date(now)).toISOString(),next);
});

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
function result(startedAt = "2026-10-09T05:10:00Z", status = "PARTIAL"): SorareInsideRefreshResult {
  return { status, startedAt, totals: { UNCHANGED: 10 }, byScope: { "63:2026/2027": { UNCHANGED: 10 } } };
}

test("five campaigns join one refresh and reuse its completed morning summary", async () => {
  let calls = 0;
  let release!: (value: SorareInsideRefreshResult) => void;
  const run = createSorareInsideRefreshRunner(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const threshold = new Date("2026-10-09T05:10:00Z");
  const campaigns = Array.from({ length: 5 }, () => run(threshold));
  assert.equal(calls, 1);
  const summary = result();
  release(summary);
  assert.ok((await Promise.all(campaigns)).every((value) => value === summary));
  assert.equal(await run(threshold), summary);
  assert.equal(calls, 1);
});

test("campaigns waiting for an older hourly run start only one refresh after 08:10", async () => {
  const releases: Array<(value: SorareInsideRefreshResult) => void> = [];
  let calls = 0;
  const run = createSorareInsideRefreshRunner(() => { calls++; return new Promise((resolve) => { releases.push(resolve); }); });
  const hourly = run();
  const threshold = new Date("2026-10-09T05:10:00Z");
  const campaigns = [run(threshold), run(threshold), run(threshold)];
  releases[0]!(result("2026-10-09T05:05:00Z"));
  await hourly;
  assert.equal(calls, 2);
  releases[1]!(result());
  await Promise.all(campaigns);
  assert.equal(calls, 2);
});

test("failed and already-running refreshes are not reused as successful freshness", async () => {
  let calls = 0;
  const run = createSorareInsideRefreshRunner(async () => {
    calls++;
    if (calls === 1) throw new Error("source unavailable");
    return result("2026-10-09T05:10:00Z", calls === 2 ? "ALREADY_RUNNING" : "SUCCEEDED");
  });
  const threshold = new Date("2026-10-09T05:10:00Z");
  await assert.rejects(run(threshold), /source unavailable/);
  assert.equal((await run(threshold)).status, "ALREADY_RUNNING");
  assert.equal((await run(threshold)).status, "SUCCEEDED");
  assert.equal(calls, 3);
  await run(threshold);
  assert.equal(calls, 3);
});
