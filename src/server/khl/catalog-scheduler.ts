/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { fetchHockeyCatalog } from "@/providers/sports-ru-hockey/catalog";
import { contentHash } from "@/khl/repositories/revisions";
import { importCatalog } from "./catalog-sync";
import { enqueueKhl } from "./jobs";
import { runNextKhl } from "./coordinator";
import { lockValidLease } from "./lease";
import { pruneKhl } from "./retention";
import { startKhlHistoryScheduler } from "./history-scheduler";

// Only fingerprints survive a cycle, never player payloads. The publication
// timestamp fences this optimization against another importer changing data.
const seen = new Map<string, { hash: string; publishedAt: number }>();
let started = false;

export async function refreshKhlCatalogs() {
  if (process.env.KHL_SYNC_ENABLED !== "true") return;
  const ids = (process.env.KHL_CATALOG_CONTEST_IDS ?? "").split(",").filter(id => /^\d{1,12}$/.test(id)).slice(0, 5);
  if (!ids.length) return;
  const contests = await prisma.khlContest.findMany({ where: { provider: "SPORTS_RU", providerContestId: { in: ids } }, orderBy: { id: "asc" }, take: 5 });
  for (const contest of contests) {
    const queued = await enqueueKhl(prisma, "SPORTS_RU", contest.id, "CATALOG");
    const result = await runNextKhl(prisma, { "SPORTS_RU:CATALOG": async (job, signal) => {
      const observedAt = new Date();
      const parsed = await fetchHockeyCatalog(contest.providerContestId);
      if (parsed.quarantined.length) throw new Error(`CATALOG_QUARANTINE:${parsed.quarantined.length}`);
      if (signal.aborted) throw new Error("LEASE_LOST");
      const hash = contentHash([...parsed.rows].sort((a, b) => a.providerPlayerId.localeCompare(b.providerPlayerId)));
      const cached = seen.get(contest.id);
      const lease = { id: job.id, token: job.leaseToken };
      const refreshed = cached?.hash === hash && await prisma.$transaction(async tx => {
        await lockValidLease(tx, lease);
        await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contest.id} FOR UPDATE`;
        const current = await tx.khlContest.findUniqueOrThrow({ where: { id: contest.id } });
        if (!current.catalogComplete || current.publishedAt?.getTime() !== cached.publishedAt || current.publishedAt > observedAt) return false;
        await tx.khlFantasyPlayer.updateMany({ where: { contestId: contest.id, active: true }, data: { observedAt } });
        await tx.khlContest.update({ where: { id: contest.id }, data: { publishedAt: observedAt } });
        return true;
      });
      if (!refreshed) await importCatalog(prisma, contest.id, parsed.rows, randomUUID(), observedAt, true, lease);
      seen.set(contest.id, { hash, publishedAt: observedAt.getTime() });
      return { fingerprint: hash, players: parsed.rows.length, unchanged: Boolean(refreshed) };
    } }, queued.id);
    if (result?.status !== "DONE" && result) console.warn("KHL catalog sync", result);
  }
  for (const id of seen.keys()) if (!contests.some(c => c.id === id)) seen.delete(id);
  await pruneKhl(prisma, new Date());
}

export function startKhlCatalogScheduler() {
  if (started || process.env.KHL_SYNC_ENABLED !== "true") return;
  started = true;
  startKhlHistoryScheduler();
  async function tick() {
    try { await refreshKhlCatalogs(); }
    catch (error) { console.error("KHL catalog scheduler failed", error); }
    finally { setTimeout(() => { void tick(); }, 45000).unref(); }
  }
  void tick();
}
