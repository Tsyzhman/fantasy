import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  loadFantasyPlayerPoolSnapshotPlayers,
  parseFantasyPlayerPoolSnapshotMetadata,
  userCanUseCurrentXiFantasyPlayerPoolSnapshot
} from "@/machete/fantasy-player-pool-snapshots";
import { defaultFantasyHistorySettings, fantasyHistorySettingsKey } from "@/machete/squad-history-settings";
import { fantasyProviderRoundKey } from "@/machete/squad_planner";
import { classifyDeadlinePlayers, type DeadlinePlayerSignalInput } from "./classifier";
import { DEADLINE_DELIVERY_HOUR, moscowDateKey, moscowDateTimeToUtc } from "./config";
import { renderDeadlineReport, type DeadlineFixtureLine } from "./renderer";
import { deadlineTag } from "./tags";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#squad-source
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals
 */
export interface BuildReportsResult {
  built: number;
  skipped: number;
  degraded: number;
  outboxParts: number;
}

interface SquadBasePlayer {
  playerId: string;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  sourceName: string | null;
}

interface ProbableLineup {
  source: string | null;
  sourceKickoff: number | null;
  observedAt: number | null;
}

const XI_STALE_MS = 2 * 60 * 60 * 1000;
const FIXTURE_MATCH_TOLERANCE_MS = 6 * 60 * 60 * 1000;

