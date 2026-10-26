/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { fetchHockeyCatalog } from "@/providers/sports-ru-hockey/catalog";
import { contentHash } from "@/khl/repositories/revisions";
import { importCatalog } from "./catalog-sync";
import { enqueueKhl } from "./jobs";
import { runNextKhl } from "./coordinator";
import { lockValidLease } from "./lease";
import { startKhlRetentionScheduler } from "./retention";
import { startKhlHistoryScheduler } from "./history-scheduler";

let started = false;

export async function refreshKhlCatalogs(contestId?: string) {
  if (process.env.KHL_SYNC_ENABLED !== "true") return;
  const ids = (process.env.KHL_CATALOG_CONTEST_IDS ?? "").split(",").filter(id => /^\d{1,12}$/.test(id)).slice(0, 5);
  if (!ids.length) return;
  const contests = await prisma.khlContest.findMany({ where: { ...(contestId ? { id: contestId } : {}), provider: "SPORTS_RU", providerContestId: { in: ids } }, orderBy: { id: "asc" }, take: 5 });
  for (const contest of contests) {
    const queued = await enqueueKhl(prisma, "SPORTS_RU", contest.id, "CATALOG");
    const result = await runNextKhl(prisma, { "SPORTS_RU:CATALOG": async (job, signal) => {
      const observedAt = new Date();
      const parsed = await fetchHockeyCatalog(contest.providerContestId);
      if (parsed.quarantined.length) throw new Error(`CATALOG_QUARANTINE:${parsed.quarantined.length}`);
      if (signal.aborted) throw new Error("LEASE_LOST");
      const hash = contentHash([...parsed.rows].sort((a, b) => a.providerPlayerId.localeCompare(b.providerPlayerId)));
      const lease = { id: job.id, token: job.leaseToken };
      const refreshed = await prisma.$transaction(async tx => {
        await lockValidLease(tx, lease);
        await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contest.id} FOR UPDATE`;
        const current = await tx.khlContest.findUniqueOrThrow({ where: { id: contest.id } });
        if (!current.catalogComplete || current.catalogHash !== hash || (current.catalogCheckedAt && current.catalogCheckedAt > observedAt)) return false;
        await tx.khlContest.update({ where: { id: contest.id }, data: { catalogCheckedAt: observedAt } });
        return true;
      });
      if (!refreshed) await importCatalog(prisma, contest.id, parsed.rows, randomUUID(), observedAt, true, lease);
      return { fingerprint: hash, players: parsed.rows.length, unchanged: Boolean(refreshed) };
    } }, queued.id);
    if (result?.status !== "DONE" && result) console.warn("KHL catalog sync", result);
  }
}

export function startKhlCatalogScheduler() {
  if (started || process.env.KHL_SYNC_ENABLED !== "true") return;
  started = true;
  startKhlHistoryScheduler();
  startKhlRetentionScheduler();
  async function tick() {
    try { await refreshKhlCatalogs(); }
    catch (error) { console.error("KHL catalog scheduler failed", error); }
    finally { setTimeout(() => { void tick(); }, 45000).unref(); }
  }
  void tick();
}
