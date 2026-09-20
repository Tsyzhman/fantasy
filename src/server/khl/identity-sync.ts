/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import type { PrismaClient } from '@prisma/client';
import { fetchSportsBirthDate } from '@/providers/sports-ru-hockey/identity';
import { fetchKhlIdentity } from '@/providers/khl-mobile/identity';

export async function refreshKhlBirthDates(db: PrismaClient, contestId: string) {
  const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true, player: { birthDate: null } }, include: { player: true }, orderBy: { id: 'asc' }, take: 1001 });
  if (pool.length > 1000) throw new Error('IDENTITY_POOL_LIMIT');
  const provider = 'SPORTS_RU_IDENTITY';
  const checkpoints = await db.khlProviderCheckpoint.findMany({ where: { provider, jobType: 'BIRTHDATE', scope: { in: pool.map(p => p.id) } }, take: 1000 });
  const due = pool.filter(p => p.playerId && p.providerTagId && !checkpoints.some(c => c.scope === p.id && c.completedAt.getTime() > Date.now() - 86400000));
  let imported = 0; const errors: { player: string; error: string }[] = [];
  for (const player of due.slice(0, 20)) {
    const key = { provider, scope: player.id, jobType: 'BIRTHDATE' };
    try {
      const identity = await fetchSportsBirthDate(player.providerTagId!);
      const mapping = await db.khlExternalEntityMap.findFirst({ where: { provider: 'KHL', entityType: 'player', providerScope: 'global', playerId: player.playerId } });
      const official = mapping ? await fetchKhlIdentity(mapping.externalId) : null;
      // A source disagreement needs review; never poison a verified ID with a wrong DOB.
      if (official && official.birthDate !== identity.birthDate) throw new Error('SOURCES_BIRTHDATE_CONFLICT');
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM khl_players WHERE id = ${player.playerId} FOR UPDATE`;
        const current = await tx.khlPlayer.findUniqueOrThrow({ where: { id: player.playerId! } });
        if (current.birthDate && current.birthDate.toISOString().slice(0, 10) !== identity.birthDate) throw new Error('PLAYER_BIRTHDATE_CONFLICT');
        await tx.khlPlayer.update({ where: { id: current.id }, data: { birthDate: new Date(identity.birthDate) } });
        const data = { cursor: { tagId: player.providerTagId, ...identity, official }, completedAt: new Date() };
        await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
      });
      imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BIO_FAILED';
      errors.push({ player: player.providerPlayerId, error: message });
      const data = { cursor: { error: message }, completedAt: new Date() };
      await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
      if (/HTTP_40[13]|HTTP_429/.test(message)) break;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { imported, remaining: pool.length - imported, errors };
}
