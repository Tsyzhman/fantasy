import assert from "node:assert/strict";
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
  assert.doesNotMatch(retentionScript, /docker builder prune/);
});

test("production forecast working sets run in a disposable child process", () => {
  const workerCreateIndex = deployScript.indexOf('docker create \\\n  --name "$worker"');
  assert.ok(workerCreateIndex >= 0, "worker container creation must remain explicit");
  const workerCreateBlock = deployScript.slice(workerCreateIndex, deployScript.indexOf("docker container start", workerCreateIndex));
  assert.doesNotMatch(workerCreateBlock, /--expose-gc/);
  assert.match(forecastScheduler, /spawn\(process\.execPath, \["--expose-gc", standaloneServerPath\]/);
  assert.match(instrumentation, /FANTASY_MODEL_FORECAST_CHILD === "true"/);
  assert.match(instrumentation, /process\.exit\(exitCode\)/);
});
