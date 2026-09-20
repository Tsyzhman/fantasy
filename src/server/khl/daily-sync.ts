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
import { refreshKhlBirthDates } from './identity-sync';
import { refreshKhlInjuries } from './injury-sync';

/** The production entrypoint holds flock across the entire cycle, including all batches. */
export async function runKhlDailySync(db: PrismaClient, contestId: string) {
  const startedAt = new Date(), results: { source: string; status: string; detail: unknown }[] = [];
  const deadline = startedAt.getTime() + 15 * 60000;
  async function step(source: string, action: () => Promise<unknown>) {
    try { const detail = await action(); const pending = detail && typeof detail === 'object' && 'remaining' in detail && Number(detail.remaining) > 0; results.push({ source, status: pending ? 'PENDING' : 'DONE', detail }); }
    catch (error) { results.push({ source, status: 'FAILED', detail: error instanceof Error ? error.message : 'SYNC_FAILED' }); }
    console.log(JSON.stringify(results.at(-1)));
  }
  await step('Sports: каталог', async () => {
    const freshness = startedAt.getTime() - 60000;
    let c = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    if (c.publishedAt && c.publishedAt.getTime() >= freshness) return { updatedAt: c.publishedAt, cached: true };
    await refreshKhlCatalogs(contestId);
    // The resident worker can own the catalogue lease during deployment/startup.
    // Wait for that publication, rather than reporting a false source failure.
    for (let attempt = 0; attempt < 15; attempt++) {
      c = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
      if (c.publishedAt && c.publishedAt.getTime() >= freshness) return { updatedAt: c.publishedAt };
      const busy = await db.khlSyncJob.count({ where: { provider: 'SPORTS_RU', scope: contestId, jobType: 'CATALOG', status: { in: ['PENDING', 'RUNNING'] } } });
      if (!busy) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('CATALOG_NOT_REFRESHED');
  });
  await step('Sports: идентичность игроков', async () => {
    const result = await refreshKhlBirthDates(db, contestId);
    if (result.errors.length) throw new Error(`IDENTITY_ERRORS:${JSON.stringify(result.errors)}`);
    return result;
  });
  await step('KHL Mobile + Sports: текущая история', async () => {
    let last: { remaining?: number; failedProfiles?: number } = {};
    for (let batch = 0; batch < 20 && Date.now() < deadline; batch++) {
      const result = await refreshKhlHistory(db, contestId);
      if (!result || result.status !== 'DONE') throw new Error(result && 'error' in result ? String(result.error) : `HISTORY_${result?.status ?? 'BUSY'}`);
      const job = await db.khlSyncJob.findUniqueOrThrow({ where: { id: result.id } });
      const cursor = job.cursor as { remaining?: number; failedProfiles?: number };
      last = cursor;
      const { quarantined: _details, ...summary } = cursor as typeof cursor & { quarantined?: unknown };
      console.log(JSON.stringify({ source: 'Sports: текущая история', batch: batch + 1, ...summary }));
      if (!cursor.remaining) { if (cursor.failedProfiles) throw new Error(`CURRENT_PROFILES_FAILED:${cursor.failedProfiles}`); return cursor; }
    }
    if (last.failedProfiles) throw new Error(`CURRENT_PROFILES_FAILED:${last.failedProfiles}`);
    return { ...last, remaining: last.remaining ?? 1, deferred: 'HOURLY_BUDGET' };
  });
  await step('КХЛ: текущие протоколы', async () => {
    let last: { accessError?: string; remaining?: number } | null = null;
    for (let batch = 0; batch < 12 && Date.now() < deadline; batch++) {
      const r = await refreshKhlProtocols(db, contestId);
      if (r && r.status !== 'DONE') throw new Error('error' in r ? String(r.error) : r.status);
      const source = await db.khlSourceContract.findUnique({ where: { provider: 'KHL_PROTOCOL' } });
      const coverage = source?.coverage as { accessError?: string; remaining?: number } | null;
      last = coverage;
      if (coverage?.accessError) throw new Error(coverage.accessError);
      if (!r || !coverage?.remaining) return coverage;
    }
    return { ...last, remaining: last?.remaining ?? 1, deferred: 'HOURLY_BUDGET' };
  });
  await step('Sports: прошлый сезон', async () => {
    const r = await refreshHistoricalSeason(db, contestId);
    const errors = [...r.errors, ...r.deferredErrors];
    if (errors.length) throw new Error(`ARCHIVE_PROFILES_FAILED:${errors.length}:${errors.slice(0, 5).map(e => `${e.player}:${e.message}`).join(';')}`);
    return r;
  });
  await step('КХЛ: архивные протоколы', async () => {
    if (Date.now() >= deadline) return { remaining: 1, deferred: 'HOURLY_BUDGET' };
    return refreshOfficialArchive(db, contestId);
  });
  await step('Фонбет: линия КХЛ', async () => { const r = await refreshKhlOdds(db, contestId, true); if (!r || 'skipped' in r && r.skipped === 'SOURCE_BACKOFF' || 'status' in r && r.status !== 'DONE') throw new Error('ODDS_NOT_REFRESHED'); return r; });
  await step('КХЛ: травмированные', () => refreshKhlInjuries(db, contestId));
  await step('EP', () => publishRollingForecast(db, contestId));
  await step('Очистка', () => pruneKhl(db, new Date()));
  const status = results.some(r => r.status === 'FAILED') ? 'PARTIAL' : results.some(r => r.status === 'PENDING') ? 'PENDING' : 'DONE';
  const key = { provider: 'KHL_DAILY', scope: contestId, jobType: 'ALL_SOURCES' };
  const data = { completedAt: new Date(), cursor: { startedAt: startedAt.toISOString(), status, sources: results.map(r => ({ source: r.source, status: r.status, detail: JSON.stringify(r.detail).slice(0, 2000) })) } };
  await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
  const health = { capabilities: ['scheduled_statistics'], permissionStatus: 'PUBLIC_READ', evidence: 'User-requested incremental server refresh every hour at :22 Europe/Moscow; no browser; bounded batches with checkpoints.', health: status === 'PARTIAL' ? 'DEGRADED' : 'HEALTHY', lastSuccessAt: status !== 'PARTIAL' ? new Date() : undefined, coverage: data.cursor };
  await db.khlSourceContract.upsert({ where: { provider: 'KHL_DAILY' }, create: { provider: 'KHL_DAILY', ...health }, update: health });
  return { status, startedAt: startedAt.toISOString(), results };
}