function numericPlayerId(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseProbableLineup(metadata: unknown): ProbableLineup | null {
  if (!metadata || typeof metadata !== "object") return null;
  const lineup = (metadata as { probableLineup?: unknown }).probableLineup;
  if (!lineup || typeof lineup !== "object") return null;
  const record = lineup as { source?: unknown; sourceKickoff?: unknown; fetchedAt?: unknown; appliedAt?: unknown };
  if (typeof record.source !== "string" || record.source !== "SORAREINSIDE") return null;
  const kickoff = typeof record.sourceKickoff === "string" ? Date.parse(record.sourceKickoff) : Number.NaN;
  const applied = typeof record.appliedAt === "string" ? Date.parse(record.appliedAt) : Number.NaN;
  const fetched = typeof record.fetchedAt === "string" ? Date.parse(record.fetchedAt) : Number.NaN;
  const observedAt = Number.isFinite(applied) ? applied : Number.isFinite(fetched) ? fetched : null;
  return {
    source: record.source,
    sourceKickoff: Number.isFinite(kickoff) ? kickoff : null,
    observedAt
  };
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 */
export async function buildCampaignReports(
  prisma: PrismaClient,
  input: { campaignId: string; now?: Date; maxSubscriptions?: number }
): Promise<BuildReportsResult> {
  const now = input.now ?? new Date();
  const result: BuildReportsResult = { built: 0, skipped: 0, degraded: 0, outboxParts: 0 };
  const campaign = await prisma.deadlineCampaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) return result;
  const contest = await prisma.fantasyContest.findUnique({
    where: { id: campaign.contestId },
    select: { id: true, name: true, leagueId: true, season: true, provider: true }
  });
  if (!contest) return result;
  const round = await prisma.fantasyProviderRound.findFirst({
    where: { contestId: contest.id, providerRoundId: campaign.providerRoundId },
    select: { id: true, providerRoundId: true, ordinal: true, name: true }
  });
  const roundKey = round ? fantasyProviderRoundKey(contest.provider, round.ordinal, round.providerRoundId) : null;
  const tag = deadlineTag(contest.name, round?.ordinal ?? null);
  if (!tag) return result;

  const fixtures = round
    ? await prisma.fantasyProviderFixture.findMany({
        where: { contestId: contest.id, roundId: round.id },
        orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
        select: {
          id: true,
          homeTeamId: true,
          awayTeamId: true,
          providerHomeTeamName: true,
          providerAwayTeamName: true,
          kickoffAt: true,
          status: true,
          mappingStatus: true,
          matchId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } }
        }
      })
    : [];
  const scheduleKnown = fixtures.length > 0 && fixtures.every((fixture) => fixture.kickoffAt != null);
  const scheduleComplete = scheduleKnown && fixtures.every((fixture) => fixture.homeTeamId != null && fixture.awayTeamId != null && fixture.mappingStatus !== "UNMATCHED");
  const fixtureLines: DeadlineFixtureLine[] = fixtures.map((fixture) => ({
    home: fixture.homeTeam?.name ?? fixture.providerHomeTeamName ?? "?",
    away: fixture.awayTeam?.name ?? fixture.providerAwayTeamName ?? "?",
    kickoffAt: fixture.kickoffAt,
    status: fixture.status
  }));
  const fixturesByTeam = new Map<string, number>();
  for (const fixture of fixtures) {
    if (fixture.homeTeamId != null) fixturesByTeam.set(String(fixture.homeTeamId), (fixturesByTeam.get(String(fixture.homeTeamId)) ?? 0) + 1);
    if (fixture.awayTeamId != null) fixturesByTeam.set(String(fixture.awayTeamId), (fixturesByTeam.get(String(fixture.awayTeamId)) ?? 0) + 1);
  }

  const poolSnapshot = await prisma.fantasyPlayerPoolSnapshot.findFirst({
    where: { contestId: contest.id, status: "READY" },
    orderBy: { calculatedAt: "desc" },
    select: { calculatedAt: true }
  });
  const oddsFreshness = fixtures.length > 0
    ? await prisma.fixtureOddsSnapshot.findFirst({
        where: { matchId: { in: fixtures.map((fixture) => fixture.matchId).filter((matchId): matchId is bigint => matchId != null) } },
        orderBy: { fetchedAt: "desc" },
        select: { fetchedAt: true }
      })
    : null;
  const popularitySnapshot = await prisma.sportsTrendSnapshot.findFirst({
    where: {
      contestId: contest.id,
      providerRoundId: round?.providerRoundId ?? undefined,
      category: { in: ["BUYS", "SELLS", "OWNERSHIP"] },
      status: "READY"
    },
    orderBy: { observedAt: "desc" },
    select: { id: true, source: { select: { canonicalUrl: true } }, sourceEntryCount: true, _count: { select: { entries: true } } }
  });

  const subscriptions = await prisma.telegramSubscription.findMany({
    where: { contestId: contest.id, enabled: true, link: { state: "ACTIVE" } },
    include: { link: true },
    take: input.maxSubscriptions ?? 500
  });
  const deliveryOpen = moscowDateTimeToUtc({
    ...datePartsFromKey(campaign.reportDate ?? moscowDateKey(now)),
    hour: DEADLINE_DELIVERY_HOUR,
    minute: 0
  });

  for (const subscription of subscriptions) {
    try {
      const built = await buildOneReport(prisma, {
        campaign,
        contest,
        roundKey,
        roundLabel: round?.name ?? (round ? `Тур ${round.ordinal}` : null),
        tag,
        fixturesByTeam,
        fixtureLines,
        scheduleKnown,
        scheduleComplete,
        popularity: popularitySnapshot
          ? {
              available: true,
              count: popularitySnapshot.sourceEntryCount ?? popularitySnapshot._count.entries,
              sourceUrl: popularitySnapshot.source?.canonicalUrl ?? null
            }
          : { available: false, count: 0, sourceUrl: null },
        freshness: [
          { label: "Статистика", at: poolSnapshot?.calculatedAt ?? null, stale: false },
          { label: "Кэфы", at: oddsFreshness?.fetchedAt ?? null, stale: false }
        ],
        subscription,
        deliveryOpen,
        now
      });
      if (built) {
        result.built += 1;
        result.outboxParts += built.parts;
        if (built.degraded) result.degraded += 1;
      } else {
        result.skipped += 1;
      }
    } catch {
      result.skipped += 1;
    }
  }
  return result;
}

function datePartsFromKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year: year ?? 2000, month: month ?? 1, day: day ?? 1 };
}

