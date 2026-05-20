import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv();

const { prisma } = await import("../src/lib/db");
const {
  getIngestionAdminStatus,
  run_incremental_update,
  run_next_ingestion_job,
  start_initial_backfill
} = await import("../src/core_data/ingestion-jobs");

const command = process.argv[2] ?? "status";

try {
  if (command === "initial-backfill") {
    const started = await start_initial_backfill(prisma, { startedByUserId: null });
    console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} initial backfill job ${started.job.id}.`);
    const result = await run_next_ingestion_job(prisma);
    console.info(`[ingestion:cli] Finished runner for job ${result.job?.id ?? "none"} with status ${result.job?.status ?? "none"}.`);
  } else if (command === "incremental-update") {
    const started = await run_incremental_update(prisma, { startedByUserId: null });
    console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} incremental update job ${started.job.id}.`);
    const result = await run_next_ingestion_job(prisma);
    console.info(`[ingestion:cli] Finished runner for job ${result.job?.id ?? "none"} with status ${result.job?.status ?? "none"}.`);
  } else if (command === "run-next") {
    const result = await run_next_ingestion_job(prisma);
    console.info(`[ingestion:cli] ${result.ran ? "Ran" : "No active"} ingestion job ${result.job?.id ?? ""}.`);
  } else if (command === "worker") {
    await runWorker();
  } else if (command === "status") {
    const status = await getIngestionAdminStatus(prisma);
    console.dir(status, { depth: null });
  } else {
    throw new Error(`Unknown ingestion command "${command}". Use status, initial-backfill, incremental-update, run-next, or worker.`);
  }
} catch (error) {
  console.error("[ingestion:cli] Failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function runWorker() {
  console.info("[ingestion:worker] Started. Waiting for pending/running ingestion jobs.");
  while (true) {
    const result = await run_next_ingestion_job(prisma);
    if (result.ran) {
      console.info(`[ingestion:worker] Job ${result.job?.id ?? "unknown"} ended with status ${result.job?.status ?? "unknown"}.`);
    }
    await sleep(5_000);
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
