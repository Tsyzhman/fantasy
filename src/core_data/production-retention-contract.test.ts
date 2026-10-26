/**
 * @spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
 * @spec spec://common/INFRA-006-continuous-deployment#recovery
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const deployScript = readFileSync(join(repositoryRoot, "scripts", "deploy-production-docker.sh"), "utf8");
const retentionScript = readFileSync(join(repositoryRoot, "scripts", "prune-production-artifacts.sh"), "utf8");
const forecastScheduler = readFileSync(join(repositoryRoot, "src", "server", "fantasy-model-forecast-scheduler.ts"), "utf8");
const instrumentation = readFileSync(join(repositoryRoot, "src", "instrumentation.ts"), "utf8");

test("production deploy automatically applies bounded retention after promotion", () => {
  const promotionIndex = deployScript.indexOf('phase="deployed"');
  const retentionIndex = deployScript.indexOf('"$target/scripts/prune-production-artifacts.sh" --apply');

  assert.ok(promotionIndex >= 0, "deployment must record the successful promotion phase");
  assert.ok(retentionIndex > promotionIndex, "retention must run only after production has been promoted");
});

test("production retention keeps current plus one rollback release by default", () => {
  assert.match(retentionScript, /keep_recent="\$\{FANTASY_RELEASE_KEEP_RECENT:-2\}"/);
  assert.match(retentionScript, /KEEP_ROLLBACK=/);
  assert.match(retentionScript, /^prune_host_build_cache=0$/m);
  assert.match(retentionScript, /--prune-host-build-cache\) prune_host_build_cache=1/);
});

test("host build-cache deletion requires both explicit operator opt-in and apply mode", {
  skip: process.platform === "win32" ? "Bash behavior is verified on Linux CI" : false,
}, () => {
  const start = retentionScript.indexOf('if [[ "$prune_host_build_cache" == "1" ]]');
  const end = retentionScript.indexOf('echo "RELEASE_COUNT=', start);
  assert.ok(start >= 0 && end > start);
  const cacheOperation = retentionScript.slice(start, end);
  assert.equal(retentionScript.match(/docker builder prune/g)?.length, 1, "no unguarded cache prune exists");

  for (const [mode, enabled, shouldPrune] of [
    ["dry-run", "0", false], ["apply", "0", false],
    ["dry-run", "1", false], ["apply", "1", true],
  ] as const) {
    const result = spawnSync("bash", ["-c", `
      set -eu
      mode="$1"; prune_host_build_cache="$2"
      docker() { printf 'DOCKER_CALL:%s\\n' "$*"; }
      ${cacheOperation}
    `, "cache-contract", mode, enabled], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("DOCKER_CALL:builder prune --all --force"), shouldPrune, `${mode}, opt-in=${enabled}`);
  }
});

test("production forecast working sets run in a disposable child process", () => {
  const workerCreateIndex = deployScript.indexOf('docker create \\\n  --name "$worker"');
  assert.ok(workerCreateIndex >= 0, "worker container creation must remain explicit");
  const workerCreateBlock = deployScript.slice(workerCreateIndex, deployScript.indexOf("docker container start", workerCreateIndex));
  assert.doesNotMatch(workerCreateBlock, /--expose-gc/);
  assert.match(forecastScheduler, /spawnHeavyJob\(\["--expose-gc", standaloneServerPath\]/);
  assert.match(instrumentation, /FANTASY_MODEL_FORECAST_CHILD === "true"/);
  assert.match(instrumentation, /process\.exit\(exitCode\)/);
});
