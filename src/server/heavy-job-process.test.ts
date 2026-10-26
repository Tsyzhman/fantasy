/** @spec spec://common/INFRA-006-continuous-deployment#heavy-jobs */
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnHeavyJob } from "./heavy-job-process";

const program = `process.send({ started: process.pid }); process.on('message', () => process.exit(0));`;

test("heavy jobs retain child IPC, wait for one another and release the lock after SIGKILL", { skip: process.platform !== "linux", timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "fantasy-heavy-job-"));
  const children: ChildProcess[] = [];
  const launch = () => {
    const child = spawnHeavyJob(["-e", program], {
      env: { ...process.env, FANTASY_HEAVY_JOB_LOCK_PATH: join(root, "job.lock") },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    children.push(child);
    return child;
  };
  try {
    const first = launch();
    const [firstMessage] = await once(first, "message");
    assert.equal(firstMessage.started, first.pid);
    const second = launch();
    let secondStarted = false;
    second.once("message", () => { secondStarted = true; });
    const secondReady = once(second, "message");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(secondStarted, false, "the second job must wait outside Node while the first owns the lock");
    const firstExit = once(first, "exit");
    first.kill("SIGKILL");
    assert.equal((await firstExit)[1], "SIGKILL");
    const [secondMessage] = await secondReady;
    assert.equal(secondMessage.started, second.pid);
    const secondExit = once(second, "exit");
    second.send("finish");
    assert.equal((await secondExit)[0], 0);
    const third = launch();
    await once(third, "message");
    const thirdExit = once(third, "exit");
    third.send("finish");
    assert.equal((await thirdExit)[0], 0);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
});
