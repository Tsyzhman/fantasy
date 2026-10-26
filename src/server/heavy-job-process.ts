/** @spec spec://common/INFRA-006-continuous-deployment#heavy-jobs */
import { spawn, type SpawnOptions } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Linux flock owns the exclusion until the actual job exits, including SIGKILL. */
export function spawnHeavyJob(nodeArguments: string[], options: SpawnOptions) {
  if (process.platform !== "linux") return spawn(process.execPath, nodeArguments, options);
  const environment = options.env ?? process.env;
  const lock = resolve(environment.FANTASY_HEAVY_JOB_LOCK_PATH ?? "storage/franchises/.heavy-job.lock");
  mkdirSync(dirname(lock), { recursive: true });
  // No intermediate parent: retain the job PID, signals and inherited Node IPC descriptor.
  return spawn("flock", ["--exclusive", "--no-fork", lock, process.execPath, ...nodeArguments], options);
}
