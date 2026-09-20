/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import type { PrismaClient } from '@prisma/client';
import { gunzipSync } from 'node:zlib';
import { fetchMobileRange } from '@/providers/khl-mobile/transport';
import type { MobileMatch } from '@/providers/khl-mobile/calendar';
import { fetchKhlProtocol } from '@/providers/khl-mobile/protocol-transport';
import { parseKhlProtocol, type KhlProtocolRow } from '@/providers/khl-mobile/protocol';
import { previousHockeySeason } from '@/providers/sports-ru-hockey/history';
import { summarizeProtocolArchive } from '@/khl/protocol-archive';
import { contentHash } from '@/khl/repositories/revisions';
import { storeKhlRaw } from './retention';
import { importProtocolArchive } from './protocol-archive-import';
import { hockeyTeamLinks } from '@/providers/sports-ru-hockey/teams';

const leagueClubs = new Set<string>(hockeyTeamLinks.map(t => t[1]));
export function archiveCoverageHash(pool: { id: string; playerId: string | null }[], identities: { externalId: string; playerId: string | null }[], seasonKey: string, stageId: string) {
  return contentHash({ version: 3, pool: [...pool].sort((a, b) => a.id.localeCompare(b.id)), identities: [...identities].sort((a, b) => a.externalId.localeCompare(b.externalId)), seasonKey, stageId });
}
export function isArchiveLeagueGame(match: MobileMatch) {
  // The same mobile stage also contains the 2026 All-Star mini-tournament.
  return leagueClubs.has(match.home.officialId) && leagueClubs.has(match.away.officialId);
}

