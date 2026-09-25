import type { PrismaClient } from "@prisma/client";
import { SPORTS_TRENDS_MAX_ENTRIES } from "@/providers/sports-ru-trends/types";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 */
export interface SportsTrendsViewEntry {
  rank: number;
  playerId: string | null;
  providerPlayerId: string | null;
  name: string;
  team: string | null;
  position: string | null;
  value: number | null;
  valueText: string | null;
}

export interface SportsTrendsViewSection {
  category: string;
  metricKind: string;
  unit: string;
  populationScope: string;
  sectionKey: string;
  position: string | null;
  status: string;
  statusReason: string | null;
  observedAt: string;
  sourcePublishedAt: string | null;
  sourceUrl: string | null;
  availableCount: number;
  entries: SportsTrendsViewEntry[];
}

export interface SportsTrendsView {
  contestId: string;
  contestName: string;
  season: string;
  providerRoundId: string | null;
  roundOrdinal: number | null;
  roundLabel: string | null;
  status: "READY" | "NOT_PUBLISHED" | "FAILED";
  statusReason: string | null;
  sections: SportsTrendsViewSection[];
  updatedAt: string | null;
  disclaimer: string;
}

export interface SportsTrendsViewInput {
  contestId: string;
  providerRoundId?: string | null;
  roundKey?: string | null;
}

export function parseFantasyProviderRoundKey(roundKey: string): { ordinal: number | null; providerRoundId: string | null } {
  const parts = roundKey.split(":");
  if (parts.length < 4 || parts[0] !== "sports-ru" || parts[1] !== "tour") return { ordinal: null, providerRoundId: null };
  const ordinal = Number(parts[2]);
  return {
    ordinal: Number.isFinite(ordinal) && ordinal > 0 ? ordinal : null,
    providerRoundId: decodeURIComponent(parts.slice(3).join(":")) || null
  };
}

export async function loadSportsTrendsView(prisma: PrismaClient, input: SportsTrendsViewInput): Promise<SportsTrendsView | null> {
  const contest = await prisma.fantasyContest.findUnique({
    where: { id: input.contestId },
    select: { id: true, name: true, season: true }
  });
  if (!contest) return null;

  const key = input.providerRoundId ? null : input.roundKey ? parseFantasyProviderRoundKey(input.roundKey) : null;
  const providerRoundId = input.providerRoundId ?? key?.providerRoundId ?? null;
  const roundSelect = { providerRoundId: true, ordinal: true, name: true, deadlineAt: true } as const;
  const round = providerRoundId
    ? await prisma.fantasyProviderRound.findFirst({ where: { contestId: contest.id, providerRoundId }, select: roundSelect })
    : key?.ordinal
      ? await prisma.fantasyProviderRound.findFirst({ where: { contestId: contest.id, ordinal: key.ordinal }, select: roundSelect })
      : await prisma.fantasyProviderRound.findFirst({
          where: { contestId: contest.id, deadlineAt: { gte: new Date() } },
          orderBy: { deadlineAt: "asc" },
          select: roundSelect
        });

  const snapshots = await prisma.sportsTrendSnapshot.findMany({
    where: {
      contestId: contest.id,
      season: contest.season,
      status: "READY",
      ...(round
        ? {
            OR: [
              { providerRoundId: round.providerRoundId },
              { providerRoundId: null, sourceId: null }
            ]
          }
        : { providerRoundId: null, sourceId: null })
    },
    orderBy: { observedAt: "desc" },
    take: 40,
    include: {
      source: { select: { canonicalUrl: true } },
      entries: { orderBy: { sourceRank: "asc" }, take: SPORTS_TRENDS_MAX_ENTRIES }
    }
  });

  const ranked = [...snapshots].sort((left, right) => {
    const leftPriority = (left.providerRoundId ? 2 : 0) + (left.sourceId ? 1 : 0);
    const rightPriority = (right.providerRoundId ? 2 : 0) + (right.sourceId ? 1 : 0);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return right.observedAt.getTime() - left.observedAt.getTime();
  });

  const sections: SportsTrendsViewSection[] = [];
  const seenKeys = new Set<string>();
  for (const snapshot of ranked) {
    const key = [snapshot.category, snapshot.metricKind, snapshot.populationScope, snapshot.sectionKey].join("|");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    sections.push({
      category: snapshot.category,
      metricKind: snapshot.metricKind,
      unit: snapshot.unit,
      populationScope: snapshot.populationScope,
      sectionKey: snapshot.sectionKey,
      position: snapshot.sectionKey || snapshot.entries[0]?.sourcePosition || null,
      status: snapshot.status,
      statusReason: snapshot.statusReason,
      observedAt: snapshot.observedAt.toISOString(),
      sourcePublishedAt: snapshot.sourcePublishedAt?.toISOString() ?? null,
      sourceUrl: snapshot.source?.canonicalUrl ?? null,
      availableCount: snapshot.sourceEntryCount ?? snapshot.entries.length,
      entries: snapshot.entries.map((entry) => ({
        rank: entry.sourceRank,
        playerId: entry.playerId?.toString() ?? null,
        providerPlayerId: entry.providerPlayerId,
        name: entry.sourceName,
        team: entry.sourceTeam,
        position: entry.sourcePosition ?? (snapshot.sectionKey || null),
        value: entry.value,
        valueText: entry.valueText
      }))
    });
  }

  let status: SportsTrendsView["status"] = sections.length > 0 ? "READY" : "NOT_PUBLISHED";
  let statusReason: string | null = null;
  if (sections.length === 0) {
    const failed = await prisma.sportsTrendSource.findFirst({
      where: { parseStatus: "FAILED", updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { updatedAt: "desc" },
      select: { canonicalUrl: true, parseError: true }
    });
    if (failed) {
      status = "FAILED";
      statusReason = `Парсер Sports не разобрал ${failed.canonicalUrl}: ${failed.parseError ?? "unknown error"}`;
    }
  }

  const updatedAt = sections.reduce<string | null>((latest, section) => (latest == null || section.observedAt > latest ? section.observedAt : latest), null);
  return {
    contestId: contest.id,
    contestName: contest.name,
    season: contest.season,
    providerRoundId: round?.providerRoundId ?? null,
    roundOrdinal: round?.ordinal ?? null,
    roundLabel: round ? (round.name?.trim() || `Тур ${round.ordinal}`) : null,
    status,
    statusReason,
    sections,
    updatedAt,
    disclaimer:
      (input.providerRoundId || input.roundKey) && !round
        ? "Указанный тур не найден; показаны только снимки без привязки к туру."
        : "Популярность Sports и доля выбора не равны подтверждённым покупкам."
  };
}
