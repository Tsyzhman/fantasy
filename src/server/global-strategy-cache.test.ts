/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { GlobalStrategyCache } from "./global-strategy-cache";
test("bounded caches stabilize under eviction, expire and deduplicate repeated keys", async () => {
  const cache = new GlobalStrategyCache();
  let builds = 0;
  const loader = async () => { builds++; return "x".repeat(16000); };
  await Promise.all(Array.from({ length: 10 }, () => cache.personal.getOrCreate("one", 100, loader, 0)));
  assert.equal(builds, 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let key = 0; key < 600; key++) await cache.personal.getOrCreate(`${pass}:${key}`, 100, loader, 0);
    assert.ok(cache.metrics(0).personal.entries <= 256);
    assert.ok(cache.metrics(0).personal.bytes <= 2 * 1024 * 1024);
  }
  assert.equal(cache.metrics(101).personal.bytes, 0);
  assert.equal(cache.metrics(101).personal.entries, 0);
});
test("at most two source loaders run per provider and failures release permits", async () => {
  const cache = new GlobalStrategyCache();
  let active = 0, max = 0;
  await Promise.allSettled(Array.from({ length: 15 }, (_, i) => cache.limit("FPL", async () => {
    active++; max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (i % 2) throw new Error("test failure");
  })));
  assert.equal(max, 2);
  assert.equal(cache.metrics().active.FPL, 0);
  assert.equal(cache.metrics().queued, 0);
});
