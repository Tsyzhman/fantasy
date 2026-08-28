import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { schedulerRuntimePlan } from "./scheduler-runtime-role";

const instrumentationSource = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");
const deploymentSource = readFileSync(new URL("../../scripts/deploy-production-docker.sh", import.meta.url), "utf8");

test("production web loads only request-coordinated schedulers", () => {
  assert.deepEqual(schedulerRuntimePlan({ INGESTION_WORKER_IN_PROCESS: "false" }), {
    worker: false,
    fpl: true,
    probableLineups: true
  });
});

test("production worker loads background schedulers without duplicating web schedules", () => {
  assert.deepEqual(schedulerRuntimePlan({
    INGESTION_WORKER_IN_PROCESS: "true",
    FPL_PRICE_SYNC_ENABLED: "false",
    PROBABLE_LINEUP_SYNC_ENABLED: "false"
  }), {
    worker: true,
    fpl: false,
    probableLineups: false
  });
});

test("canary role loads no scheduler modules", () => {
  assert.deepEqual(schedulerRuntimePlan({
    INGESTION_WORKER_IN_PROCESS: "false",
    FPL_PRICE_SYNC_ENABLED: "false",
    PROBABLE_LINEUP_SYNC_ENABLED: "false"
  }), {
    worker: false,
    fpl: false,
    probableLineups: false
  });
});

test("instrumentation and production promotion enforce one owner per scheduler", () => {
  assert.match(instrumentationSource, /if \(plan\.worker\)/);
  assert.match(instrumentationSource, /if \(plan\.fpl\)/);
  assert.match(instrumentationSource, /if \(plan\.probableLineups\)/);

  const productionStart = deploymentSource.indexOf('phase="swap"');
  const webStart = deploymentSource.indexOf('--name "$web"', productionStart);
  const workerStart = deploymentSource.indexOf('--name "$worker"', webStart);
  const productionEnd = deploymentSource.indexOf('docker container start "$web" "$worker"', workerStart);
  assert.ok(productionStart >= 0 && webStart > productionStart && workerStart > webStart && productionEnd > workerStart);

  const webCreate = deploymentSource.slice(webStart, workerStart);
  const workerCreate = deploymentSource.slice(workerStart, productionEnd);
  assert.match(webCreate, /-e INGESTION_WORKER_IN_PROCESS=false/);
  assert.match(workerCreate, /-e INGESTION_WORKER_IN_PROCESS=true/);
  assert.match(workerCreate, /-e FPL_PRICE_SYNC_ENABLED=false/);
  assert.match(workerCreate, /-e PROBABLE_LINEUP_SYNC_ENABLED=false/);
});
