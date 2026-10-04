/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runPlayerPoolRefreshProcess } from "./fantasy-player-pool-snapshot-scheduler";

async function withChild(source: string, check: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-pool-test-"));
  const path = join(dir, "child.cjs");
  try { await writeFile(path, source); await check(path); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("isolated refresh passes bootstrap mode and waits for exit, not just a result message", async () => {
  await withChild(`
    const result = {scopes: 1, snapshots: process.argv.includes('--only-missing') ? 0 : 1, players: 642, failed: []};
    process.send({type: 'player-pool-result', result});
    setTimeout(() => process.exit(0), 100);
  `, async (path) => {
    const start = performance.now();
    assert.deepEqual(await runPlayerPoolRefreshProcess(path, true), { scopes: 1, snapshots: 0, players: 642, failed: [] });
    assert.ok(performance.now() - start >= 100);
    assert.equal((await runPlayerPoolRefreshProcess(path, false)).snapshots, 1);
  });
});

test("isolated refresh refuses missing results and nonzero exits even after a message", async () => {
  await withChild("process.exit(0)", async (path) => {
    await assert.rejects(runPlayerPoolRefreshProcess(path, false), /result=false/);
  });
  await withChild(`
    process.send({type:'player-pool-result', result:{scopes:1,snapshots:1,players:1,failed:[]}}, () => process.exit(2));
  `, async (path) => {
    await assert.rejects(runPlayerPoolRefreshProcess(path, false), /code=2/);
  });
});
