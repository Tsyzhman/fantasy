/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import { aggregate, type Filters, type Snapshot } from "@/franchises/analytics";

type Entry = { json: string; bytes: number; expiresAt: number; timer: ReturnType<typeof setTimeout> };

/** Only shared report data lives here; authentication and snapshot validation run on every request. */
export class FranchiseReportCache {
  private snapshot: Snapshot | null = null;
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  constructor(
    private readonly options = { maxBytes: 24 * 1024 * 1024, maxEntries: 4, ttlMs: 60_000 },
    private readonly render = (snapshot: Snapshot, filters: Filters) => JSON.stringify(aggregate(snapshot, filters)),
  ) {}

  get(snapshot: Snapshot, filters: Filters): string {
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
    const json = this.render(snapshot, filters);
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

export const franchiseReportCache = new FranchiseReportCache();
