/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import assert from "node:assert/strict";
import test from "node:test";

import { startWebSchedulersWhenActivated } from "./web-scheduler-activation";

function pendingChecks() {
  const callbacks: Array<() => void> = [];
  let unreferenced = 0;
  const timer = { unref: () => { unreferenced += 1; } } as unknown as ReturnType<typeof setTimeout>;
  return {
    callbacks,
    timer,
    schedule: (callback: () => void) => { callbacks.push(callback); return timer; },
    unreferenced: () => unreferenced
  };
}

test("candidate web defers its schedules until its exact commit is activated, then starts once", () => {
  const pending = pendingChecks();
  let activeCommit = "previous-release";
  let starts = 0;
  startWebSchedulersWhenActivated(async () => { starts += 1; }, {
    path: "/run/activation", commit: "candidate-release", read: () => activeCommit, schedule: pending.schedule
  });
  assert.equal(starts, 0);
  assert.equal(pending.unreferenced(), 1);
  activeCommit = "candidate-release\n";
  pending.callbacks[0]();
  pending.callbacks[0]();
  assert.equal(starts, 1);
  assert.equal(pending.callbacks.length, 1);
});

test("missing activation file keeps candidate schedules idle until the file appears", () => {
  const pending = pendingChecks();
  let fileExists = false;
  let starts = 0;
  startWebSchedulersWhenActivated(async () => { starts += 1; }, {
    path: "/run/activation", commit: "candidate-release", schedule: pending.schedule,
    read: () => { if (!fileExists) throw new Error("ENOENT"); return "candidate-release"; }
  });
  assert.equal(starts, 0);
  fileExists = true;
  pending.callbacks[0]();
  assert.equal(starts, 1);
});

test("cancelling an idle candidate clears its timer and prevents late activation", () => {
  const pending = pendingChecks();
  let activeCommit = "";
  let starts = 0;
  let cleared = false;
  const cancel = startWebSchedulersWhenActivated(async () => { starts += 1; }, {
    path: "/run/activation", commit: "candidate-release", read: () => activeCommit, schedule: pending.schedule,
    clear: (timer) => { assert.equal(timer, pending.timer); cleared = true; }
  });
  cancel();
  activeCommit = "candidate-release";
  pending.callbacks[0]();
  assert.equal(cleared, true);
  assert.equal(starts, 0);
});

test("web without a rollout activation file retains immediate schedule startup", () => {
  let starts = 0;
  startWebSchedulersWhenActivated(async () => { starts += 1; }, { path: "" });
  assert.equal(starts, 1);
});
