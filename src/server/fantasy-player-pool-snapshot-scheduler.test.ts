import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FANTASY_PLAYER_POOL_SNAPSHOT_HOURS,
  nextFantasyPlayerPoolSnapshotRun
} from "./fantasy-player-pool-snapshot-scheduler";

test("player-pool snapshots run at every exact Moscow hour from 10 through 23", () => {
  assert.deepEqual(FANTASY_PLAYER_POOL_SNAPSHOT_HOURS, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  const beforeWindow = nextFantasyPlayerPoolSnapshotRun(new Date("2026-08-29T06:59:59.000Z"));
  assert.equal(beforeWindow.runAt.toISOString(), "2026-08-29T07:00:00.000Z");
  assert.equal(beforeWindow.label, "2026-08-29 10:00 Europe/Moscow");

  const duringWindow = nextFantasyPlayerPoolSnapshotRun(new Date("2026-08-29T12:12:00.000Z"));
  assert.equal(duringWindow.runAt.toISOString(), "2026-08-29T13:00:00.000Z");
  assert.equal(duringWindow.label, "2026-08-29 16:00 Europe/Moscow");

  const afterWindow = nextFantasyPlayerPoolSnapshotRun(new Date("2026-08-29T20:00:01.000Z"));
  assert.equal(afterWindow.runAt.toISOString(), "2026-08-30T07:00:00.000Z");
  assert.equal(afterWindow.label, "2026-08-30 10:00 Europe/Moscow");
});

test("a due hourly refresh is queued behind incremental work instead of skipped", () => {
  const source = readFileSync(new URL("./fantasy-player-pool-snapshot-scheduler.ts", import.meta.url), "utf8");
  assert.match(source, /if \(state\.running\) \{\s+state\.pendingFullRefresh = trigger/);
  assert.match(source, /state\.running = false;\s+runPendingFullRefresh\(state\)/);
  assert.match(source, /FANTASY_PLAYER_POOL_REFRESH_QUEUE_POLL_MS = 2_000/);
  assert.doesNotMatch(source, /runFantasyPlayerPoolSnapshotRefreshNow\("STARTUP"\)/);
  assert.match(source, /runFantasyPlayerPoolSnapshotRefreshNow\("BOOTSTRAP"\)/);
  assert.match(source, /onlyMissing: trigger === "BOOTSTRAP"/);
  const instrumentation = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");
  const worker = instrumentation.slice(instrumentation.indexOf("if (plan.worker)"), instrumentation.indexOf("if (plan.fpl)"));
  assert.match(worker, /startFantasyPlayerPoolSnapshotScheduler\(\)/);
});
