/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status */
export type KhlSyncOutcome = "DONE" | "PARTIAL" | "PENDING";
export const KHL_SYNC_SOURCE_LIMIT = 11;
export type KhlSyncSource = { source: string; status: "DONE" | "FAILED" | "PENDING" };
export type KhlSyncAttempt = { startedAt: string | null; completedAt: string; status: KhlSyncOutcome; sources: KhlSyncSource[] };
export type KhlSyncStatus = {
  catalogUpdatedAt: string | null;
  lastSuccessAt: string | null;
  lastAttempt: KhlSyncAttempt | null;
  runningSince: string | null;
  interrupted: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function date(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function attempt(value: unknown, completedAt: unknown): KhlSyncAttempt | null {
  const row = record(value), time = date(completedAt);
  if (!time || !["DONE", "PARTIAL", "PENDING"].includes(String(row.status))) return null;
  const sources: KhlSyncSource[] = [];
  if (Array.isArray(row.sources)) for (const value of row.sources.slice(0, KHL_SYNC_SOURCE_LIMIT)) {
    const source = record(value);
    if (typeof source.source !== "string" || !["DONE", "FAILED", "PENDING"].includes(String(source.status))) continue;
    sources.push({ source: source.source.slice(0, 120), status: source.status as KhlSyncSource["status"] });
  }
  return { startedAt: date(row.startedAt), completedAt: time, status: row.status as KhlSyncOutcome, sources };
}

export function khlSyncStatus(checkpoint: { cursor: unknown; completedAt: Date } | null, catalogUpdatedAt: Date | null, now = new Date()): KhlSyncStatus {
  const cursor = record(checkpoint?.cursor);
  const runningSince = cursor.status === "RUNNING" ? date(cursor.startedAt) : null;
  const previous = record(cursor.previousAttempt);
  const lastAttempt = cursor.status === "RUNNING" ? attempt(previous, previous.completedAt) : attempt(cursor, checkpoint?.completedAt);
  // Older non-error PENDING runs also advanced the provider timestamp. It is
  // therefore not evidence of a fully successful run and is never used here.
  const lastSuccessAt = cursor.schemaVersion === 2 ? date(cursor.lastSuccessAt) : lastAttempt?.status === "DONE" ? lastAttempt.completedAt : null;
  return { catalogUpdatedAt: date(catalogUpdatedAt), lastSuccessAt, lastAttempt, runningSince, interrupted: runningSince !== null && now.getTime() - Date.parse(runningSince) > 35 * 60000 };
}

export function khlRunningCursor(previous: KhlSyncStatus, startedAt: Date) {
  return { schemaVersion: 2, status: "RUNNING", startedAt: startedAt.toISOString(), lastSuccessAt: previous.lastSuccessAt, previousAttempt: previous.lastAttempt };
}

export function khlCompletedCursor(previous: KhlSyncStatus, startedAt: Date, completedAt: Date, results: { source: string; status: string; detail: unknown }[]) {
  const status: KhlSyncOutcome = results.some(r => r.status === "FAILED") ? "PARTIAL" : results.some(r => r.status === "PENDING") ? "PENDING" : "DONE";
  return { schemaVersion: 2, startedAt: startedAt.toISOString(), status, lastSuccessAt: status === "DONE" ? completedAt.toISOString() : previous.lastSuccessAt, sources: results.slice(0, KHL_SYNC_SOURCE_LIMIT).map(r => ({ source: r.source.slice(0, 120), status: r.status, detail: (JSON.stringify(r.detail) ?? "").slice(0, 2000) })) };
}

const moscowTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function formatKhlSyncTime(value: string | null): string {
  return value ? `${moscowTime.format(new Date(value))} МСК` : "дата неизвестна";
}
