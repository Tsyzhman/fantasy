/** @spec spec://common/INFRA-006-continuous-deployment#observability */
import { createHash } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
type SqlSummary = { count: number; totalMs: number; maxMs: number };
type DiagnosticState = { queries: Map<string, SqlSummary>; windowStart: number; started: boolean };
// Instrumentation and route chunks can contain separate copies of this module.
const diagnosticsGlobal = globalThis as typeof globalThis & { __fantasyRuntimeDiagnosticsV1?: DiagnosticState };
const state = diagnosticsGlobal.__fantasyRuntimeDiagnosticsV1 ??= { queries: new Map(), windowStart: Date.now(), started: false };
const queries = state.queries;
export function recordSqlQuery(query: string, durationMs: number) {
  const fingerprint = createHash("sha256").update(query).digest("hex").slice(0, 16);
  const key = queries.has(fingerprint) || queries.size < 127 ? fingerprint : "other";
  const old = queries.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
  old.count++; old.totalMs += durationMs; old.maxMs = Math.max(old.maxMs, durationMs); queries.set(key, old);
  if (durationMs >= 500) console.warn(JSON.stringify({ scope: "sql-slow", timestamp: new Date().toISOString(), pid: process.pid, commit: process.env.APP_RELEASE_COMMIT, fingerprint, durationMs }));
}
export function diagnosticSqlWindow() { return { windowStart: state.windowStart, fingerprints: queries.size, top: [...queries].sort((a,b) => b[1].totalMs - a[1].totalMs).slice(0, 20).map(([fingerprint, metrics]) => ({ fingerprint, ...metrics })) }; }
export function startRuntimeDiagnostics() {
  if (state.started || process.env.NODE_ENV !== "production") return; state.started = true;
  const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
  let priorCpu = process.cpuUsage(), priorTime = Date.now();
  let priorDb: { at: number; bytes: bigint; files: bigint } | null = null;
  const timer = setInterval(async () => {
    const now = Date.now(), cpu = process.cpuUsage(), memory = process.memoryUsage();
    console.info(JSON.stringify({ scope: "runtime-diagnostics", timestamp: new Date(now).toISOString(), pid: process.pid, commit: process.env.APP_RELEASE_COMMIT,
      role: process.env.INGESTION_WORKER_IN_PROCESS === "true" ? "worker" : "web", memory,
      cpuPercent: ((cpu.user + cpu.system - priorCpu.user - priorCpu.system) / ((now - priorTime) * 1000)) * 100,
      eventLoopMs: { p95: lag.percentile(95) / 1e6, max: lag.max / 1e6 }, sql: diagnosticSqlWindow() }));
    priorCpu = cpu; priorTime = now; lag.reset();
    if (now - state.windowStart >= 300000) { queries.clear(); state.windowStart = now; }
    if (process.env.INGESTION_WORKER_IN_PROCESS !== "true") return;
    try {
      const { prisma } = await import("@/lib/db");
      const [row] = await prisma.$queryRaw<Array<{ bytes: bigint; files: bigint }>>`SELECT temp_bytes AS bytes, temp_files AS files FROM pg_stat_database WHERE datname = current_database()`;
      if (row && priorDb && row.bytes >= priorDb.bytes && row.files >= priorDb.files) console.info(JSON.stringify({ scope: "database-window", timestamp: new Date(now).toISOString(), start: new Date(priorDb.at).toISOString(), seconds: (now - priorDb.at) / 1000, tempBytes: String(row.bytes - priorDb.bytes), tempFiles: String(row.files - priorDb.files) }));
      if (row) priorDb = { ...row, at: now };
    } catch { console.error("Database diagnostic interval unavailable"); }
  }, 60000); timer.unref();
}
