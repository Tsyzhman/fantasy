type CacheEntry<Value> = {
  expiresAt: number;
  promise: Promise<Value>;
};

export class ExpiringPromiseCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();

  constructor(private readonly maxEntries = 20) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("ExpiringPromiseCache maxEntries must be a positive integer.");
    }
  }

  getOrCreate(key: Key, ttlMs: number, loader: () => Promise<Value>, now = Date.now()) {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new Error("ExpiringPromiseCache ttlMs must be a non-negative finite number.");
    }

    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) return existing.promise;
    if (existing) this.entries.delete(key);

    this.prune(now);
    const promise = Promise.resolve().then(loader);
    const entry = { expiresAt: now + ttlMs, promise };
    this.entries.set(key, entry);
    promise.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    this.trimToLimit();
    return promise;
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  private trimToLimit() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}
