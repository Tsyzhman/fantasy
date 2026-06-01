import type { PrismaClient } from "@prisma/client";

import { run_next_ingestion_job } from "./ingestion-jobs";

type WorkerLogger = Pick<Console, "error" | "info">;

export async function runIngestionWorkerTick(prisma: PrismaClient, logger: WorkerLogger = console) {
  const result = await run_next_ingestion_job(prisma);
  if (result.ran) {
    logger.info(`[ingestion:worker] Job ${result.job?.id ?? "unknown"} ended with status ${result.job?.status ?? "unknown"}.`);
  }
  return result;
}

export async function runIngestionWorkerLoop(
  prisma: PrismaClient,
  options: {
    intervalMs?: number;
    logger?: WorkerLogger;
    shouldStop?: () => boolean;
  } = {}
) {
  const intervalMs = options.intervalMs ?? 5_000;
  const logger = options.logger ?? console;

  logger.info("[ingestion:worker] Started. Waiting for pending/running ingestion jobs.");
  while (!options.shouldStop?.()) {
    try {
      await runIngestionWorkerTick(prisma, logger);
    } catch (error) {
      logger.error("[ingestion:worker] Run failed.", error);
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
