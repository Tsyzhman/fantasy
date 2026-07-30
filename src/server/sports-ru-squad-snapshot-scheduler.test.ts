import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sportsRuSquadSnapshotIntervalMilliseconds } from "./sports-ru-squad-snapshot-scheduler";

const instrumentationSource = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");

test("Sports.ru squad scheduler checks frequently without accepting unsafe intervals", () => {
  assert.equal(sportsRuSquadSnapshotIntervalMilliseconds(undefined), 5 * 60 * 1_000);
  assert.equal(sportsRuSquadSnapshotIntervalMilliseconds("1"), 60 * 1_000);
  assert.equal(sportsRuSquadSnapshotIntervalMilliseconds("60"), 60 * 60 * 1_000);
  assert.equal(sportsRuSquadSnapshotIntervalMilliseconds("0"), 5 * 60 * 1_000);
  assert.equal(sportsRuSquadSnapshotIntervalMilliseconds("61"), 5 * 60 * 1_000);
});

test("Sports.ru squad snapshot scheduler starts with the server", () => {
  assert.match(instrumentationSource, /startSportsRuSquadSnapshotScheduler/);
});
