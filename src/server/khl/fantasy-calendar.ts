/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#fantasy-weeks
 * @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { fetchHockeyHistory, parseHockeyHistory } from '@/providers/sports-ru-hockey/history';
import { hockeyTeamLinks } from '@/providers/sports-ru-hockey/teams';
import { reconcileClubCalendars, type ClubCalendar } from '@/khl/fantasy-calendar';
import { appendRevision } from '@/khl/repositories/revisions';
import { enqueueKhl } from './jobs';
import { runNextKhl } from './coordinator';
import { lockValidLease, type KhlLease } from './lease';

const checkpointKey = (scope: string) => ({ provider: 'SPORTS_RU_CALENDAR', scope, jobType: 'WEEKS' });

export async function importSportsFantasyCalendar(db: PrismaClient, contestId: string, clubs: ClubCalendar[], observedAt: Date, lease?: KhlLease) {
  return db.$transaction(async tx => {
    await lockValidLease(tx, lease);
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contestId} FOR UPDATE`;
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    if (!contest.calendarComplete || !contest.calendarFrom || !contest.calendarTo) throw new Error('CALENDAR_NOT_READY');
    const pool = await tx.khlFantasyPlayer.findMany({ where: { contestId, active: true }, take: 1001 });
    if (pool.length > 1000) throw new Error('CALENDAR_POOL_LIMIT');
    const teamMaps = await tx.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'team', providerScope: 'global', externalId: { in: hockeyTeamLinks.map(t => t[1]) } }, take: 32 });
    for (const club of clubs) {
      const representative = pool.find(p => club.source === `https://www.sports.ru/fantasy/hockey/player/info/${contest.providerContestId}/${p.providerPlayerId}.html`);
      const officialTeam = representative && hockeyTeamLinks.find(t => t[0] === representative.clubId)?.[1];
      if (!officialTeam || !teamMaps.some(m => m.externalId === officialTeam && m.teamId === club.teamId)) throw new Error('CALENDAR_IDENTITY_INVALID');
    }
    const key = checkpointKey(contestId);
    const previous = await tx.khlProviderCheckpoint.findUnique({ where: { provider_scope_jobType: key } });
    if (previous && previous.completedAt > observedAt) throw new Error('CALENDAR_STALE_OBSERVATION');
    const matches = await tx.khlMatch.findMany({ where: { seasonId: contest.seasonId, startsAt: { gte: contest.calendarFrom, lt: contest.calendarTo } }, take: 1001 });
    const plan = reconcileClubCalendars(matches, clubs, observedAt);
    const weeks = await tx.khlFantasyWeek.findMany({ where: { contestId }, take: 101 });
    if (weeks.length > 100) throw new Error('CALENDAR_WEEK_LIMIT');
    const assignments = await tx.khlMatchFantasyWeek.findMany({ where: { contestId, matchId: { in: plan.assignments.map(a => a.matchId) } }, include: { week: true }, take: 1001 });
    const affected = new Set<string>(), confirmed = new Set<string>();
    const deferred = [...plan.deferred];
    let changed = 0, unchanged = 0;
    const batch = randomUUID();
    for (const item of plan.assignments) {
      const old = assignments.find(a => a.matchId === item.matchId);
      let week = weeks.find(w => w.providerWeekId === item.providerWeekId);
      if (old?.week.providerWeekId === item.providerWeekId) { unchanged++; confirmed.add(item.matchId); continue; }
      if (old?.week.verified || week?.verified) { deferred.push(`VERIFIED_WEEK_CONFLICT:${item.matchId}`); continue; }
      if (!week) {
        if (weeks.length >= 100) throw new Error('CALENDAR_WEEK_LIMIT');
        week = await tx.khlFantasyWeek.create({ data: { contestId, providerWeekId: item.providerWeekId, label: `Неделя ${item.providerWeekId}`, sourceUrl: item.sources[0], verified: false } });
        weeks.push(week);
      }
      await appendRevision(tx, { streamId: `sports-week:${contestId}:${item.matchId}`, transitionKey: batch,
        value: { providerWeekId: item.providerWeekId, previousWeek: old?.week.providerWeekId ?? null, sources: item.sources }, observedAt, availableAt: observedAt });
      await tx.khlMatchFantasyWeek.upsert({ where: { contestId_matchId: { contestId, matchId: item.matchId } },
        create: { contestId, matchId: item.matchId, weekId: week.id }, update: { weekId: week.id } });
      affected.add(week.id); if (old) affected.add(old.weekId);
      confirmed.add(item.matchId); changed++;
    }
    if (changed) {
      await tx.khlFantasyWeek.updateMany({ where: { id: { in: [...affected] } }, data: { revision: { increment: 1 } } });
      await tx.khlContest.update({ where: { id: contestId }, data: { revision: { increment: 1 } } });
    }
    // These conflicts described earlier observations, not a current disagreement.
    // Preserve profile observation times and all unrelated history diagnostics.
    const checks = await tx.khlProviderCheckpoint.findMany({ where: { provider: 'SPORTS_RU_STATS', jobType: 'PLAYER', scope: { in: pool.map(p => p.id) } }, take: 1000 });
    let cleared = 0; const quarantined: string[] = [];
    for (const check of checks) {
      const cursor = check.cursor as Record<string, Prisma.InputJsonValue>;
      const old = Array.isArray(cursor.quarantined) ? cursor.quarantined as string[] : [];
      const remaining = old.filter(q => !q.startsWith('WEEK_ASSIGNMENT_CONFLICT:') || !confirmed.has(q.slice('WEEK_ASSIGNMENT_CONFLICT:'.length)));
      if (remaining.length !== old.length) {
        cleared += old.length - remaining.length;
        await tx.khlProviderCheckpoint.update({ where: { id: check.id }, data: { cursor: { ...cursor, quarantined: remaining } } });
      }
      const player = pool.find(p => p.id === check.scope)!;
      quarantined.push(...remaining.map(q => `${player.providerPlayerId}:${q}`));
    }
    if (cleared) {
      const source = await tx.khlSourceContract.findUnique({ where: { provider: 'SPORTS_RU_STATS' } });
      if (source) await tx.khlSourceContract.update({ where: { id: source.id }, data: { coverage: { ...source.coverage as Record<string, Prisma.InputJsonValue>, quarantineCount: quarantined.length, quarantined: quarantined.slice(0, 100) } } });
    }
    const summary = { clubs: clubs.length, agreed: plan.assignments.length, changed, unchanged, cleared, deferred: deferred.length, errors: deferred.slice(0, 100) };
    const health = { capabilities: ['fantasy_week_numbers'], permissionStatus: 'PUBLIC_READ', evidence: 'Identity-checked anonymous Sports club calendars; both clubs must agree; exact week boundaries remain unverified.', verifiedAt: observedAt,
      health: deferred.length ? 'DEGRADED' : 'HEALTHY', ...(deferred.length ? {} : { lastSuccessAt: observedAt }), coverage: summary };
    await tx.khlSourceContract.upsert({ where: { provider: key.provider }, create: { provider: key.provider, ...health }, update: health });
    await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, cursor: summary, completedAt: observedAt }, update: { cursor: summary, completedAt: observedAt } });
    return summary;
  }, { timeout: 30000 });
}

