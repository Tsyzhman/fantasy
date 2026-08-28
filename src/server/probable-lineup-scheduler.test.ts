import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  nextProbableLineupSyncAt,
  PROBABLE_LINEUP_SYNC_HOUR_UTC,
  PROBABLE_LINEUP_SYNC_MINUTE_UTC,
  selectProbableLineupSourceDefinitions
} from "./probable-lineup-scheduler";

const instrumentationSource = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");
const deploymentSource = readFileSync(new URL("../../scripts/deploy-production-docker.sh", import.meta.url), "utf8");
const schedulerSource = readFileSync(new URL("./probable-lineup-scheduler.ts", import.meta.url), "utf8");

test("probable lineups are scheduled every day at 14:30 UTC", () => {
  assert.equal(PROBABLE_LINEUP_SYNC_HOUR_UTC, 14);
  assert.equal(PROBABLE_LINEUP_SYNC_MINUTE_UTC, 30);

  const before = nextProbableLineupSyncAt(new Date("2026-08-27T14:29:59.000Z"));
  assert.equal(before.runAt.toISOString(), "2026-08-27T14:30:00.000Z");
  assert.equal(before.delayMs, 1_000);
  assert.equal(before.label, "2026-08-27 14:30 UTC");

  const after = nextProbableLineupSyncAt(new Date("2026-08-27T14:30:00.000Z"));
  assert.equal(after.runAt.toISOString(), "2026-08-28T14:30:00.000Z");
});

test("production starts one probable-lineup scheduler and canaries cannot run it", () => {
  assert.match(instrumentationSource, /startProbableLineupScheduler/);
  assert.match(deploymentSource, /-e PROBABLE_LINEUP_SYNC_ENABLED=false/);
});

test("manual probable-lineup runs can select one allowlisted source", () => {
  assert.deepEqual(selectProbableLineupSourceDefinitions(["epl"]).map((source) => source.key), ["epl"]);
  assert.deepEqual(selectProbableLineupSourceDefinitions(["serie-a"]).map((source) => source.key), ["serie-a"]);
  assert.deepEqual(selectProbableLineupSourceDefinitions(["bundesliga"]).map((source) => source.key), ["bundesliga"]);
  assert.deepEqual(selectProbableLineupSourceDefinitions(["ligue-1"]).map((source) => source.key), ["ligue-1"]);
  assert.deepEqual(selectProbableLineupSourceDefinitions().map((source) => source.key), ["epl", "serie-a", "bundesliga", "ligue-1"]);
  assert.throws(() => selectProbableLineupSourceDefinitions([]), /At least one/);
  assert.throws(() => selectProbableLineupSourceDefinitions(["epl", "epl"]), /unique/);
});

test("production logs identify skipped teams and unresolved source players", () => {
  assert.match(schedulerSource, /Probable lineup skipped for one team/);
  assert.match(schedulerSource, /sourceName: player\.sourcePlayer\.fullName \?\? player\.sourcePlayer\.name/);
  assert.match(schedulerSource, /alternatives: player\.alternatives\.map/);
});
