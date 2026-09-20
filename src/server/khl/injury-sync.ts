/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import type { PrismaClient } from '@prisma/client';
import { fetchKhlInjuries } from '@/providers/khl-mobile/injuries';
import { hockeyTeamLinks } from '@/providers/sports-ru-hockey/teams';
import { recordAvailability } from './observations';

export async function refreshKhlInjuries(db: PrismaClient, contestId: string) {
  const now = new Date(), bucket = Math.floor(now.getTime() / 3600000), expiresAt = new Date((bucket + 2) * 3600000);
  const key = { provider: 'KHL_INJURIES', scope: contestId, jobType: 'CLUBS' };
  const checkpoint = await db.khlProviderCheckpoint.findUnique({ where: { provider_scope_jobType: key } });
  if (checkpoint && Math.floor(checkpoint.completedAt.getTime() / 3600000) === bucket) return { cached: true };
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
  const [season, pool] = await Promise.all([
    db.khlExternalEntityMap.findFirstOrThrow({ where: { provider: 'KHL', entityType: 'season', seasonId: contest.seasonId } }),
    db.khlFantasyPlayer.findMany({ where: { contestId, active: true }, select: { playerId: true, clubId: true }, take: 1001 }),
  ]);
  if (pool.length > 1000) throw new Error('INJURY_POOL_LIMIT');
  const clubs = [...new Set(pool.map(p => hockeyTeamLinks.find(t => t[0] === p.clubId)?.[1]))];
  if (clubs.some(c => !c)) throw new Error('INJURY_TEAM_MAPPING_MISSING');
  const ids = await fetchKhlInjuries(season.externalId, clubs as string[]);
  const maps = await db.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'player', providerScope: 'global', externalId: { in: ids } }, take: 1000 });
  const source = 'https://www.khl.ru/rest/clubs/team/';
  const previous = await db.khlAvailabilityObservation.findMany({ where: { source, field: 'injury', quality: 'FACT', expiresAt: { gt: now }, playerId: { in: pool.flatMap(p => p.playerId ? [p.playerId] : []) } }, select: { playerId: true }, distinct: ['playerId'], take: 1000 });
  const injured = new Set(maps.flatMap(m => m.playerId && pool.some(p => p.playerId === m.playerId) ? [m.playerId] : []));
  for (const playerId of new Set([...injured, ...previous.map(p => p.playerId)])) {
    const present = injured.has(playerId);
    await recordAvailability(db, { playerId, field: 'injury', source, observedAt: now, expiresAt, value: present ? 'В списке травмированных КХЛ' : 'Нет актуального подтверждения травмы', quality: present ? 'FACT' : 'UNKNOWN', transitionKey: `${contestId}:${bucket}:${present}` });
  }
  const cursor = { clubs: clubs.length, listed: ids.length, matched: injured.size, unlinked: ids.filter(id => !maps.some(m => m.externalId === id)) };
  await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, completedAt: now, cursor }, update: { completedAt: now, cursor } });
  return cursor;
}
