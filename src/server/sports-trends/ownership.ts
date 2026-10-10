import { Prisma, type PrismaClient } from "@prisma/client";
import { SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS, SPORTS_TRENDS_OWNERSHIP_HISTORY_DAYS } from "./config";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 */
const OWNERSHIP_STATUS_REASON = "Sports.ru selectedByPercent: доля выбора менеджеров, не подтверждённые покупки.";
const DELTA_STATUS_REASON = "Изменение доли выбора в процентных пунктах, не трансферный поток.";
const TOP_ENTRIES = 15;
const DELTA_MINIMUM_PREVIOUS_AGE_MS = 6 * 60 * 60 * 1000;

export interface OwnershipCaptureResult {
  contests: number;
  snapshots: number;
  deltas: number;
  skipped: number;
}

interface OwnershipEntry {
  providerPlayerId: string | null;
  playerId: bigint | null;
  playerName: string;
  teamName: string | null;
  positionLabel: string | null;
  value: number;
}

async function loadCurrentOwnership(prisma: PrismaClient, contestId: string): Promise<OwnershipEntry[]> {
  const rows = await prisma.fantasyPlayerPrice.findMany({
    where: { contestId, selectedByPercent: { not: null } },
    orderBy: [{ selectedByPercent: "desc" }, { providerPlayerId: "asc" }],
    select: { providerPlayerId: true, playerId: true, playerName: true, teamName: true, positionLabel: true, selectedByPercent: true },
    take: 50
  });
  const seen = new Set<string>();
  const entries: OwnershipEntry[] = [];
  for (const row of rows) {
    const value = row.selectedByPercent;
    if (value == null || !Number.isFinite(value) || value < 0 || value > 100) continue;
    const key = row.providerPlayerId ?? `player:${row.playerId ?? row.playerName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      providerPlayerId: row.providerPlayerId,
      playerId: row.playerId,
      playerName: row.playerName,
      teamName: row.teamName,
      positionLabel: row.positionLabel,
      value
    });
    if (entries.length >= TOP_ENTRIES) break;
  }
  return entries;
}

/** @spec spec://modules/machete/FEAT-006-sports-popularity#data */
export async function createOwnershipSnapshot(
  prisma: PrismaClient,
  contestId: string,
  season: string,
  observedAt: Date,
  entries: Array<OwnershipEntry & { value: number }>,
  options: { category: "OWNERSHIP" | "OWNERSHIP_DELTA_PP"; metricKind: string; unit: string; statusReason: string }
) {
  return prisma.$transaction(async (tx) => {
    const key = `sports-ownership:${contestId}:${options.category}:${observedAt.toISOString()}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const existing = await tx.sportsTrendSnapshot.findFirst({
      where: { contestId, category: options.category, populationScope: "ALL_MANAGERS", providerRoundId: null, sourceId: null, observedAt },
      select: { id: true }
    });
    if (existing) return false;
    const snapshot = await tx.sportsTrendSnapshot.create({
      data: {
        contestId,
        season,
        providerRoundId: null,
        roundOrdinal: null,
        category: options.category,
        metricKind: options.metricKind,
        unit: options.unit,
        populationScope: "ALL_MANAGERS",
        sourceId: null,
        revision: 1,
        status: "READY",
        statusReason: options.statusReason,
        sourceEntryCount: entries.length,
        observedAt,
        sourcePublishedAt: null
      }
    });
    await tx.sportsTrendEntry.createMany({
      data: entries.map((entry, index) => ({
        snapshotId: snapshot.id,
        sourceRank: index + 1,
        providerPlayerId: entry.providerPlayerId,
        playerId: entry.playerId,
        sourceName: entry.playerName,
        sourceTeam: entry.teamName,
        sourcePosition: entry.positionLabel,
        value: entry.value,
        valueText: `${Math.round(entry.value * 100) / 100}%`
      }))
    });
    return true;
  }, { maxWait: 30_000, timeout: 30_000 });
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#sources
 * @spec spec://modules/machete/FEAT-006-sports-popularity#data
 */
export async function captureSportsOwnershipSnapshots(
  prisma: PrismaClient,
  options: { now?: () => Date; contestIds?: string[]; maxContests?: number } = {}
): Promise<OwnershipCaptureResult> {
  const now = options.now?.() ?? new Date();
  const bucket = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
  const contests = await prisma.fantasyContest.findMany({
    where: {
      scheduleSyncedAt: { not: null },
      ...(options.contestIds && options.contestIds.length > 0
        ? { id: { in: options.contestIds } }
        : { providerRounds: { some: { deadlineAt: { gt: now } } } })
    },
    select: { id: true, season: true },
    take: options.maxContests ?? SPORTS_TRENDS_MAX_CANDIDATE_CONTESTS
  });

  const result: OwnershipCaptureResult = { contests: 0, snapshots: 0, deltas: 0, skipped: 0 };
  for (const contest of contests) {
    result.contests += 1;
    const existing = await prisma.sportsTrendSnapshot.findFirst({
      where: { contestId: contest.id, category: "OWNERSHIP", providerRoundId: null, observedAt: bucket },
      select: { id: true }
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }
    const entries = await loadCurrentOwnership(prisma, contest.id);
    if (entries.length === 0) {
      result.skipped += 1;
      continue;
    }
    const created = await createOwnershipSnapshot(prisma, contest.id, contest.season, bucket, entries, {
      category: "OWNERSHIP",
      metricKind: "ownership_percent",
      unit: "percent",
      statusReason: OWNERSHIP_STATUS_REASON
    });
    if (created) result.snapshots += 1;
    else result.skipped += 1;

    const previous = await prisma.sportsTrendSnapshot.findFirst({
      where: {
        contestId: contest.id,
        category: "OWNERSHIP",
        providerRoundId: null,
        observedAt: { lte: new Date(now.getTime() - DELTA_MINIMUM_PREVIOUS_AGE_MS) }
      },
      orderBy: { observedAt: "desc" },
      select: { id: true }
    });
    if (!previous) continue;
    const previousEntries = await prisma.sportsTrendEntry.findMany({
      where: { snapshotId: previous.id },
      select: { providerPlayerId: true, value: true }
    });
    const previousByKey = new Map(previousEntries.filter((entry) => entry.providerPlayerId).map((entry) => [entry.providerPlayerId!, entry.value]));
    const deltas = entries
      .map((entry) => {
        const before = entry.providerPlayerId ? previousByKey.get(entry.providerPlayerId) : undefined;
        if (before == null) return null;
        const delta = Math.round((entry.value - before) * 100) / 100;
        return { ...entry, value: delta };
      })
      .filter((entry): entry is OwnershipEntry => entry != null && entry.value !== 0)
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
      .slice(0, TOP_ENTRIES);
    if (deltas.length === 0) continue;
    const deltaCreated = await createOwnershipSnapshot(prisma, contest.id, contest.season, bucket, deltas, {
      category: "OWNERSHIP_DELTA_PP",
      metricKind: "ownership_delta_pp",
      unit: "pp",
      statusReason: DELTA_STATUS_REASON
    });
    if (deltaCreated) result.deltas += 1;
  }
  return result;
}

export async function pruneSportsOwnershipHistory(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SPORTS_TRENDS_OWNERSHIP_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.sportsTrendSnapshot.findMany({
    where: {
      sourceId: null,
      category: { in: ["OWNERSHIP", "OWNERSHIP_DELTA_PP"] },
      observedAt: { lt: cutoff }
    },
    select: { id: true },
    take: 5000
  });
  if (stale.length === 0) return 0;
  const deleted = await prisma.sportsTrendSnapshot.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  return deleted.count;
}
