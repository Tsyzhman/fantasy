/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import type { PrismaClient } from "@prisma/client";
import { fetchKhlProtocol } from "@/providers/khl-mobile/protocol-transport";
import { importKhlProtocolHtml } from "./protocol-import";
import { enqueueKhl } from "./jobs";
import { runNextKhl } from "./coordinator";

export async function refreshKhlProtocols(db: PrismaClient, contestId: string) {
  const now = new Date(), provider = "KHL_PROTOCOL";
  const source = await db.khlSourceContract.findUnique({ where: { provider } });
  const retryAfter = (source?.coverage as { retryAfter?: string } | null)?.retryAfter;
  if (retryAfter && new Date(retryAfter) > now) return;
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
  const matches = await db.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "match", match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lte: now } } }, orderBy: { match: { startsAt: "desc" } }, take: 1000 });
  const checkpoints = await db.khlProviderCheckpoint.findMany({ where: { provider, jobType: "MATCH", scope: { startsWith: `${contestId}:` } }, take: 1000 });
  const seen = new Map(checkpoints.map(c => [c.scope, c.completedAt]));
  const due = matches.filter(m => !seen.has(`${contestId}:${m.externalId}`) || now.getTime() - seen.get(`${contestId}:${m.externalId}`)!.getTime() > 86400000).sort((a, b) => (seen.get(`${contestId}:${a.externalId}`)?.getTime() ?? 0) - (seen.get(`${contestId}:${b.externalId}`)?.getTime() ?? 0));
  if (!due.length) return;
  const data = { capabilities: ["player_match_protocol", "attack_time", "pp_pk_time"], permissionStatus: "PUBLIC_READ", evidence: "User-requested public match protocol collection; HTTP access restrictions are respected", definitionVersion: "khl-protocol-v1" };
  await db.khlSourceContract.upsert({ where: { provider }, create: { provider, ...data, coverage: {} }, update: data });
  const job = await enqueueKhl(db, provider, contestId, "PROTOCOLS");
  const result = await runNextKhl(db, { "KHL_PROTOCOL:PROTOCOLS": async (job, signal) => {
    let imported = 0;
    for (const match of due.slice(0, 2)) {
      const { html } = await fetchKhlProtocol(match.providerScope, match.externalId, signal);
      if (signal.aborted) throw new Error("LEASE_LOST");
      await importKhlProtocolHtml(db, { contestId, officialMatchId: match.externalId, html, observedAt: new Date(), lease: { id: job.id, token: job.leaseToken } });
      imported++;
    }
    await db.khlSourceContract.update({ where: { provider }, data: { coverage: { imported, remaining: due.length - imported, accessError: null }, lastSuccessAt: new Date() } });
    return { imported, remaining: due.length - imported };
  } }, job.id);
  if (result && "error" in result && result.error) await db.khlSourceContract.update({ where: { provider }, data: { health: "DEGRADED", coverage: { accessError: result.error, retryAfter: new Date(now.getTime() + (/HTTP_40[13]/.test(result.error!) ? 86400000 : 3600000)).toISOString() } } });
  return result;
}
