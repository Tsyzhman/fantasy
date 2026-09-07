/** Normalized adapters accept explicit canonical IDs after provider mapping. */
import { Prisma, type PrismaClient } from "@prisma/client";
import { appendRevision } from "@/khl/repositories/revisions";

const statFields = ["toiSeconds", "ppToiSeconds", "pkToiSeconds", "saves", "goalsAgainst", "goals", "assists", "pimMinutes", "shotsOnGoal", "shifts", "blockedShots"] as const;
export type ProtocolInput = { playerId: string; matchId: string; clubAtMatchId: string; participationStatus: "PLAYED" | "DNP" | "UNKNOWN"; plusMinus: number | null; started: boolean | null; fullGame: boolean | null } & Record<typeof statFields[number], number | null>;
export async function importProtocols(db: PrismaClient, input: { seasonId: string; source: string; batchId: string; observedAt: Date; availableAt: Date; rows: ProtocolInput[] }) {
  if (!input.rows.length || input.rows.length > 2000 || input.availableAt > input.observedAt || new Set(input.rows.map(r => `${r.matchId}:${r.playerId}`)).size !== input.rows.length) throw new Error("PROTOCOL_BATCH_INVALID");
  for (const row of input.rows) {
    if (statFields.some(f => row[f] !== null && (!Number.isSafeInteger(row[f]) || row[f]! < 0)) || row.plusMinus !== null && !Number.isSafeInteger(row.plusMinus) || row.toiSeconds !== null && ((row.ppToiSeconds ?? 0) + (row.pkToiSeconds ?? 0) > row.toiSeconds)) throw new Error("PROTOCOL_VALUES_INVALID");
    if (row.participationStatus === "DNP" && statFields.some(f => row[f] !== null && row[f] !== 0)) throw new Error("DNP_STATS_CONFLICT");
  }
  return db.$transaction(async tx => {
    let changed = 0;
    for (const row of input.rows) {
      const match = await tx.khlMatch.findFirstOrThrow({ where: { id: row.matchId, seasonId: input.seasonId } });
      if (![match.homeId, match.awayId].includes(row.clubAtMatchId)) throw new Error("PROTOCOL_TEAM_SCOPE_INVALID");
      const revision = await appendRevision(tx, { streamId: `stats:${row.matchId}:${row.playerId}`, transitionKey: input.batchId, value: { ...row, source: input.source }, observedAt: input.observedAt, availableAt: input.availableAt });
      if (revision.replayed) continue;
      const data = { ...row, observedAt: input.observedAt, availableAt: input.availableAt, sources: Object.fromEntries([...statFields, "plusMinus", "started", "fullGame", "participationStatus"].map(f => [f, input.source])), revision: revision.sequence };
      await tx.khlPlayerMatchStat.upsert({ where: { matchId_playerId: { matchId: row.matchId, playerId: row.playerId } }, create: data, update: data });
      changed += Number(revision.changed);
    }
    if (changed) await tx.khlContest.updateMany({ where: { seasonId: input.seasonId }, data: { revision: { increment: 1 } } });
    return { changed };
  }, { timeout: 60000 });
}

export async function importXg(db: PrismaClient, input: { seasonId: string; source: string; definitionVersion: string; batchId: string; observedAt: Date; availableAt: Date; rows: { matchId: string; playerId: string | null; teamId: string | null; metric: string; strength: string; value: number | null }[] }) {
  if (!input.rows.length || input.rows.length > 2000 || !input.definitionVersion || input.availableAt > input.observedAt) throw new Error("XG_BATCH_INVALID");
  return db.$transaction(async tx => {
    const keys = new Set<string>();
    let changed = 0;
    for (const row of input.rows) {
      if (Number(!!row.playerId) + Number(!!row.teamId) !== 1 || row.value !== null && (!Number.isFinite(row.value) || row.value < 0) || !["ixG", "xGF", "xGA"].includes(row.metric) || !["ALL", "EV", "PP", "PK"].includes(row.strength)) throw new Error("XG_ROW_INVALID");
      const key = `xg:${input.source}:${input.definitionVersion}:${row.matchId}:${row.playerId ?? row.teamId}:${row.metric}:${row.strength}`;
      if (keys.has(key)) throw new Error("XG_DUPLICATE"); keys.add(key);
      const match = await tx.khlMatch.findFirstOrThrow({ where: { id: row.matchId, seasonId: input.seasonId } });
      if (row.teamId && ![match.homeId, match.awayId].includes(row.teamId)) throw new Error("XG_TEAM_SCOPE_INVALID");
      const revision = await appendRevision(tx, { streamId: key, transitionKey: input.batchId, value: row, observedAt: input.observedAt, availableAt: input.availableAt });
      if (!revision.changed) continue;
      await tx.khlXgObservation.create({ data: { ...row, source: input.source, definitionVersion: input.definitionVersion, revision: revision.sequence, observedAt: input.observedAt, availableAt: input.availableAt } });
      changed++;
    }
    if (changed) await tx.khlContest.updateMany({ where: { seasonId: input.seasonId }, data: { revision: { increment: 1 } } });
    return { changed };
  }, { timeout: 60000 });
}

export async function recordAvailability(db: PrismaClient, input: { playerId: string; field: "injury" | "ppRole" | "pkRole" | "line" | "starter"; value: Prisma.InputJsonValue; quality: "FACT" | "ESTIMATE" | "UNKNOWN"; source: string; observedAt: Date; expiresAt: Date; transitionKey: string }) {
  if (input.expiresAt <= input.observedAt) throw new Error("AVAILABILITY_EXPIRY_INVALID");
  return db.$transaction(async tx => {
    const revision = await appendRevision(tx, { streamId: `availability:${input.playerId}:${input.field}:${input.source}`, transitionKey: input.transitionKey, value: { value: input.value, quality: input.quality, expiresAt: input.expiresAt.toISOString() }, observedAt: input.observedAt });
    if (!revision.changed) return revision;
    const { transitionKey: _key, ...data } = input;
    await tx.khlAvailabilityObservation.create({ data: { ...data, revision: revision.sequence } });
    await tx.khlContest.updateMany({ where: { players: { some: { playerId: input.playerId } } }, data: { revision: { increment: 1 } } });
    return revision;
  });
}

export async function setMembership(db: PrismaClient, input: { seasonId: string; playerId: string; teamId: string; startsAt: Date; source: string; observedAt: Date }) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM khl_players WHERE id = ${input.playerId} FOR UPDATE`;
    const existing = await tx.khlRosterMembership.findUnique({ where: { seasonId_playerId_startsAt: { seasonId: input.seasonId, playerId: input.playerId, startsAt: input.startsAt } } });
    if (existing) { if (existing.teamId !== input.teamId) throw new Error("MEMBERSHIP_CONFLICT"); return existing; }
    const next = await tx.khlRosterMembership.findFirst({ where: { seasonId: input.seasonId, playerId: input.playerId, startsAt: { gt: input.startsAt } }, orderBy: { startsAt: "asc" } });
    await tx.khlRosterMembership.updateMany({ where: { seasonId: input.seasonId, playerId: input.playerId, startsAt: { lt: input.startsAt }, OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }] }, data: { endsAt: input.startsAt } });
    const membership = await tx.khlRosterMembership.create({ data: { ...input, endsAt: next?.startsAt ?? null } });
    await tx.khlContest.updateMany({ where: { seasonId: input.seasonId }, data: { revision: { increment: 1 } } });
    return membership;
  });
}
