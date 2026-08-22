type CacheEntry<Value> = {
  expiresAt: number;
  promise: Promise<Value>;
  bytes: number;
};

export type ExpiringPromiseCacheOptions<Value> = {
  maxEntries?: number;
  maxBytes?: number;
  estimateBytes?: (value: Value) => number;
};

export type ExpiringPromiseCacheMetrics = {
  hits: number;
  misses: number;
  builds: number;
  buildMs: number;
  totalBuildMs: number;
  bytes: number;
  entries: number;
  evictions: number;
  expirations: number;
  rejections: number;
};

export class ExpiringPromiseCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly estimateBytes: ((value: Value) => number) | undefined;
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;
  private builds = 0;
  private buildMs = 0;
  private totalBuildMs = 0;
  private evictions = 0;
  private expirations = 0;
  private rejections = 0;

  constructor(maxEntriesOrOptions: number | ExpiringPromiseCacheOptions<Value> = 20) {
    const options = typeof maxEntriesOrOptions === "number"
      ? { maxEntries: maxEntriesOrOptions }
      : maxEntriesOrOptions;
    this.maxEntries = options.maxEntries ?? 20;
    this.maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
    this.estimateBytes = options.estimateBytes;
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new Error("ExpiringPromiseCache maxEntries must be a positive integer.");
    }
    if (!(this.maxBytes > 0) || Number.isNaN(this.maxBytes)) {
      throw new Error("ExpiringPromiseCache maxBytes must be positive.");
    }
  }

  getOrCreate(key: Key, ttlMs: number, loader: () => Promise<Value>, now = Date.now()) {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new Error("ExpiringPromiseCache ttlMs must be a non-negative finite number.");
    }

    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      this.hits += 1;
      this.touch(key, existing);
      return existing.promise;
    }
    if (existing) this.deleteEntry(key, "expired");

    this.misses += 1;
    this.prune(now);
    const startedAt = Date.now();
    let entry: CacheEntry<Value>;
    const promise = Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          const elapsed = Math.max(0, Date.now() - startedAt);
          this.builds += 1;
          this.buildMs = elapsed;
          this.totalBuildMs += elapsed;
          if (this.entries.get(key) === entry) {
            const bytes = this.estimatedValueBytes(value);
            entry.bytes = bytes;
            this.totalBytes += bytes;
            this.trimToLimits();
          }
          return value;
        },
        (error: unknown) => {
          this.rejections += 1;
          if (this.entries.get(key) === entry) this.deleteEntry(key, "rejected");
          throw error;
        }
      );
    entry = { expiresAt: now + ttlMs, promise, bytes: 0 };
    this.entries.set(key, entry);
    this.trimToLimits();
    return promise;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  getMetrics(now = Date.now()): ExpiringPromiseCacheMetrics {
    this.prune(now);
    return {
      hits: this.hits,
      misses: this.misses,
      builds: this.builds,
      buildMs: this.buildMs,
      totalBuildMs: this.totalBuildMs,
      bytes: this.totalBytes,
      entries: this.entries.size,
      evictions: this.evictions,
      expirations: this.expirations,
      rejections: this.rejections
    };
  }

  get size() {
    return this.entries.size;
  }

  get bytes() {
    return this.totalBytes;
  }

  private estimatedValueBytes(value: Value) {
    if (!this.estimateBytes) return 0;
    try {
      const bytes = this.estimateBytes(value);
      return Number.isFinite(bytes) && bytes > 0 ? Math.ceil(bytes) : 0;
    } catch {
      return 0;
    }
  }

  private touch(key: Key, entry: CacheEntry<Value>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.deleteEntry(key, "expired");
    }
  }

  private deleteEntry(key: Key, reason: "expired" | "evicted" | "rejected") {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    if (reason === "expired") this.expirations += 1;
    if (reason === "evicted") this.evictions += 1;
  }

  private trimToLimits() {
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) return;
      this.deleteEntry(oldestKey, "evicted");
    }
  }
}
