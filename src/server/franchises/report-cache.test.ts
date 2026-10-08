/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { aggregate, type Snapshot, type Filters } from "@/franchises/analytics";
import { FranchiseReportCache } from "./report-cache";

const snapshot = (): Snapshot => ({
  version: 2, personalHistory: true, season: "2026/2027", generated: "2026-10-04T10:00:00Z",
  acquisition: { from: "2026-10-04", to: "2026-10-04" }, leagues: {}, franchises: [],
  rounds: [], squads: [], purchases: [], xfoExamples: [], freeze: { events: [], basis: [] }, checks: {},
});
const filters: Filters = { from: "2026-07-01", to: "2027-06-30", leagues: [], completed: false };

test("report cache preserves the complete JSON and invalidates immediately on snapshot replacement", () => {
  let builds = 0;
  const cache = new FranchiseReportCache(undefined, (s, f) => { builds++; return JSON.stringify(aggregate(s, f)); });
  const first = snapshot();
  try {
    assert.equal(cache.get(first, filters), JSON.stringify(aggregate(first, filters)));
    for (let i = 0; i < 10; i++) cache.get(first, filters);
    assert.equal(builds, 1);
    const next = { ...first, generated: "2026-10-04T11:00:00Z" };
    assert.equal(JSON.parse(cache.get(next, filters)).generated, next.generated);
    assert.equal(builds, 2);
    cache.get(next, { ...filters, completed: true });
    assert.equal(builds, 3);
  } finally { cache.clear(); }
});

test("report cache bounds retained strings and expires them while idle", async () => {
  const cache = new FranchiseReportCache({ maxBytes: 16, maxEntries: 2, ttlMs: 15 }, (_s, f) => f.from);
  const s = snapshot();
  cache.get(s, { ...filters, from: "1234" });
  cache.get(s, { ...filters, from: "5678" });
  cache.get(s, { ...filters, from: "abcd" });
  assert.deepEqual(cache.metrics(), { entries: 2, bytes: 16 });
  cache.get(s, filters); // Oversized entries are served without being retained.
  assert.deepEqual(cache.metrics(), { entries: 2, bytes: 16 });
  await delay(40);
  assert.deepEqual(cache.metrics(), { entries: 0, bytes: 0 });
});

test("failed renders are retryable and never poison other filters", () => {
  let builds = 0;
  const cache = new FranchiseReportCache(undefined, () => {
    if (++builds === 1) throw new Error("render failed");
    return "{}";
  });
  const s = snapshot();
  try {
    assert.throws(() => cache.get(s, filters), /render failed/);
    assert.equal(cache.get(s, filters), "{}");
    assert.equal(builds, 2);
  } finally { cache.clear(); }
});

test("cached calendar and league selections keep separate populations and empty ranges", () => {
  const s = snapshot();
  s.leagues = { a: "Англия", b: "Италия" };
  s.franchises = [{ id: 1, name: "Франшиза" }];
  s.rounds = [
    { slug: "a", round: 1, date: "2026-09-01", cutoff: null, finished: true },
    { slug: "a", round: 2, date: "2026-10-01", cutoff: null, finished: false },
    { slug: "b", round: 1, date: "2026-09-01", cutoff: null, finished: true },
  ];
  s.squads = s.rounds.map((r, index) => ({
    franchise: 1, manager: "Менеджер", team: String(index), slug: r.slug, round: r.round,
    finished: r.finished, own: [10, 30, 90][index],
  }));
  const cache = new FranchiseReportCache();
  const september = { ...filters, from: "2026-09-01", to: "2026-09-30" };
  const england = { ...september, leagues: ["a"] };
  const empty = { ...september, from: "2027-01-01", to: "2027-01-01" };
  try {
    for (const f of [filters, september, england, empty, england, september, filters]) {
      const report = JSON.parse(cache.get(s, f));
      const expected = aggregate(s, f);
      assert.deepEqual(report, expected);
    }
    assert.equal(JSON.parse(cache.get(s, england)).squads, 1);
    assert.equal(JSON.parse(cache.get(s, england)).franchises[0].metrics.own, 10);
    assert.equal(JSON.parse(cache.get(s, empty)).squads, 0);
    assert.equal(cache.metrics().entries, 4);
    assert.ok(cache.metrics().bytes <= 24 * 1024 * 1024);
  } finally { cache.clear(); }
});
