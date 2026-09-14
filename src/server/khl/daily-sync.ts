/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import type { PrismaClient } from '@prisma/client';
import { refreshKhlCatalogs } from './catalog-scheduler';
import { refreshKhlHistory } from './history-scheduler';
import { refreshHistoricalSeason } from './historical-season';
import { refreshKhlProtocols } from './protocol-scheduler';
import { refreshOfficialArchive } from './archive-protocol-sync';
import { refreshKhlOdds } from './odds-sync';
import { publishRollingForecast } from './rolling-forecast';
import { pruneKhl } from './retention';

/** The production entrypoint holds flock across the entire cycle, including all batches. */
export async function runKhlDailySync(db: PrismaClient, contestId: string) {
  const startedAt = new Date(), results: { source: string; status: string; detail: unknown }[] = [];
  async function step(source: string, action: () => Promise<unknown>) {
    try { const detail = await action(); results.push({ source, status: 'DONE', detail }); }
    catch (error) { results.push({ source, status: 'FAILED', detail: error instanceof Error ? error.message : 'SYNC_FAILED' }); }
    console.log(JSON.stringify(results.at(-1)));
  }
  await step('Sports: каталог', async () => { await refreshKhlCatalogs(contestId); const c = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } }); if (!c.publishedAt || c.publishedAt < startedAt) throw new Error('CATALOG_NOT_REFRESHED'); return { updatedAt: c.publishedAt }; });
  await step('KHL Mobile + Sports: текущая история', async () => {
    for (let batch = 0; batch < 60; batch++) {
      const result = await refreshKhlHistory(db, contestId, startedAt);
      if (!result || result.status !== 'DONE') throw new Error(result && 'error' in result ? String(result.error) : `HISTORY_${result?.status ?? 'BUSY'}`);
      const job = await db.khlSyncJob.findUniqueOrThrow({ where: { id: result.id } });
      const cursor = job.cursor as { remaining?: number; failedProfiles?: number };
      console.log(JSON.stringify({ source: 'Sports: текущая история', batch: batch + 1, ...cursor }));
      if (!cursor.remaining) { if (cursor.failedProfiles) throw new Error(`CURRENT_PROFILES_FAILED:${cursor.failedProfiles}`); return cursor; }
    }
    throw new Error('HISTORY_BATCH_LIMIT');
  });
  await step('Sports: прошлый сезон', async () => {
    const errors = new Set<string>();
    for (let batch = 0; batch < 60; batch++) { const r = await refreshHistoricalSeason(db, contestId); for (const e of [...r.errors,...r.deferredErrors]) errors.add(`${e.player}:${e.message}`); if (r.errors.some(e => /HTTP_40[13]|HTTP_429/.test(e.message))) throw new Error(r.errors[0].message); if (!r.remaining) { if (errors.size) throw new Error(`ARCHIVE_PROFILES_FAILED:${errors.size}:${[...errors].slice(0,5).join(';')}`); return r; } }
    throw new Error('ARCHIVE_BATCH_LIMIT');
  });
  await step('КХЛ: текущие протоколы', async () => {
    for (let batch = 0; batch < 500; batch++) {
      const r = await refreshKhlProtocols(db, contestId);
      if (r && r.status !== 'DONE') throw new Error('error' in r ? String(r.error) : r.status);
      const source = await db.khlSourceContract.findUnique({ where: { provider: 'KHL_PROTOCOL' } });
      const coverage = source?.coverage as { accessError?: string; remaining?: number } | null;
      if (coverage?.accessError) throw new Error(coverage.accessError);
      if (!r || !coverage?.remaining) return coverage;
    }
    throw new Error('PROTOCOL_BATCH_LIMIT');
  });
  await step('КХЛ: архивные протоколы', async () => {
    const cycle = {};
    for (let batch = 0; batch < 100; batch++) { const r = await refreshOfficialArchive(db, contestId, cycle); if (!r.remaining) return r; }
    throw new Error('ARCHIVE_PROTOCOL_BATCH_LIMIT');
  });
  await step('Фонбет: линия КХЛ', async () => { const r = await refreshKhlOdds(db, contestId, true); if (!r || 'skipped' in r && r.skipped === 'SOURCE_BACKOFF' || 'status' in r && r.status !== 'DONE') throw new Error('ODDS_NOT_REFRESHED'); return r; });
  await step('EP', () => publishRollingForecast(db, contestId));
  await step('Очистка', () => pruneKhl(db, new Date()));
  const status = results.some(r => r.status === 'FAILED') ? 'PARTIAL' : 'DONE';
  const key = { provider: 'KHL_DAILY', scope: contestId, jobType: 'ALL_SOURCES' };
  const data = { completedAt: new Date(), cursor: { startedAt: startedAt.toISOString(), status, sources: results.map(r => ({ source: r.source, status: r.status, detail: JSON.stringify(r.detail).slice(0, 2000) })) } };
  await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
  const health = { capabilities: ['scheduled_statistics'], permissionStatus: 'PUBLIC_READ', evidence: 'User-requested full source refresh at 10:00 and 20:00 Europe/Moscow.', health: status === 'DONE' ? 'HEALTHY' : 'DEGRADED', lastSuccessAt: status === 'DONE' ? new Date() : undefined, coverage: data.cursor };
  await db.khlSourceContract.upsert({ where: { provider: 'KHL_DAILY' }, create: { provider: 'KHL_DAILY', ...health }, update: health });
  return { status, startedAt: startedAt.toISOString(), results };
}
