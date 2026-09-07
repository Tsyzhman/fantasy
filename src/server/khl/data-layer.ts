/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import { Prisma, type PrismaClient } from "@prisma/client";
import { appendRevision } from "@/khl/repositories/revisions";
import type { MobileMatch } from "@/providers/khl-mobile/calendar";
import { lockValidLease, type KhlLease } from "./lease";

type Tx = Prisma.TransactionClient;
type Entity = "season" | "contest" | "week" | "team" | "player" | "match";
export async function bindExternalEntity(tx: Tx, input: { provider: string; entityType: Entity; providerScope: string; externalId: string; canonicalId: string; evidence: string; verifiedAt: Date }) {
  const { canonicalId, ...key } = input;
  const selector = { provider: key.provider, entityType: key.entityType, providerScope: key.providerScope, externalId: key.externalId };
  const existing = await tx.khlExternalEntityMap.findUnique({ where: { provider_entityType_providerScope_externalId: selector } });
  const field = `${key.entityType}Id` as "seasonId" | "contestId" | "weekId" | "teamId" | "playerId" | "matchId";
  if (existing) {
    if (existing[field] !== canonicalId) throw new Error("EXTERNAL_MAPPING_CONFLICT");
    return existing;
  }
  return tx.khlExternalEntityMap.create({ data: { ...key, [field]: canonicalId } });
}

// Explicit provider IDs are the only join key. Names are display data, never a merge rule.
export async function importCalendar(db: PrismaClient, input: { contestId: string; stageId: string; officialSeasonId: string; matches: MobileMatch[]; batchId: string; observedAt: Date; complete: boolean; from?: Date; to?: Date; lease?: KhlLease }) {
  if (!input.matches.length || input.matches.length > 2000 || new Set(input.matches.map(m => m.eventId)).size !== input.matches.length) throw new Error("CALENDAR_BATCH_INVALID");
  if (input.matches.some(m => m.stageId !== input.stageId || m.officialSeasonId !== input.officialSeasonId || m.home.officialId === m.away.officialId || m.status === "UNKNOWN")) throw new Error("CALENDAR_SCOPE_INVALID");
  return db.$transaction(async tx => {
    await lockValidLease(tx, input.lease);
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${input.contestId} FOR UPDATE`;
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: input.contestId } });
    if (contest.calendarObservedAt && input.observedAt < contest.calendarObservedAt) throw new Error("STALE_BATCH");
    const bind = (entityType: Entity, externalId: string, canonicalId: string, provider = "KHL", providerScope = input.officialSeasonId) => bindExternalEntity(tx, { entityType, externalId, canonicalId, provider, providerScope, evidence: `calendar:${input.batchId}`, verifiedAt: input.observedAt });
    await bind("season", input.officialSeasonId, contest.seasonId, "KHL", "global");
    await bind("season", input.stageId, contest.seasonId, "KHL_MOBILE", "global");
    const teamIds = new Map<string, string>();
    for (const team of input.matches.flatMap(m => [m.home, m.away])) {
      if (teamIds.has(team.officialId)) continue;
      const mapping = await tx.khlExternalEntityMap.findUnique({ where: { provider_entityType_providerScope_externalId: { provider: "KHL", entityType: "team", providerScope: "global", externalId: team.officialId } } });
      const id = mapping?.teamId ?? (await tx.khlTeam.create({ data: { name: team.name } })).id;
      await bind("team", team.officialId, id, "KHL", "global");
      await bind("team", team.mobileId, id, "KHL_MOBILE", "global");
      teamIds.set(team.officialId, id);
    }
    let changed = 0;
    for (const row of input.matches) {
      const revision = await appendRevision(tx, { streamId: `KHL:match:${input.officialSeasonId}:${row.officialMatchId}`, transitionKey: input.batchId, value: { ...row }, observedAt: input.observedAt });
      if (revision.replayed) continue;
      const mapping = await tx.khlExternalEntityMap.findUnique({ where: { provider_entityType_providerScope_externalId: { provider: "KHL", entityType: "match", providerScope: input.officialSeasonId, externalId: row.officialMatchId } } });
      const data = { seasonId: contest.seasonId, homeId: teamIds.get(row.home.officialId)!, awayId: teamIds.get(row.away.officialId)!, startsAt: new Date(row.startsAt), status: row.status, decidedBy: row.decidedBy, finalScore: row.score === null ? Prisma.DbNull : row.score, revision: revision.sequence };
      const match = mapping?.matchId ? await tx.khlMatch.update({ where: { id: mapping.matchId }, data }) : await tx.khlMatch.create({ data });
      await bind("match", row.officialMatchId, match.id);
      await bind("match", row.eventId, match.id, "KHL_MOBILE", input.stageId);
      changed += Number(revision.changed);
    }
    const bounded = input.from && input.to && input.from < input.to && input.matches.every(m => new Date(m.startsAt) >= input.from! && new Date(m.startsAt) < input.to!);
    await tx.khlContest.update({ where: { id: contest.id }, data: { calendarComplete: !!bounded && input.complete, calendarFrom: bounded ? input.from : null, calendarTo: bounded ? input.to : null, calendarObservedAt: input.observedAt, revision: { increment: changed ? 1 : 0 } } });
    return { changed, matches: input.matches.length };
  }, { timeout: 60000 });
}

export async function assignFantasyWeek(db: PrismaClient, input: { contestId: string; weekId: string; matchIds: string[]; source: string; observedAt: Date; transitionKey: string }) {
  if (!input.source || input.matchIds.length > 200 || new Set(input.matchIds).size !== input.matchIds.length) throw new Error("WEEK_ASSIGNMENT_INVALID");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${input.contestId} FOR UPDATE`;
    const week = await tx.khlFantasyWeek.findFirstOrThrow({ where: { id: input.weekId, contestId: input.contestId }, include: { contest: true } });
    const matches = await tx.khlMatch.count({ where: { id: { in: input.matchIds }, seasonId: week.contest.seasonId } });
    if (matches !== input.matchIds.length) throw new Error("WEEK_MATCH_SCOPE_INVALID");
    const revision = await appendRevision(tx, { streamId: `week-assignments:${week.id}`, transitionKey: input.transitionKey, value: { matchIds: [...input.matchIds].sort(), source: input.source }, observedAt: input.observedAt });
    if (revision.replayed || !revision.changed) return revision;
    const moved = await tx.khlMatchFantasyWeek.findMany({ where: { contestId: input.contestId, matchId: { in: input.matchIds }, weekId: { not: week.id } } });
    if (moved.length) await tx.khlFantasyWeek.updateMany({ where: { id: { in: moved.map(m => m.weekId) } }, data: { revision: { increment: 1 } } });
    await tx.khlMatchFantasyWeek.deleteMany({ where: { contestId: input.contestId, weekId: week.id } });
    for (const matchId of input.matchIds) await tx.khlMatchFantasyWeek.upsert({ where: { contestId_matchId: { contestId: input.contestId, matchId } }, create: { contestId: input.contestId, matchId, weekId: week.id }, update: { weekId: week.id } });
    await tx.khlFantasyWeek.update({ where: { id: week.id }, data: { revision: { increment: 1 } } });
    await tx.khlContest.update({ where: { id: input.contestId }, data: { revision: { increment: 1 } } });
    return revision;
  });
}

