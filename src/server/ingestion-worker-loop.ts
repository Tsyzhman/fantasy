import { runIngestionWorkerTick } from "@/core_data/worker";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const DEFAULT_INTERVAL_MS = 10_000;
const logger = createLogger("ingestion:worker");

type WorkerLoopState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
};

const globalForWorker = globalThis as unknown as {
  ingestionWorkerLoop?: WorkerLoopState;
};

export function startIngestionWorkerLoop() {
  if (process.env.INGESTION_WORKER_IN_PROCESS === "false") return;

  const state =
    globalForWorker.ingestionWorkerLoop ??
    ({
      running: false,
      started: false
    } satisfies WorkerLoopState);

  if (state.started) return;

  state.started = true;
  globalForWorker.ingestionWorkerLoop = state;

  const intervalMs = configuredIntervalMs();
  state.timer = setInterval(() => {
    void runWorkerTick(state);
  }, intervalMs);
  state.timer.unref?.();

  void runWorkerTick(state);
  logger.info("In-process worker loop started.", { intervalMs });
}

async function runWorkerTick(state: WorkerLoopState) {
  if (state.running) return;

  state.running = true;
  try {
    await runIngestionWorkerTick(prisma);
  } catch (error) {
    logger.error("In-process run failed.", { error });
  } finally {
    state.running = false;
  }
}

function configuredIntervalMs() {
  const value = Number(process.env.INGESTION_WORKER_INTERVAL_MS);
  return Number.isFinite(value) && value >= 1_000 ? value : DEFAULT_INTERVAL_MS;
}
