import assert from "node:assert/strict";
import test from "node:test";

import { fixtureOddsSyncIntervalMilliseconds } from "./fixture-odds-scheduler";

test("fixture odds polling defaults to 15 minutes and remains bounded", () => {
  assert.equal(fixtureOddsSyncIntervalMilliseconds(undefined), 15 * 60_000);
  assert.equal(fixtureOddsSyncIntervalMilliseconds("1"), 5 * 60_000);
  assert.equal(fixtureOddsSyncIntervalMilliseconds("30"), 30 * 60_000);
  assert.equal(fixtureOddsSyncIntervalMilliseconds("1000"), 6 * 60 * 60_000);
});