export async function refreshKhlFantasyCalendar(db: PrismaClient, contestId: string, fetchSource = fetchHockeyHistory) {
  const job = await enqueueKhl(db, 'SPORTS_RU_CALENDAR', contestId, 'WEEKS');
  const result = await runNextKhl(db, { 'SPORTS_RU_CALENDAR:WEEKS': async (job, signal) => {
    const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
    const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true }, orderBy: { id: 'asc' }, take: 1001 });
    if (pool.length > 1000) throw new Error('CALENDAR_POOL_LIMIT');
    const clubIds = [...new Set(pool.map(p => p.clubId))];
    const representatives = clubIds.map(clubId => pool.find(p => p.clubId === clubId)!);
    if (!representatives.length || representatives.length > 32) throw new Error('CALENDAR_CLUB_LIMIT');
    const maps = await db.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'team', providerScope: 'global', externalId: { in: hockeyTeamLinks.map(t => t[1]) } }, take: 32 });
    const internal = (officialId: string) => maps.find(m => m.externalId === officialId)?.teamId;
    const clubs: ClubCalendar[] = [];
    for (const player of representatives) {
      if (signal.aborted) throw new Error('LEASE_LOST');
      const source = await fetchSource(contest.providerContestId, player.providerPlayerId, signal);
      const profile = parseHockeyHistory(source.html, { tagId: player.providerTagId ?? '', season: contest.season.seasonKey, position: player.position as 'G' | 'D' | 'F' });
      const link = hockeyTeamLinks.find(t => t[0] === player.clubId && t[2] === profile.clubSlug);
      const teamId = link && internal(link[1]);
      if (!teamId || source.url !== `https://www.sports.ru/fantasy/hockey/player/info/${contest.providerContestId}/${player.providerPlayerId}.html`) throw new Error('CALENDAR_IDENTITY_INVALID');
      const fixtures = profile.fixtures.map(f => {
        const opponent = hockeyTeamLinks.find(t => t[2] === f.opponentSlug);
        const opponentId = opponent && internal(opponent[1]);
        if (!opponentId) throw new Error('CALENDAR_TEAM_MAPPING_UNAVAILABLE');
        return { date: f.date, opponentId, home: f.home, week: f.week };
      });
      clubs.push({ teamId, source: source.url, observedAt: new Date(), fixtures });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (signal.aborted) throw new Error('LEASE_LOST');
    return importSportsFantasyCalendar(db, contestId, clubs, new Date(), { id: job.id, token: job.leaseToken });
  } }, job.id);
  if (!result || result.status !== 'DONE') throw new Error(result && 'error' in result ? result.error : 'CALENDAR_BUSY');
  const saved = await db.khlSyncJob.findUniqueOrThrow({ where: { id: result.id }, select: { cursor: true } });
  const summary = saved.cursor as { deferred: number; changed: number; clubs: number; agreed: number; unchanged: number; cleared: number; errors: string[] };
  if (summary.deferred) {
    await db.khlSourceContract.update({ where: { provider: 'SPORTS_RU_CALENDAR' }, data: { health: 'DEGRADED' } });
    throw new Error(`CALENDAR_WEEKS_DEFERRED:${summary.deferred}:${summary.errors.slice(0, 5).join(';')}`);
  }
  return summary;
}