export async function refreshOfficialArchive(db: PrismaClient, contestId: string, cycle: { calendar?: MobileMatch[] } = {}) {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  const seasonKey = previousHockeySeason(contest.season.seasonKey);
  // This pair was verified from the public KHL season calendar, never extrapolated.
  const stageId = seasonKey === '2025/2026' ? '370' : process.env.KHL_PREVIOUS_MOBILE_STAGE_ID;
  const officialSeasonId = seasonKey === '2025/2026' ? '1369' : process.env.KHL_PREVIOUS_OFFICIAL_SEASON_ID;
  if (!stageId || !officialSeasonId) throw new Error('ARCHIVE_SEASON_MAPPING_UNAVAILABLE');
  const provider = 'KHL_PROTOCOL_ARCHIVE', key = { provider, scope: contestId, jobType: seasonKey };
  const checkpoint = await db.khlProviderCheckpoint.findUnique({ where: { provider_scope_jobType: key } });
  const old = checkpoint?.cursor as { hash?: string; retryAfter?: string; error?: string; transportVersion?: number } | null;
  if (old?.transportVersion === 2 && old.retryAfter && Date.parse(old.retryAfter) > Date.now()) throw new Error(old.error ?? 'ARCHIVE_SOURCE_BACKOFF');
  const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true }, select: { id: true, playerId: true }, orderBy: { id: 'asc' }, take: 1001 });
  if (pool.length > 1000) throw new Error('ARCHIVE_POOL_LIMIT');
  const identities = await db.khlExternalEntityMap.findMany({ where: { provider: 'KHL', entityType: 'player', providerScope: 'global', playerId: { in: pool.flatMap(p => p.playerId ? [p.playerId] : []) } }, select: { externalId: true, playerId: true }, take: 1001 });
  if (identities.length > 1000) throw new Error('ARCHIVE_IDENTITY_LIMIT');
  const hash = archiveCoverageHash(pool, identities, seasonKey, stageId);
  if (old?.hash === hash && checkpoint && Date.now() - checkpoint.completedAt.getTime() < 7 * 86400000) return { remaining: 0, cached: true };
  try {
    const year = Number(seasonKey.slice(0, 4)), calendar = cycle.calendar ?? [];
    for (let time = Date.UTC(year, 8, 1); !cycle.calendar && time < Date.UTC(year + 1, 3, 1); time += 35 * 86400000) {
      const batch = await fetchMobileRange({ stageId, from: new Date(time), to: new Date(Math.min(time + 35 * 86400000, Date.UTC(year + 1, 3, 1))) });
      calendar.push(...batch.matches.filter(m => m.status === 'FINAL' && isArchiveLeagueGame(m)));
    }
    if (!calendar.length || calendar.length > 1000 || calendar.some(m => m.officialSeasonId !== officialSeasonId) || new Set(calendar.map(m => m.officialMatchId)).size !== calendar.length) throw new Error('ARCHIVE_CALENDAR_INVALID');
    cycle.calendar = calendar;
    const scopePrefix = `${contestId}:${seasonKey}:`;
    const raws = await db.khlRawPayload.findMany({ where: { provider, scope: { startsWith: scopePrefix }, expiresAt: { gt: new Date() } }, select: { scope: true }, take: 1001 });
    const seen = new Set(raws.map(r => r.scope));
    const due = calendar.filter(m => !seen.has(scopePrefix + m.officialMatchId));
    // All current linked histories can already contain a complete archived season.
    const archives = await db.khlHistoricalSeason.findMany({ where: { playerId: { in: pool.flatMap(p => p.playerId ? [p.playerId] : []) }, seasonKey }, take: 1000 });
    const covered = new Set(archives.flatMap(a => ((a.aggregates as unknown as { protocolStats?: { matchIds: string[] } }).protocolStats?.matchIds ?? [])));
    if (!old?.hash && calendar.every(m => covered.has(m.officialMatchId))) {
      const data = { cursor: { hash, matches: calendar.length, existingArchive: true }, completedAt: new Date() };
      await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
      return { remaining: 0, cached: true };
    }
    for (const m of due.slice(0, 10)) {
      const { html } = await fetchKhlProtocol(officialSeasonId, m.officialMatchId, AbortSignal.timeout(55000));
      parseKhlProtocol(html, m.officialMatchId, officialSeasonId);
      await storeKhlRaw(db, { provider, scope: scopePrefix + m.officialMatchId, parserVersion: 'khl-protocol-v2', raw: Buffer.from(html), now: new Date() });
    }
    if (due.length > 10) return { remaining: due.length - 10, imported: Math.min(10, due.length) };
    const players = new Map<string, { matchId: string; row: KhlProtocolRow }[]>();
    for (const m of calendar) {
      const raw = await db.khlRawPayload.findFirstOrThrow({ where: { provider, scope: scopePrefix + m.officialMatchId }, orderBy: { expiresAt: 'desc' } });
      const parsed = parseKhlProtocol(gunzipSync(raw.compressed, { maxOutputLength: 5 * 1024 * 1024 }).toString('utf8'), m.officialMatchId, officialSeasonId);
      for (const row of parsed.rows) { const list = players.get(row.officialPlayerId) ?? []; list.push({ matchId: m.officialMatchId, row }); players.set(row.officialPlayerId, list); }
    }
    const observedAt = new Date().toISOString();
    const entries = [...players].map(([officialPlayerId, rows]) => ({ ...summarizeProtocolArchive({ officialPlayerId, officialSeasonId, rows, observedAt }), name: rows[0].row.name, position: rows[0].row.position }));
    const result = await importProtocolArchive(db, contestId, { version: 1, seasonKey, officialSeasonId, observedAt, matches: calendar.map(m => ({ id: m.officialMatchId, startsAt: m.startsAt })), entries });
    await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, cursor: { hash, ...result }, completedAt: new Date() }, update: { cursor: { hash, ...result }, completedAt: new Date() } });
    return { remaining: 0, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ARCHIVE_FAILED';
    if (old?.retryAfter && Date.parse(old.retryAfter) > Date.now() && message === old.error) throw error;
    const data = { cursor: { transportVersion: 2, error: message, retryAfter: new Date(Date.now() + (/HTTP_40[13]|HTTP_429/.test(message) ? 86400000 : 50 * 60000)).toISOString() }, completedAt: new Date() };
    await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
    throw error;
  }
}