export async function recordOfficialScore(db: PrismaClient, input: { contestId: string; fantasyPlayerId: string; matchId: string; points: number | null; source: string; observedAt: Date; availableAt: Date; transitionKey: string }) {
  if (input.points !== null && !Number.isFinite(input.points) || input.availableAt > input.observedAt) throw new Error("SCORE_INVALID");
  return db.$transaction(async tx => {
    const player = await tx.khlFantasyPlayer.findFirstOrThrow({ where: { id: input.fantasyPlayerId, contestId: input.contestId }, include: { contest: true } });
    await tx.khlMatch.findFirstOrThrow({ where: { id: input.matchId, seasonId: player.contest.seasonId } });
    const revision = await appendRevision(tx, { streamId: `official-fp:${input.contestId}:${input.fantasyPlayerId}:${input.matchId}`, transitionKey: input.transitionKey, value: { points: input.points, source: input.source }, observedAt: input.observedAt, availableAt: input.availableAt });
    if (revision.replayed) return revision;
    const { transitionKey: _key, ...data } = input;
    await tx.khlOfficialFantasyScore.upsert({ where: { fantasyPlayerId_matchId: { fantasyPlayerId: input.fantasyPlayerId, matchId: input.matchId } }, create: { ...data, revision: revision.sequence }, update: { ...data, revision: revision.sequence } });
    if (revision.changed) await tx.khlContest.update({ where: { id: input.contestId }, data: { revision: { increment: 1 } } });
    return revision;
  });
}
