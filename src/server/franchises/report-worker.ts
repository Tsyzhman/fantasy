/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import type { Filters } from "@/franchises/analytics";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
let worker: Worker | null = null, sequence = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, Pending>();
let metadataFlight: Promise<{ revision: string; leagues: Record<string, string> }> | null = null;

function stop(error = new Error("REPORT_WORKER_STOPPED")) {
  const current = worker; worker = null; clearTimeout(idle);
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear();
  void current?.terminate();
}
function armIdle() {
  clearTimeout(idle);
  if (!pending.size) { idle = setTimeout(() => stop(), 60_000); idle.unref(); }
}
async function request(filters?: Filters, revision?: string): Promise<unknown> {
  if (pending.size >= 8) throw new Error("REPORT_QUEUE_FULL");
  clearTimeout(idle);
  if (!worker) {
    worker = new Worker(resolve(process.cwd(), "scripts/franchise-report-worker.cjs"), {
      resourceLimits: { maxOldGenerationSizeMb: 768, stackSizeMb: 4 },
      env: { ...process.env, DATABASE_URL: boundedDatabaseUrl() },
    });
    const current = worker;
    current.on("message", ({ id, result, error }: { id: number; result: unknown; error?: string }) => {
      const job = pending.get(id); if (!job) return;
      pending.delete(id); clearTimeout(job.timer);
      if (error) job.reject(new Error(error)); else job.resolve(result);
      armIdle();
    });
    current.on("error", error => { if (worker === current) stop(error); });
    current.on("exit", code => { if (worker === current) stop(new Error(`REPORT_WORKER_EXIT_${code}`)); });
    current.unref();
  }
  const current = worker, id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => stop(new Error("REPORT_TIMEOUT")), 120_000); timer.unref();
    pending.set(id, { resolve, reject, timer });
    current.postMessage({ id, filters, revision });
  });
}
function boundedDatabaseUrl() {
  if (!process.env.DATABASE_URL) return "";
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set("connection_limit", "1"); return url.href;
}
export async function franchiseReportMetadata() {
  if (!metadataFlight) metadataFlight = request().then(value => value as { revision: string; leagues: Record<string, string> });
  try { return await metadataFlight; } finally { metadataFlight = null; }
}
export async function renderFranchiseReport(revision: string, filters: Filters) { return await request(filters, revision) as string; }
export function franchiseWorkerMetrics() { return { workers: worker ? 1 : 0, pending: pending.size }; }
