import assert from "node:assert/strict";
import test from "node:test";
import { ExpiringPromiseCache } from "./expiring-promise-cache";

test("expiring promise cache coalesces concurrent loaders", async () => {
  const cache = new ExpiringPromiseCache<string, number>();
  let calls = 0;
  let resolveLoader: ((value: number) => void) | undefined;
  const loader = () => {
    calls += 1;
    return new Promise<number>((resolve) => {
      resolveLoader = resolve;
    });
  };

  const first = cache.getOrCreate("league", 1_000, loader, 10);
  const second = cache.getOrCreate("league", 1_000, loader, 10);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveLoader?.(47);
  assert.deepEqual(await Promise.all([first, second]), [47, 47]);
});

test("expiring promise cache reloads expired values and removes rejections", async () => {
  const cache = new ExpiringPromiseCache<string, number>();
  let calls = 0;
  const value = async () => ++calls;

  assert.equal(await cache.getOrCreate("league", 100, value, 0), 1);
  assert.equal(await cache.getOrCreate("league", 100, value, 99), 1);
  assert.equal(await cache.getOrCreate("league", 100, value, 100), 2);

  await assert.rejects(cache.getOrCreate("broken", 100, async () => Promise.reject(new Error("failed")), 100));
  assert.equal(cache.size, 1);
  assert.equal(await cache.getOrCreate("broken", 100, async () => 3, 101), 3);
});

test("expiring promise cache enforces a bounded entry count", async () => {
  const cache = new ExpiringPromiseCache<string, number>(2);
  await cache.getOrCreate("one", 1_000, async () => 1, 0);
  await cache.getOrCreate("two", 1_000, async () => 2, 0);
  await cache.getOrCreate("three", 1_000, async () => 3, 0);
  assert.equal(cache.size, 2);

  let reloaded = false;
  await cache.getOrCreate("one", 1_000, async () => {
    reloaded = true;
    return 1;
  }, 1);
  assert.equal(reloaded, true);
});

test("expiring promise cache evicts the least recently used value by byte budget", async () => {
  const cache = new ExpiringPromiseCache<string, string>({
    maxEntries: 10,
    maxBytes: 6,
    estimateBytes: (value) => value.length
  });
  await cache.getOrCreate("one", 1_000, async () => "111", 0);
  await cache.getOrCreate("two", 1_000, async () => "22", 0);
  await cache.getOrCreate("one", 1_000, async () => "unused", 1);
  await cache.getOrCreate("three", 1_000, async () => "33", 1);

  let twoReloaded = false;
  await cache.getOrCreate("two", 1_000, async () => {
    twoReloaded = true;
    return "2";
  }, 2);

  assert.equal(twoReloaded, true);
  assert.ok(cache.bytes <= 6);
  assert.equal(cache.getMetrics(2).evictions, 1);
});

test("expiring promise cache reports hit, miss, build, byte and entry metrics", async () => {
  const cache = new ExpiringPromiseCache<string, string>({
    maxBytes: 100,
    estimateBytes: (value) => value.length
  });
  await cache.getOrCreate("league", 1_000, async () => "value", 0);
  await cache.getOrCreate("league", 1_000, async () => "unused", 1);

  const metrics = cache.getMetrics(1);
  assert.equal(metrics.hits, 1);
  assert.equal(metrics.misses, 1);
  assert.equal(metrics.builds, 1);
  assert.equal(metrics.bytes, 5);
  assert.equal(metrics.entries, 1);
  assert.ok(metrics.buildMs >= 0);
});
