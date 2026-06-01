import { runIngestionWorkerTick } from "@/core_data/worker";
import { prisma } from "@/lib/db";

const DEFAULT_INTERVAL_MS = 10_000;

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
  console.info(`[ingestion:worker] In-process worker loop started; polling every ${intervalMs}ms.`);
}

async function runWorkerTick(state: WorkerLoopState) {
  if (state.running) return;

  state.running = true;
  try {
    await runIngestionWorkerTick(prisma);
  } catch (error) {
    console.error("[ingestion:worker] In-process run failed.", error);
  } finally {
    state.running = false;
  }
}

function configuredIntervalMs() {
  const value = Number(process.env.INGESTION_WORKER_INTERVAL_MS);
  return Number.isFinite(value) && value >= 1_000 ? value : DEFAULT_INTERVAL_MS;
}
