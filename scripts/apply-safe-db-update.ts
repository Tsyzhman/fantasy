import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

console.log("[db:safe-update] Deprecated compatibility wrapper. Running Prisma migrations instead.");

const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit" });

if (result.error) {
  console.error("[db:safe-update] Failed to start Prisma migrate deploy.", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
