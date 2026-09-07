/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import { ExpiringPromiseCache } from "@/lib/expiring-promise-cache";
import { GlobalStrategySourceError } from "./global-strategy-providers";

export class GlobalStrategyCache {
  readonly common = new ExpiringPromiseCache<string, unknown>({ maxEntries: 32, maxBytes: 1024 * 1024, estimateBytes: bytes });
  readonly personal = new ExpiringPromiseCache<string, unknown>({ maxEntries: 256, maxBytes: 2 * 1024 * 1024, estimateBytes: bytes });
  private readonly active = new Map<string, number>();
  private readonly waiting = new Map<string, (() => void)[]>();
  async limit<T>(provider: string, loader: () => Promise<T>): Promise<T> {
    if ((this.active.get(provider) ?? 0) >= 2) {
      const queue = this.waiting.get(provider) ?? [];
      if (queue.length >= 32) throw new GlobalStrategySourceError("PROVIDER_BUSY");
      this.waiting.set(provider, queue);
      await new Promise<void>((resolve) => queue.push(resolve));
    } else this.active.set(provider, (this.active.get(provider) ?? 0) + 1);
    try { return await loader(); } finally {
      const next = this.waiting.get(provider)?.shift();
      if (next) next();
      else { this.active.set(provider, (this.active.get(provider) ?? 1) - 1); this.waiting.delete(provider); }
    }
  }
  metrics(now = Date.now()) { return { common: this.common.getMetrics(now), personal: this.personal.getMetrics(now), active: Object.fromEntries(this.active), queued: [...this.waiting.values()].reduce((n, queue) => n + queue.length, 0) }; }
}
function bytes(value: unknown) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