async function buildOneReport(
  prisma: PrismaClient,
  input: {
    campaign: { id: string; contestId: string; season: string; providerRoundId: string; reportDate: string | null; deadlineAt: Date | null };
    contest: { id: string; name: string; leagueId: bigint; season: string; provider: string };
    roundKey: string | null;
    roundLabel: string | null;
    tag: string;
    fixturesByTeam: Map<string, number>;
    fixtureLines: DeadlineFixtureLine[];
    scheduleKnown: boolean;
    scheduleComplete: boolean;
    popularity: { available: boolean; count: number; sourceUrl: string | null };
    freshness: Array<{ label: string; at: Date | null; stale: boolean }>;
    subscription: {
      id: string;
      userId: string;
      squadId: string | null;
      sourcePreference: string;
      link: { linkVersion: number };
    };
    deliveryOpen: Date;
    now: Date;
  }
): Promise<{ parts: number; degraded: boolean } | null> {
  const degradedNotes: string[] = [];
  let sourcePlayers: SquadBasePlayer[] = [];
  let sourceKind: "SPORTS_PUBLISHED" | "SITE_SAVED" = input.subscription.sourcePreference === "SITE_SAVED" ? "SITE_SAVED" : "SPORTS_PUBLISHED";
  let sourceFetchedAt: Date | null = null;
  let tourLabel: string | null = null;

  if (sourceKind === "SITE_SAVED") {
    const squad = input.subscription.squadId
      ? await prisma.userFantasySquad.findFirst({ where: { id: input.subscription.squadId, userId: input.subscription.userId } })
      : await prisma.userFantasySquad.findFirst({ where: { userId: input.subscription.userId, contestId: input.contest.id }, orderBy: { updatedAt: "desc" } });
    if (!squad) {
      degradedNotes.push("сохранённый состав Scout не найден");
    } else {
      const rows = await prisma.userFantasySquadPlayer.findMany({ where: { squadId: squad.id }, orderBy: { slotIndex: "asc" } });
      sourcePlayers = rows.map((row) => ({
        playerId: String(row.playerId),
        isStarter: row.isStarter,
        isCaptain: row.isCaptain,
        isViceCaptain: row.isViceCaptain,
        sourceName: null
      }));
      sourceFetchedAt = squad.updatedAt;
    }
  } else {
    const snapshot = await prisma.sportsRuSquadSnapshot.findFirst({
      where: { userId: input.subscription.userId, leagueId: input.contest.leagueId, season: input.contest.season, status: "COMPLETE" },
      orderBy: [{ completedAt: "desc" }, { fetchedAt: "desc" }],
      select: { selections: true, fetchedAt: true, completedAt: true, tourName: true, providerTourId: true }
    });
    if (!snapshot) {
      degradedNotes.push("опубликованный состав Sports не найден");
      sourceKind = "SPORTS_PUBLISHED";
    } else {
      const selections = Array.isArray(snapshot.selections) ? (snapshot.selections as Array<Record<string, unknown>>) : [];
      sourcePlayers = selections
        .filter((selection) => typeof selection.playerId === "string")
        .map((selection) => ({
          playerId: String(selection.playerId),
          isStarter: selection.isStarter !== false,
          isCaptain: selection.isCaptain === true,
          isViceCaptain: selection.isViceCaptain === true,
          sourceName: null
        }));
      sourceFetchedAt = snapshot.completedAt ?? snapshot.fetchedAt ?? null;
      tourLabel = snapshot.tourName ?? snapshot.providerTourId ?? null;
      if (snapshot.selections == null || sourcePlayers.length === 0) degradedNotes.push("опубликованный состав Sports пуст");
    }
  }

  const numericIds = sourcePlayers.map((player) => player.playerId).filter((playerId) => /^\d+$/.test(playerId));
  const unmappedCount = sourcePlayers.length - numericIds.length;
  if (unmappedCount > 0) degradedNotes.push(`не сопоставлено игроков: ${unmappedCount}`);

  const bigintIds = numericIds.map((playerId) => numericPlayerId(playerId)).filter((playerId): playerId is bigint => playerId != null);
  const [prices, pool, xiRows, teamRows, series] = await Promise.all([
    prisma.fantasyPlayerPrice.findMany({
      where: { contestId: input.contest.id, playerId: { in: bigintIds } },
      select: { playerId: true, teamId: true, playerName: true, teamName: true }
    }),
    loadFantasyPlayerPoolSnapshotPlayers(prisma, { contestId: input.contest.id, playerIds: numericIds }),
    prisma.teamPlayerSeason.findMany({
      where: { leagueId: input.contest.leagueId, season: input.contest.season, playerId: { in: bigintIds } },
      select: { playerId: true, teamId: true, isStarter: true }
    }),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: input.contest.leagueId, season: input.contest.season },
      select: { teamId: true, metadata: true }
    }),
    prisma.fantasyPlayerPoolSnapshot.findFirst({
      where: { contestId: input.contest.id, status: "READY" },
      orderBy: { calculatedAt: "desc" },
      select: { id: true, calculatedAt: true }
    })
  ]);

  const altAllowed = series
    ? await userCanUseCurrentXiFantasyPlayerPoolSnapshot(prisma, input.subscription.userId, fantasyHistorySettingsKey(defaultFantasyHistorySettings))
    : false;
  const poolMetadata = series ? parseFantasyPlayerPoolSnapshotMetadata((pool.snapshot?.metadata ?? null) as unknown) : null;
  const roundIndex = input.roundKey && poolMetadata?.rounds ? poolMetadata.rounds.findIndex((entry) => entry.id === input.roundKey) : -1;
  if (series && !altAllowed) degradedNotes.push("личная формула ALT: показан только календарь и XI");

  const priceByPlayer = new Map(prices.map((row) => [String(row.playerId), row]));
  const poolByPlayer = new Map(pool.players.map((player) => [player.playerId, player]));
  const xiByPlayer = new Map(xiRows.map((row) => [String(row.playerId), row]));
  const lineupByTeam = new Map(teamRows.map((row) => [String(row.teamId), parseProbableLineup(row.metadata)]));
  const observedXi = teamRows
    .map((row) => parseProbableLineup(row.metadata)?.observedAt ?? null)
    .filter((value): value is number => value != null);
  const xiObservedAt = observedXi.length > 0 ? new Date(Math.max(...observedXi)) : null;
  const freshness = [...input.freshness];
  if (xiObservedAt) {
    freshness.push({ label: "Прогнозы XI", at: xiObservedAt, stale: input.now.getTime() - xiObservedAt.getTime() > XI_STALE_MS });
  } else {
    freshness.push({ label: "Прогнозы XI", at: null, stale: false });
  }
  if (sourceFetchedAt) freshness.push({ label: "Состав Sports", at: sourceFetchedAt, stale: false });

  const signals: DeadlinePlayerSignalInput[] = sourcePlayers.map((player) => {
    const price = priceByPlayer.get(player.playerId);
    const poolPlayer = poolByPlayer.get(player.playerId);
    const xi = xiByPlayer.get(player.playerId);
    const teamId = price?.teamId != null ? String(price.teamId) : poolPlayer?.teamId ?? null;
    const fixtureCount = teamId != null ? input.fixturesByTeam.get(teamId) ?? 0 : null;
    const lineup = teamId != null ? lineupByTeam.get(teamId) ?? null : null;
    const coveredFixtures = lineup?.sourceKickoff != null
      ? input.fixtureLines.filter((fixture) => fixture.kickoffAt && Math.abs(fixture.kickoffAt.getTime() - lineup.sourceKickoff!) <= FIXTURE_MATCH_TOLERANCE_MS).length
      : 0;
    const rawAlt = altAllowed && poolPlayer && roundIndex >= 0 ? poolPlayer.alternativeRoundPoints?.[roundIndex] ?? null : null;
    const alt = rawAlt == null ? null : Math.round(rawAlt * 10) / 10;
    return {
      playerId: player.playerId,
      name: poolPlayer?.name ?? price?.playerName ?? player.sourceName ?? player.playerId,
      teamId,
      teamName: poolPlayer?.teamName ?? price?.teamName ?? null,
      isStarter: player.isStarter,
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      alt,
      altIsRoundedZero: rawAlt != null && rawAlt !== 0 && Math.round(rawAlt * 10) / 10 === 0,
      fixtureCount,
      predictedXi: {
        available: lineup != null && coveredFixtures > 0,
        inXi: xi?.isStarter === true,
        coveredFixtures,
        stale: lineup?.observedAt == null || input.now.getTime() - lineup.observedAt > XI_STALE_MS,
        source: lineup?.source ?? null
      },
      mappingComplete: teamId != null && poolPlayer != null
    };
  });

  const classified = classifyDeadlinePlayers({ players: signals, scheduleKnown: input.scheduleKnown, scheduleComplete: input.scheduleComplete });
  const degraded = [...degradedNotes, ...classified.degraded];
  const rendered = renderDeadlineReport({
    tag: input.tag,
    deadlineAt: input.campaign.deadlineAt,
    today: input.campaign.reportDate === moscowDateKey(input.now),
    squadSource: {
      kind: sourceKind,
      tourLabel,
      fetchedAt: sourceFetchedAt,
      note: sourceKind === "SPORTS_PUBLISHED" && input.roundLabel ? `Последние замены на тур ${input.roundLabel} могут отсутствовать.` : null
    },
    findings: classified.findings,
    fixtures: input.fixtureLines,
    popularity: input.popularity.available ? input.popularity : null,
    freshness,
    squadUrl: `${process.env.TELEGRAM_PUBLIC_BASE_URL?.trim() || "https://fantasy.tsyzhman.ru"}/machete/squad`,
    degraded
  });
  const renderHash = createHash("sha256").update(rendered.parts.join("\n--part--\n")).digest("hex");

  await prisma.$transaction(async (tx) => {
    const report = await tx.deadlineUserReport.upsert({
      where: { userId_campaignId_reportVersion: { userId: input.subscription.userId, campaignId: input.campaign.id, reportVersion: 1 } },
      create: {
        userId: input.subscription.userId,
        campaignId: input.campaign.id,
        reportVersion: 1,
        status: degraded.length > 0 ? "DEGRADED" : "READY",
        renderHash,
        partsCount: rendered.partsCount,
        findings: classified.findings as unknown as Prisma.InputJsonValue,
        inputRefs: {
          contestId: input.contest.id,
          providerRoundId: input.campaign.providerRoundId,
          season: input.contest.season
        } as unknown as Prisma.InputJsonValue
      },
      update: {
        status: degraded.length > 0 ? "DEGRADED" : "READY",
        renderHash,
        partsCount: rendered.partsCount,
        findings: classified.findings as unknown as Prisma.InputJsonValue
      }
    });
    for (let index = 0; index < rendered.parts.length; index += 1) {
      const partNumber = index + 1;
      const text = rendered.parts[index]!;
      const existing = await tx.telegramOutbox.findUnique({
        where: { userId_campaignId_reportKind_partNumber: { userId: input.subscription.userId, campaignId: input.campaign.id, reportKind: "DEADLINE_REPORT", partNumber } }
      });
      if (existing) {
        await tx.telegramOutbox.updateMany({
          where: { id: existing.id, state: { in: ["PENDING", "FAILED"] } },
          data: { text, reportVersion: report.reportVersion, partsCount: rendered.partsCount, linkVersion: input.subscription.link.linkVersion, nextAttemptAt: input.deliveryOpen }
        });
      } else {
        await tx.telegramOutbox.create({
          data: {
            userId: input.subscription.userId,
            campaignId: input.campaign.id,
            reportKind: "DEADLINE_REPORT",
            partNumber,
            partsCount: rendered.partsCount,
            reportVersion: report.reportVersion,
            state: "PENDING",
            nextAttemptAt: input.deliveryOpen,
            linkVersion: input.subscription.link.linkVersion,
            text
          }
        });
      }
    }
  });

  return { parts: rendered.partsCount, degraded: degraded.length > 0 };
}
