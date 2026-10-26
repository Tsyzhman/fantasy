/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import { aggregate, type Filters, type Snapshot } from "@/franchises/analytics";
import { renderFranchiseReport } from "./report-worker";

type Entry = { json: string; bytes: number; expiresAt: number; timer: ReturnType<typeof setTimeout> };

/** Only shared report data lives here; authentication and snapshot validation run on every request. */
export class FranchiseReportCache<T = Snapshot> {
  private snapshot: T | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<string>>();
  private bytes = 0;
  private generation = 0;

  constructor(
    private readonly options = { maxBytes: 24 * 1024 * 1024, maxEntries: 4, ttlMs: 60_000 },
    private readonly render: (snapshot: T, filters: Filters) => string | Promise<string> = (snapshot, filters) => JSON.stringify(aggregate(snapshot as unknown as Snapshot, filters)),
  ) {}

  async get(snapshot: T, filters: Filters): Promise<string> {
    if (this.snapshot !== snapshot) {
      this.clear();
      this.snapshot = snapshot;
    }
    // Keep league order because the response echoes the original filters.
    const key = JSON.stringify(filters);
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.json;
    }
    if (existing) this.remove(key);
    const pendingKey = `${this.generation}:${key}`;
    const flight = this.pending.get(pendingKey);
    if (flight) return flight;
    if (this.pending.size >= 8) throw new Error("REPORT_QUEUE_FULL");
    const rendering = Promise.resolve().then(() => this.render(snapshot, filters));
    this.pending.set(pendingKey, rendering);
    let json: string;
    try { json = await rendering; } finally { this.pending.delete(pendingKey); }
    if (this.snapshot !== snapshot) return json;
    // Upper bound for V8's UTF-16 string representation, including non-ASCII labels.
    const bytes = json.length * 2;
    if (bytes > this.options.maxBytes) return json;
    while (this.entries.size >= this.options.maxEntries || this.bytes + bytes > this.options.maxBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.remove(oldest.value);
    }
    const timer = setTimeout(() => {
      this.remove(key);
      if (this.entries.size === 0) this.snapshot = null;
    }, this.options.ttlMs);
    timer.unref?.();
    this.entries.set(key, { json, bytes, expiresAt: Date.now() + this.options.ttlMs, timer });
    this.bytes += bytes;
    return json;
  }

  clear() {
    this.generation++;
    for (const key of this.entries.keys()) this.remove(key);
    this.snapshot = null;
  }

  metrics() {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}

export const franchiseReportCache = new FranchiseReportCache<string>(undefined, renderFranchiseReport);
