import assert from "node:assert/strict";
import test from "node:test";

import { nextFplPriceSyncAt } from "./fpl-price-sync-scheduler";
import { fplSnapshotKey } from "./fpl-price-sync";

test("FPL price scheduler uses 00:01 and 12:01 Europe/London wall-clock slots", () => {
  const beforeMidnight = nextFplPriceSyncAt(new Date("2026-08-12T23:59:00Z"));
  assert.equal(beforeMidnight.label, "2026-08-13 12:01 Europe/London");
  const beforeNoon = nextFplPriceSyncAt(new Date("2026-08-12T10:00:00Z"));
  assert.equal(beforeNoon.label, "2026-08-12 12:01 Europe/London");
});

test("FPL scheduler follows London DST without changing the local trigger time", () => {
  const summer = nextFplPriceSyncAt(new Date("2026-07-12T10:00:00Z"));
  const winter = nextFplPriceSyncAt(new Date("2026-12-12T10:00:00Z"));
  assert.equal(summer.runAt.toISOString(), "2026-07-12T11:01:00.000Z");
  assert.equal(winter.runAt.toISOString(), "2026-12-12T12:01:00.000Z");
});

test("FPL scheduler startup catch-up selects the next wall-clock slot", () => {
  const afterNoon = nextFplPriceSyncAt(new Date("2026-08-12T11:02:00Z"));
  assert.equal(afterNoon.slotKey, "2026-08-13-0001");
  assert.ok(afterNoon.delayMs > 0);
});

test("FPL snapshot keys are idempotent for a London wall-clock slot", () => {
  assert.equal(fplSnapshotKey(new Date("2026-08-12T10:30:00Z")), "2026-08-12-0001");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T11:00:00Z")), "2026-08-12-0001");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T11:01:00Z")), "2026-08-12-1201");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T22:59:00Z")), "2026-08-12-1201");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T22:00:00Z")), "2026-08-12-1201");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T23:00:00Z")), "2026-08-12-1201");
  assert.equal(fplSnapshotKey(new Date("2026-08-12T23:01:00Z")), "2026-08-13-0001");
});
