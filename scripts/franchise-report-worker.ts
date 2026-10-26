/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import { parentPort } from "node:worker_threads";
import { loadSnapshot, snapshotRevision } from "@/server/franchises/snapshot";
import { aggregate, type Filters } from "@/franchises/analytics";

parentPort!.on("message", async ({ id, filters, revision }: { id: number; filters?: Filters; revision?: string }) => {
  try {
    const snapshot = await loadSnapshot();
    if (filters && revision !== snapshotRevision()) throw new Error("REPORT_SNAPSHOT_CHANGED");
    const result = filters ? JSON.stringify(aggregate(snapshot, filters)) : { revision: snapshotRevision(), leagues: snapshot.leagues };
    parentPort!.postMessage({ id, result });
  } catch (error) { parentPort!.postMessage({ id, error: error instanceof Error ? error.message : "REPORT_FAILED" }); }
});
