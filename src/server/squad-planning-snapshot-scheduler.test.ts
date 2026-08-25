import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS } from "@/machete/squad_planning_snapshots";
import { nextSquadPlanningSnapshotDelayMs } from "./squad-planning-snapshot-scheduler";

const instrumentationSource = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");

test("Squad planning snapshot scheduler starts with the server", () => {
  assert.match(instrumentationSource, /startSquadPlanningSnapshotScheduler/);
});

test("Capture timer lands exactly on the pending snapshot due moment", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");
  const dueAt = new Date("2026-09-20T15:59:00.000Z");
  assert.equal(nextSquadPlanningSnapshotDelayMs(dueAt, 0, now), dueAt.getTime() - now.getTime());
  assert.equal(nextSquadPlanningSnapshotDelayMs(new Date(now.getTime() - 1_000), 0, now), 0);
});

test("Long idle periods are capped so newly synced tours get planned", () => {
  const sixHours = 6 * 60 * 60 * 1_000;
  assert.equal(nextSquadPlanningSnapshotDelayMs(null, 0, new Date()), sixHours);
  assert.equal(
    nextSquadPlanningSnapshotDelayMs(new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000), 0, new Date()),
    sixHours
  );
});

test("Failed captures retry quickly without waiting for the next tour", () => {
  const now = new Date();
  assert.equal(
    nextSquadPlanningSnapshotDelayMs(new Date(now.getTime() + 60 * 60 * 1_000), 2, now),
    SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS
  );
});
