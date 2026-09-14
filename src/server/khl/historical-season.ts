/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#contracts
 * @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import { Prisma, type PrismaClient } from "@prisma/client";
import { fetchHockeyHistory, parseHockeyHistory, hockeyHistorySeasonId, previousHockeySeason } from "@/providers/sports-ru-hockey/history";
import { summarizeHockeyHistory } from "@/khl/history-projection";
import { contentHash } from "@/khl/repositories/revisions";
import { seasonStatFields, type KhlHistoricalStats, type KhlPosition } from "@/khl/contracts";
import { validateProtocolArchive } from "@/khl/protocol-archive";

export async function importHistoricalSeason(db: PrismaClient, input: { playerId: string; providerSeasonId: string; aggregates: KhlHistoricalStats; observedAt: Date; protocolOnly?: boolean }) {
  const { aggregates, observedAt } = input;
  if (!Number.isFinite(observedAt.getTime()) || !/^\d{4}\/\d{4}$/.test(aggregates.seasonKey) || !/^\d{1,12}$/.test(input.providerSeasonId)
    || !/^https:\/\/www\.sports\.ru\/fantasy\/hockey\/player\/info\/\d+\/\d+\.html\?s=\d+$/.test(aggregates.source)
    || !aggregates.source.endsWith(`?s=${input.providerSeasonId}`) || !Number.isInteger(aggregates.games) || aggregates.games < 0 || aggregates.games > 100 || !Number.isInteger(aggregates.dnp) || aggregates.dnp < 0 || aggregates.games + aggregates.dnp > 100
    || seasonStatFields.some(field => { const s = aggregates.totals[field]; return !s || !Number.isInteger(s.knownGames) || s.knownGames < 0 || s.knownGames > aggregates.games || (s.knownGames === 0) !== (s.value === null) || s.value !== null && (!Number.isFinite(s.value) || field !== "plusMinus" && s.value < 0); })
    || [aggregates.officialFp, aggregates.otherPoints].some(s => !s || !Number.isFinite(s.sum) || !Number.isInteger(s.count) || s.count < 0 || s.count > aggregates.games)) throw new Error("HISTORY_AGGREGATES_INVALID");
  if (aggregates.protocolStats) validateProtocolArchive(aggregates.protocolStats);
  return db.$transaction(async tx => {
    const contests = await tx.khlFantasyPlayer.findMany({ where: { playerId: input.playerId }, select: { contestId: true } });
    const contestIds = [...new Set(contests.map(c => c.contestId))].sort();
    // Match the normal history import lock order: contest first, canonical player second.
    if (contestIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM khl_contests WHERE id IN (${Prisma.join(contestIds)}) ORDER BY id FOR UPDATE`);
    await tx.$queryRaw`SELECT id FROM khl_players WHERE id = ${input.playerId} FOR UPDATE`;
    const key = { playerId: input.playerId, seasonKey: aggregates.seasonKey };
    const old = await tx.khlHistoricalSeason.findUnique({ where: { playerId_seasonKey: key } });
    const oldProtocol = (old?.aggregates as unknown as KhlHistoricalStats | undefined)?.protocolStats;
    const protocolStats = aggregates.protocolStats ?? oldProtocol;
    if (oldProtocol && protocolStats && oldProtocol.matchIds.some(id => !protocolStats.matchIds.includes(id))) throw new Error("ARCHIVE_PROTOCOL_COVERAGE_REGRESSION");
    if (protocolStats) {
      const identity = await tx.khlExternalEntityMap.findUnique({ where: { provider_entityType_providerScope_externalId: { provider: "KHL", entityType: "player", providerScope: "global", externalId: protocolStats.officialPlayerId } } });
      if (identity?.playerId !== input.playerId || Date.parse(protocolStats.asOf!) > observedAt.getTime()) throw new Error("ARCHIVE_PROTOCOL_IDENTITY_INVALID");
    }
    if (input.protocolOnly && !old) throw new Error("ARCHIVE_SPORTS_HISTORY_REQUIRED");
    const base = input.protocolOnly ? old!.aggregates as unknown as KhlHistoricalStats : aggregates;
    const value = { ...base, asOf: null, ...(protocolStats ? { protocolStats } : {}) };
    const hash = contentHash({ ...value, ...(protocolStats ? { protocolStats: { ...protocolStats, asOf: null } } : {}) });
    if (old?.contentHash === hash) { await tx.khlHistoricalSeason.update({ where: { id: old.id }, data: { observedAt } }); return false; }
    const data = { providerSeasonId: input.providerSeasonId, source: aggregates.source, contentHash: hash, aggregates: value as unknown as Prisma.InputJsonValue, observedAt, availableAt: observedAt };
    await tx.khlHistoricalSeason.upsert({ where: { playerId_seasonKey: key }, create: { ...key, ...data }, update: data });
    await tx.khlContest.updateMany({ where: { id: { in: contestIds } }, data: { revision: { increment: 1 } } });
    const stale = await tx.khlHistoricalSeason.findMany({ where: { playerId: input.playerId }, orderBy: { seasonKey: "desc" }, skip: 2, select: { id: true } });
    if (stale.length) await tx.khlHistoricalSeason.deleteMany({ where: { id: { in: stale.map(r => r.id) } } });
    return true;
  });
}

export async function refreshHistoricalSeason(db: PrismaClient, contestId: string, fetchSource = fetchHockeyHistory) {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  const seasonKey = previousHockeySeason(contest.season.seasonKey), jobType = `PREVIOUS:${seasonKey}`;
  const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true, playerId: { not: null } }, orderBy: { id: "asc" }, take: 1001 });
  if (pool.length > 1000) throw new Error("HISTORY_POOL_LIMIT");
  const checks = await db.khlProviderCheckpoint.findMany({ where: { provider: "SPORTS_RU_ARCHIVE", jobType, scope: { in: pool.map(p => p.id) } }, take: 1000 });
  const done = new Set(checks.filter(c => Date.now() - c.completedAt.getTime() < ((c.cursor as { error?: string }).error ? 3600000 : 7 * 86400000)).map(c => c.scope));
  const due = pool.filter(p => !done.has(p.id));
  let imported = 0, absent = 0, changed = 0; const errors: { player: string; message: string }[] = [];
  for (const player of due.slice(0, 20)) {
    try {
      const source = await fetchSource(contest.providerContestId, player.providerPlayerId);
      const current = parseHockeyHistory(source.html, { tagId: player.providerTagId ?? "", season: contest.season.seasonKey, position: player.position as KhlPosition });
      const providerSeasonId = hockeyHistorySeasonId(source.html, seasonKey);
      let games = 0;
      if (providerSeasonId) {
        const archive = await fetchSource(contest.providerContestId, player.providerPlayerId, undefined, providerSeasonId);
        if (hockeyHistorySeasonId(archive.html, seasonKey) !== providerSeasonId || !archive.html.includes(`value="${providerSeasonId}" selected`)) throw new Error("HISTORY_ARCHIVE_SEASON_MISMATCH");
        const profile = parseHockeyHistory(archive.html, { tagId: player.providerTagId ?? "", season: seasonKey, position: player.position as KhlPosition, historyOnly: true });
        if (profile.name !== current.name) throw new Error("HISTORY_ARCHIVE_IDENTITY_MISMATCH");
        const aggregates = summarizeHockeyHistory(profile.rows.map(r => ({ ...r, participationStatus: r.toiSeconds === null ? "UNKNOWN" : r.toiSeconds > 0 ? "PLAYED" : "DNP" })), seasonKey, archive.url);
        games = aggregates.games;
        if (await importHistoricalSeason(db, { playerId: player.playerId!, providerSeasonId, aggregates, observedAt: new Date() })) changed++;
        imported++;
      } else absent++;
      const key = { provider: "SPORTS_RU_ARCHIVE", scope: player.id, jobType };
      const data = { completedAt: new Date(), cursor: { seasonKey, providerSeasonId, games } };
      await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "HISTORY_FAILED";
      errors.push({ player: player.providerPlayerId, message });
      const key = { provider: "SPORTS_RU_ARCHIVE", scope: player.id, jobType };
      const data = { completedAt: new Date(), cursor: { seasonKey, error: message } };
      await db.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
      if (/HTTP_(401|403|429)/.test(message)) break;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { seasonKey, pool: pool.length, imported, absent, changed, errors, remaining: Math.max(0, due.length - imported - absent - errors.length) };
}

type ArchiveBundle = { version: 1; seasonKey: string; entries: { providerPlayerId: string; providerTagId: string | null; providerSeasonId: string; observedAt: string; aggregates: KhlHistoricalStats }[] };
/** Transfer already validated public statistics from the local rehearsal to production. */
export async function exportHistoricalBundle(db: PrismaClient, contestId: string): Promise<ArchiveBundle> {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  const seasonKey = previousHockeySeason(contest.season.seasonKey);
  const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true }, include: { player: { include: { historicalSeasons: { where: { seasonKey }, take: 1 } } } }, take: 1001 });
  if (pool.length > 1000) throw new Error("HISTORY_POOL_LIMIT");
  return { version: 1, seasonKey, entries: pool.flatMap(p => {
    const archive = p.player?.historicalSeasons[0];
    return archive ? [{ providerPlayerId: p.providerPlayerId, providerTagId: p.providerTagId, providerSeasonId: archive.providerSeasonId, observedAt: archive.observedAt.toISOString(), aggregates: archive.aggregates as unknown as KhlHistoricalStats }] : [];
  }) };
}
export async function importHistoricalBundle(db: PrismaClient, contestId: string, bundle: ArchiveBundle) {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  if (bundle.version !== 1 || bundle.seasonKey !== previousHockeySeason(contest.season.seasonKey) || !Array.isArray(bundle.entries) || bundle.entries.length > 1000 || new Set(bundle.entries.map(e => e.providerPlayerId)).size !== bundle.entries.length) throw new Error("HISTORY_BUNDLE_INVALID");
  const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, providerPlayerId: { in: bundle.entries.map(e => e.providerPlayerId) } }, take: 1000 });
  // Validate every identity before writing anything; never fall back to a name match.
  for (const entry of bundle.entries) {
    const player = pool.find(p => p.providerPlayerId === entry.providerPlayerId);
    if (!Number.isFinite(Date.parse(entry.observedAt)) || Date.parse(entry.observedAt) > Date.now() || entry.aggregates.seasonKey !== bundle.seasonKey || entry.aggregates.source !== `https://www.sports.ru/fantasy/hockey/player/info/${contest.providerContestId}/${entry.providerPlayerId}.html?s=${entry.providerSeasonId}` || player && player.providerTagId !== entry.providerTagId) throw new Error("HISTORY_BUNDLE_IDENTITY_INVALID");
  }
  let imported = 0, changed = 0;
  for (const entry of bundle.entries) {
    const player = pool.find(p => p.providerPlayerId === entry.providerPlayerId);
    if (!player?.playerId) continue;
    if (await importHistoricalSeason(db, { playerId: player.playerId, providerSeasonId: entry.providerSeasonId, aggregates: entry.aggregates, observedAt: new Date(entry.observedAt) })) changed++;
    imported++;
  }
  return { imported, changed, unmapped: bundle.entries.length - imported, seasonKey: bundle.seasonKey };
}
