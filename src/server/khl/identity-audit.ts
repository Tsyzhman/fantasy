/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { bindExternalEntity } from './data-layer';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const identity = z.object({ id: z.string().regex(/^\d{1,12}$/), name: z.string().min(3).max(120), english: z.string().max(120).optional(), birthDate: date, source: z.string().url() });
const schema = z.object({ version: z.literal(1), contestId: z.string(), entries: z.array(z.object({
  fantasyId: z.string(), playerId: z.string(), name: z.string().min(3).max(120),
  sports: identity, official: identity.nullable(),
  reviewedDiscrepancy: z.string().min(20).max(600).optional(),
})).min(1).max(1000) });
const nameKey = (s: string) => s.toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}]+/gu, ' ').trim().split(/\s+/).filter(t => t.length >= 3).sort();

export function validateIdentityAudit(input: unknown) {
  const bundle = schema.parse(input);
  for (const field of ['fantasyId', 'playerId'] as const) if (new Set(bundle.entries.map(e => e[field])).size !== bundle.entries.length) throw new Error('IDENTITY_DUPLICATE_CANONICAL');
  const external = bundle.entries.flatMap(e => e.official ? [e.official.id] : []);
  if (new Set(external).size !== external.length) throw new Error('IDENTITY_DUPLICATE_EXTERNAL');
  for (const e of bundle.entries) {
    if (e.sports.source !== `https://www.sports.ru/tags/${e.sports.id}/`) throw new Error('IDENTITY_SPORTS_SOURCE_INVALID');
    if (!e.official) continue;
    if (e.official.source !== `https://www.khl.ru/players/${e.official.id}/`) throw new Error('IDENTITY_KHL_SOURCE_INVALID');
    const a = nameKey(e.name), b = nameKey(e.official.name);
    const english = nameKey(e.sports.english ?? ''), officialEnglish = nameKey(e.official.english ?? '');
    if (!a.some(t => b.includes(t)) && !english.some(t => officialEnglish.includes(t))) throw new Error('IDENTITY_NAME_CONFLICT');
    if (e.sports.birthDate !== e.official.birthDate && (!e.reviewedDiscrepancy || a.join(' ') !== b.join(' '))) throw new Error('IDENTITY_UNREVIEWED_DOB_CONFLICT');
  }
  return bundle;
}

/** Applies an operator-reviewed, complete pool snapshot; never reassigns an existing external ID. */
export async function importIdentityAudit(db: PrismaClient, contestId: string, input: unknown, dryRun = true) {
  const bundle = validateIdentityAudit(input);
  if (bundle.contestId !== contestId) throw new Error('IDENTITY_CONTEST_MISMATCH');
  return db.$transaction(async tx => {
    const pool = await tx.khlFantasyPlayer.findMany({ where: { contestId, active: true }, include: { player: true }, take: 1001 });
    if (pool.length !== bundle.entries.length) throw new Error('IDENTITY_POOL_CHANGED');
    const mappings = await tx.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'player', providerScope: 'global' }, take: 2001 });
    if (mappings.length > 2000) throw new Error('IDENTITY_MAPPING_LIMIT');
    let added = 0, dates = 0, discrepancies = 0;
    for (const e of [...bundle.entries].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
      const p = pool.find(p => p.id === e.fantasyId);
      if (!p || p.playerId !== e.playerId || p.providerTagId !== e.sports.id || p.player?.name !== e.name) throw new Error('IDENTITY_POOL_CHANGED');
      const old = mappings.filter(m => m.playerId === e.playerId), official = e.official;
      if (old.length > 1 || old.length && old[0].externalId !== official?.id || official && mappings.some(m => m.externalId === official.id && m.playerId !== e.playerId)) throw new Error('IDENTITY_MAPPING_CONFLICT');
      if (e.reviewedDiscrepancy && !old.length) throw new Error('IDENTITY_DISCREPANCY_REQUIRES_EXISTING_LINK');
      const birthDate = official?.birthDate ?? e.sports.birthDate;
      if (p.player?.birthDate && p.player.birthDate.toISOString().slice(0, 10) !== birthDate) throw new Error('IDENTITY_EXISTING_DOB_CONFLICT');
      if (!p.player?.birthDate) dates++;
      if (official && !old.length) added++;
      if (e.reviewedDiscrepancy) discrepancies++;
      if (dryRun) continue;
      await tx.$queryRaw`SELECT id FROM khl_players WHERE id = ${e.playerId} FOR UPDATE`;
      const current = await tx.khlPlayer.findUniqueOrThrow({ where: { id: e.playerId } });
      if (current.birthDate && current.birthDate.toISOString().slice(0, 10) !== birthDate) throw new Error('IDENTITY_EXISTING_DOB_CONFLICT');
      await tx.khlPlayer.update({ where: { id: e.playerId }, data: { birthDate: new Date(birthDate) } });
      if (official) await bindExternalEntity(tx, { provider: 'KHL', entityType: 'player', providerScope: 'global', externalId: official.id, canonicalId: e.playerId, verifiedAt: new Date(), evidence: `${e.sports.source}; ${official.source}; DOB ${birthDate}; names ${e.name} / ${official.name}${e.reviewedDiscrepancy ? `; reviewed: ${e.reviewedDiscrepancy}` : '; independently equal DOB'}` });
      const key = { provider: 'SPORTS_RU_IDENTITY', scope: e.fantasyId, jobType: 'BIRTHDATE' };
      const data = { completedAt: new Date(), cursor: { auditVersion: 1, sports: e.sports, official, canonicalBirthDate: birthDate, reviewedDiscrepancy: e.reviewedDiscrepancy ?? null } };
      await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
    }
    return { dryRun, checked: pool.length, added, dates, discrepancies, unresolved: bundle.entries.filter(e => !e.official).length };
  }, { timeout: 60000 });
}
