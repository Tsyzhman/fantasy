/** @spec spec://modules/khl/INFRA-003-khl-fonbet-odds#snapshots */
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { fetchHockeyJson, parseHockeyLine, verifyHockeyDictionary, KHL_LINE_VERSION } from '@/providers/fonbet/hockey-line';
import { storeHockeyOdds } from './odds-storage';
import { enqueueKhl } from './jobs';
import { runNextKhl } from './coordinator';
import { lockValidLease } from './lease';
export async function refreshKhlOdds(db: PrismaClient, contestId: string, force = false) {
  const now = new Date(), provider = 'FONBET_HOCKEY';
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
  const matches = await db.khlMatch.findMany({ where: { seasonId: contest.seasonId, status: 'SCHEDULED', startsAt: { gt: now, lt: new Date(now.getTime() + 7 * 86400000) } }, take: 200 });
  const source = await db.khlSourceContract.findUnique({ where: { provider } });
  const retryAfter = (source?.coverage as { retryAfter?: string } | null)?.retryAfter;
  if (retryAfter && new Date(retryAfter) > now) return { skipped: 'SOURCE_BACKOFF' };
  const ttl = matches.some(m => m.startsAt.getTime() - now.getTime() < 6 * 3600000) ? 60000 : 15 * 60000;
  if (!force && source?.lastSuccessAt && now.getTime() - source.lastSuccessAt.getTime() < ttl) return { skipped: 'FRESH' };
  const job = await enqueueKhl(db, provider, contestId, 'ODDS');
  const result = await runNextKhl(db, { 'FONBET_HOCKEY:ODDS': async (job, signal) => {
    const verifyDictionary = force || !source?.verifiedAt || source.definitionVersion !== KHL_LINE_VERSION || now.getTime() - source.verifiedAt.getTime() > 86400000;
    if (verifyDictionary) {
      const dictionary = await fetchHockeyJson('line/factorsCatalog/tables', signal);
      if (!verifyHockeyDictionary(dictionary.payload)) throw new Error('HOCKEY_DICTIONARY_CHANGED');
    }
    const line = await fetchHockeyJson('events/listBase', signal), observedAt = new Date();
    const events = parseHockeyLine(line.payload);
    const maps = await db.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'team', providerScope: 'global' }, take: 100 });
    const teams = new Map(maps.map(m => [m.externalId, m.teamId]));
    let matched = 0, changed = 0;
    for (const e of events) {
      if (signal.aborted) throw new Error('LEASE_LOST');
      const candidates = matches.filter(m => m.homeId === teams.get(e.homeId) && m.awayId === teams.get(e.awayId) && Math.abs(m.startsAt.getTime() - e.startsAt.getTime()) <= 15 * 60000);
      if (candidates.length !== 1 || events.filter(other => other.homeId === e.homeId && other.awayId === e.awayId && Math.abs(other.startsAt.getTime() - candidates[0].startsAt.getTime()) <= 15 * 60000).length !== 1) continue;
      const existing = await db.khlOddsEventMap.findUnique({ where: { provider_externalId: { provider: 'FONBET', externalId: e.id } } });
      if (existing && existing.matchId !== candidates[0].id) continue;
      const event = await db.khlOddsEventMap.upsert({ where: { provider_externalId: { provider: 'FONBET', externalId: e.id } }, create: { provider: 'FONBET', externalId: e.id, matchId: candidates[0].id, dictionaryVersion: KHL_LINE_VERSION, verifiedAt: observedAt }, update: { dictionaryVersion: KHL_LINE_VERSION, verifiedAt: observedAt } });
      const stored = await storeHockeyOdds(db, { eventId: event.id, dictionaryVersion: KHL_LINE_VERSION, markets: e.markets, complete: false, success: true, observedAt, batchId: randomUUID() });
      if (stored.stale) continue;
      const snapshots = await db.khlOddsSnapshot.findMany({ where: { eventId: event.id }, orderBy: [{ observedAt: 'desc' }, { revision: 'desc' }], distinct: ['marketKey'], take: 10 });
      await db.$transaction(async tx => {
        await lockValidLease(tx, { id: job.id, token: job.leaseToken });
        const key = { provider, scope: event.id, jobType: 'LINE' };
        const data = { completedAt: observedAt, cursor: { markets: e.markets, snapshotIds: snapshots.map(s => s.id), source: line.source, startsAt: e.startsAt.toISOString() } as unknown as Prisma.InputJsonValue };
        await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
      });
      matched++; changed += stored.changed;
    }
    const coverage = { events: events.length, upcoming: matches.length, matched, changed, market: '1X2_REGULATION_60', source: line.source };
    const data = { capabilities: ['1x2_regulation_60'], permissionStatus: 'VERIFIED', evidence: 'Public Fonbet tables: Исходы 921/922/923; hockey rule 10.1; 12 KHL prematch samples 2026-09-14. Other markets unverified.', definitionVersion: KHL_LINE_VERSION, verifiedAt: verifyDictionary ? now : source!.verifiedAt, health: 'HEALTHY', lastSuccessAt: observedAt, coverage };
    await db.khlSourceContract.upsert({ where: { provider }, create: { provider, ...data }, update: data });
    // A refreshed unchanged line can make an old fallback usable again.
    await db.khlContest.update({ where: { id: contestId }, data: { revision: { increment: 1 } } });
    return coverage;
  } }, job.id);
  if (result && 'error' in result && result.error) {
    const data = { health: 'DEGRADED', coverage: { error: result.error, retryAfter: new Date(now.getTime() + (/HTTP_40[13]|HTTP_429/.test(result.error) ? 3600000 : 60000)).toISOString() } };
    await db.khlSourceContract.upsert({ where: { provider }, create: { provider, capabilities: ['1x2_regulation_60'], evidence: 'Public line probe failed; last-good data retained.', ...data }, update: data });
  }
  return result;
}
