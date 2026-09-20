/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import type { PrismaClient } from "@prisma/client";
import { fetchKhlProtocol } from "@/providers/khl-mobile/protocol-transport";
import { importKhlProtocolHtml } from "./protocol-import";
import { enqueueKhl } from "./jobs";
import { runNextKhl } from "./coordinator";
import { lockValidLease } from "./lease";

/** Source validation errors belong to one match; access/lease/storage failures do not. */
export function isProtocolValidationError(message: string) {
  return /^PROTOCOL_/.test(message) && /INVALID|MISMATCH|DUPLICATE|NOT_SINGLE_MATCH/.test(message);
}

/** Recent corrections hourly, week-old results daily, settled matches weekly. */
export function protocolRefreshDue(startsAt: Date, completedAt: Date | undefined, now: Date, failed = false) {
  if (!completedAt) return true;
  const age = now.getTime() - startsAt.getTime();
  const ttl = failed || age < 3 * 86400000 ? 50 * 60000 : age < 7 * 86400000 ? 23 * 3600000 : 7 * 86400000;
  return now.getTime() - completedAt.getTime() >= ttl;
}

export async function refreshKhlProtocols(db: PrismaClient, contestId: string) {
  const now = new Date(), provider = "KHL_PROTOCOL";
  const source = await db.khlSourceContract.findUnique({ where: { provider } });
  const priorCoverage = source?.coverage as { retryAfter?: string; accessError?: string } | null;
  const retryAfter = priorCoverage?.retryAfter;
  if (source?.definitionVersion === "khl-protocol-v2" && retryAfter && new Date(retryAfter) > now && !isProtocolValidationError(priorCoverage?.accessError ?? '')) return;
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
  const matches = await db.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "match", match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lte: now } } }, include: { match: { select: { startsAt: true } } }, orderBy: { match: { startsAt: "desc" } }, take: 1000 });
  const checkpoints = await db.khlProviderCheckpoint.findMany({ where: { provider, jobType: "MATCH", scope: { startsWith: `${contestId}:` } }, take: 1000 });
  const seen = new Map(checkpoints.map(c => [c.scope, c.completedAt]));
  const errors = new Map(checkpoints.flatMap(c => {
    const error = (c.cursor as { error?: string }).error;
    return error ? [[c.scope, error] as const] : [];
  }));
  const due = matches.filter(m => m.match && protocolRefreshDue(m.match.startsAt, seen.get(`${contestId}:${m.externalId}`), now, errors.has(`${contestId}:${m.externalId}`))).sort((a, b) => (seen.get(`${contestId}:${a.externalId}`)?.getTime() ?? 0) - (seen.get(`${contestId}:${b.externalId}`)?.getTime() ?? 0));
  if (!due.length) return;
  const data = { capabilities: ["player_match_protocol", "attack_time", "pp_pk_time"], permissionStatus: "PUBLIC_READ", evidence: "User-authorized anonymous public protocol REST reads via curl_cffi; no browser or user session", definitionVersion: "khl-protocol-v2" };
  await db.khlSourceContract.upsert({ where: { provider }, create: { provider, ...data, coverage: {} }, update: data });
  const job = await enqueueKhl(db, provider, contestId, "PROTOCOLS");
  const result = await runNextKhl(db, { "KHL_PROTOCOL:PROTOCOLS": async (job, signal) => {
    let imported = 0, processed = 0;
    for (const match of due.slice(0, 2)) {
      const scope = `${contestId}:${match.externalId}`, lease = { id: job.id, token: job.leaseToken };
      try {
      const { html } = await fetchKhlProtocol(match.providerScope, match.externalId, signal);
      if (signal.aborted) throw new Error("LEASE_LOST");
      await importKhlProtocolHtml(db, { contestId, officialMatchId: match.externalId, html, observedAt: new Date(), lease });
      errors.delete(scope);
      imported++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'PROTOCOL_FAILED';
        if (signal.aborted || !isProtocolValidationError(message)) throw error;
        await db.$transaction(async tx => {
          await lockValidLease(tx, lease);
          const key = { provider, scope, jobType: 'MATCH' };
          const value = { cursor: { error: message }, completedAt: new Date() };
          await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...value }, update: value });
        });
        errors.set(scope, message);
      }
      processed++;
    }
    const coverage = { imported, remaining: due.length - processed, deferredMatches: errors.size, errors: [...errors].slice(0, 100).map(([scope, error]) => ({ scope, error })), accessError: null };
    await db.khlSourceContract.update({ where: { provider }, data: { coverage, ...(imported ? { lastSuccessAt: new Date() } : {}) } });
    return coverage;
  } }, job.id);
  if (result?.status === 'DONE' && errors.size) await db.khlSourceContract.update({ where: { provider }, data: { health: 'DEGRADED' } });
  if (result && "error" in result && result.error) await db.khlSourceContract.update({ where: { provider }, data: { health: "DEGRADED", coverage: { accessError: result.error, retryAfter: new Date(now.getTime() + (/HTTP_40[13]|HTTP_429/.test(result.error!) ? 86400000 : 50 * 60000)).toISOString() } } });
  return result;
}
