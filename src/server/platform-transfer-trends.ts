/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#contracts */
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PlatformTransferCounter, platformSavedFootballRoster, record,
  type PlatformTransferEntry, type PlatformTransferTrends
} from "@/machete/platform-transfer-trends";
import { fantasyProviderPlaceholderPlayerId } from "@/machete/squad_logic";

const batchSize = 100;
type Db = Prisma.TransactionClient;
type Round = { id: string; label: string; startsAt: Date; providerRoundId: string; ordinal: number };
type BatchRow = { userId: string; updatedAt: Date; filters: unknown; current: unknown; baseline: unknown; placeholders: unknown };
type Metadata = Pick<PlatformTransferEntry, "name" | "team" | "position">;

export async function loadPlatformTransferTrends(
  db: PrismaClient, input: { contestId: string; module: "football" | "khl"; now?: Date }
): Promise<PlatformTransferTrends | null> {
  return db.$transaction(async (tx) => input.module === "khl"
    ? loadKhl(tx, input.contestId, input.now ?? new Date())
    : loadFootball(tx, input.contestId, input.now ?? new Date()),
  { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}

function emptyView(contestId: string, provider: string, season: string, now: Date): PlatformTransferTrends {
  return { contestId, provider, season, status: "NO_BASELINE", baselineRound: null, targetRound: null,
    asOf: now.toISOString(), participants: 0, compared: 0, excluded: 0, buys: [], sells: [] };
}

function roundKey(provider: string, ordinal: number, providerRoundId: string) {
  return provider === "FPL" ? `fpl:event:${ordinal}` : `sports-ru:tour:${ordinal}:${encodeURIComponent(providerRoundId)}`;
}

async function loadFootball(tx: Db, contestId: string, now: Date) {
  const contest = await tx.fantasyContest.findUnique({ where: { id: contestId },
    select: { id: true, provider: true, leagueId: true, season: true, squadSize: true } });
  if (!contest || !["SPORTS_RU", "FPL"].includes(contest.provider)) return null;
  const view = emptyView(contest.id, contest.provider, contest.season, now);
  const rounds = await tx.fantasyProviderRound.findMany({ where: { contestId, provider: contest.provider },
    select: { ordinal: true, providerRoundId: true, name: true, startsAt: true, deadlineAt: true, status: true },
    orderBy: { ordinal: "asc" }, take: 100 });
  const normalized = rounds.flatMap((r): Array<Round & { deadline: Date; status: string | null }> => {
    const startsAt = r.startsAt ?? r.deadlineAt;
    if (!startsAt || ["CANCELLED", "POSTPONED"].includes(r.status?.toUpperCase() ?? "")) return [];
    return [{ id: roundKey(contest.provider, r.ordinal, r.providerRoundId), label: r.name, startsAt,
      deadline: r.deadlineAt ?? startsAt, providerRoundId: r.providerRoundId, ordinal: r.ordinal, status: r.status }];
  });
  const baseline = normalized.filter(r => r.startsAt <= now
    && (contest.provider !== "FPL" || r.status === "FINISHED")).at(-1);
  const target = normalized.find(r => r.deadline > now);
  view.baselineRound = baseline ? { id: baseline.id, label: baseline.label } : null;
  view.targetRound = target ? { id: target.id, label: target.label } : null;
  if (!baseline || !target) {
    view.status = baseline ? "NO_NEXT_ROUND" : "NO_BASELINE";
    const [count] = await tx.$queryRaw<{ count: number }[]>`
      SELECT count(DISTINCT s.user_id)::int AS count FROM user_fantasy_squads s
      JOIN "User" u ON u.id = s.user_id AND u."isActive" = true
      WHERE s.contest_id = ${contestId} AND s.provider = ${contest.provider}
        AND s.league_id = ${contest.leagueId} AND s.season = ${contest.season}`;
    view.participants = view.excluded = count.count;
    return view;
  }

  const counter = new PlatformTransferCounter();
  const placeholderMetadata = new Map<string, Metadata>();
  let cursor = "";
  for (;;) {
    const snapshotJoin = contest.provider === "SPORTS_RU" ? Prisma.sql`
      SELECT b.selections, b.unmapped_players AS placeholders FROM sports_ru_squad_snapshots b
      JOIN user_external_profiles p ON p.user_id = s.user_id AND p.provider = 'SPORTS_RU'
        AND p.provider_user_id = b.provider_profile_id
      WHERE b.user_id = s.user_id AND b.league_id = ${contest.leagueId} AND b.season = ${contest.season}
        AND b.provider_tour_id = ${baseline.providerRoundId} AND b.status = 'COMPLETE'
        AND b.players_count = ${contest.squadSize}
      ORDER BY b.completed_at DESC NULLS LAST, b.id DESC LIMIT 1` : Prisma.sql`
      SELECT b.selections, NULL::jsonb AS placeholders FROM fantasy_provider_squad_snapshots b
      JOIN user_external_profiles p ON p.user_id = s.user_id AND p.provider = 'FPL'
        AND p.provider_user_id = b.provider_squad_id
      WHERE b.user_id = s.user_id AND b.contest_id = ${contestId} AND b.provider = 'FPL'
        AND b.league_id = ${contest.leagueId} AND b.season = ${contest.season}
        AND b.gameweek = ${baseline.ordinal} AND b.status = 'IMPORTED'
        AND b.players_count = ${contest.squadSize} AND b.mapped_players_count = ${contest.squadSize}
        AND (s.filters #>> '{globalStrategyBinding,providerSquadId}' IS NULL
          OR b.provider_squad_id = s.filters #>> '{globalStrategyBinding,providerSquadId}')
      ORDER BY b.imported_at DESC NULLS LAST, b.id DESC LIMIT 1`;
    const rows = await tx.$queryRaw<BatchRow[]>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (s.user_id) s.id, s.user_id, s.updated_at, s.filters
        FROM user_fantasy_squads s JOIN "User" u ON u.id = s.user_id AND u."isActive" = true
        WHERE s.contest_id = ${contestId} AND s.provider = ${contest.provider}
          AND s.league_id = ${contest.leagueId} AND s.season = ${contest.season} AND s.user_id > ${cursor}
        ORDER BY s.user_id, s.updated_at DESC, s.id DESC LIMIT ${batchSize}
      )
      SELECT s.user_id AS "userId", s.updated_at AS "updatedAt", s.filters,
        to_jsonb(ARRAY(SELECT p.player_id::text FROM user_fantasy_squad_players p
          WHERE p.squad_id = s.id ORDER BY p.slot_index)) AS current,
        b.selections AS baseline, b.placeholders
      FROM latest s LEFT JOIN LATERAL (${snapshotJoin}) b ON true ORDER BY s.user_id`);
    for (const row of rows) {
      counter.add(platformSavedFootballRoster({ filters: row.filters, fallback: row.current,
        targetRoundId: target.id, updatedAt: row.updatedAt, baselineStartsAt: baseline.startsAt }),
      row.baseline, contest.squadSize, "football");
      rememberPlaceholders(placeholderMetadata, record(row.filters)?.providerPlaceholders, contest.provider);
      rememberPlaceholders(placeholderMetadata, row.placeholders, contest.provider);
    }
    if (rows.length < batchSize) break;
    cursor = rows.at(-1)!.userId;
  }
  const topIds = [...new Set([...counter.top("buys"), ...counter.top("sells")].map(r => r.playerId))];
  const numericIds = topIds.filter(id => /^\d+$/.test(id)).map(BigInt);
  const prices = numericIds.length ? await tx.fantasyPlayerPrice.findMany({
    where: { contestId, provider: contest.provider, playerId: { in: numericIds } },
    select: { playerId: true, playerName: true, teamName: true, position: true }, orderBy: { lastSeenAt: "desc" }
  }) : [];
  const metadata = new Map<string, Metadata>(placeholderMetadata);
  for (const price of prices) if (price.playerId && !metadata.has(String(price.playerId))) {
    metadata.set(String(price.playerId), { name: price.playerName, team: price.teamName || null, position: price.position });
  }
  const missingIds = numericIds.filter(id => !metadata.has(String(id)));
  if (missingIds.length) {
    const players = await tx.corePlayer.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true } });
    for (const p of players) metadata.set(String(p.id), { name: p.name, team: null, position: null });
  }
  return finishView(view, counter, metadata);
}

async function loadKhl(tx: Db, contestId: string, now: Date) {
  const contest = await tx.khlContest.findUnique({ where: { id: contestId },
    select: { provider: true, season: { select: { seasonKey: true } } } });
  if (!contest) return null;
  const view = emptyView(contestId, contest.provider, contest.season.seasonKey, now);
  const baseline = await tx.khlFantasyWeek.findFirst({ where: { contestId, verified: true, startsAt: { lte: now } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }], select: { providerWeekId: true, label: true, startsAt: true } });
  view.baselineRound = baseline ? { id: baseline.providerWeekId, label: baseline.label } : null;
  view.targetRound = { id: "saved-plan", label: "Сохранённый план" };
  const counter = new PlatformTransferCounter();
  let cursor = "";
  for (;;) {
    const rows = await tx.$queryRaw<BatchRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (s."userId") s.id, s."userId", s."updatedAt", s."baselineSnapshotId"
        FROM khl_user_squads s JOIN "User" u ON u.id = s."userId" AND u."isActive" = true
        WHERE s."contestId" = ${contestId} AND s."userId" > ${cursor}
        ORDER BY s."userId", s."updatedAt" DESC, s.id DESC LIMIT ${batchSize}
      )
      SELECT s."userId", s."updatedAt", NULL::jsonb AS filters,
        to_jsonb(ARRAY(SELECT e."fantasyPlayerId" FROM khl_user_squad_entries e
          WHERE e."squadId" = s.id ORDER BY e."slotIndex")) AS current,
        b.entries AS baseline, NULL::jsonb AS placeholders
      FROM latest s LEFT JOIN LATERAL (
        SELECT b.entries FROM khl_provider_squad_snapshots b
        WHERE b."userId" = s."userId" AND b."contestId" = ${contestId}
          AND b."providerWeekId" = ${baseline?.providerWeekId ?? ""}
          AND (s."baselineSnapshotId" IS NULL OR b."providerEntryId" = (
            SELECT bound."providerEntryId" FROM khl_provider_squad_snapshots bound WHERE bound.id = s."baselineSnapshotId"))
        ORDER BY b."observedAt" DESC, b.id DESC LIMIT 1
      ) b ON true ORDER BY s."userId"`;
    for (const row of rows) counter.add(baseline?.startsAt && row.updatedAt >= baseline.startsAt ? row.current : null, row.baseline, 17, "khl");
    if (rows.length < batchSize) break;
    cursor = rows.at(-1)!.userId;
  }
  const topIds = [...new Set([...counter.top("buys"), ...counter.top("sells")].map(r => r.playerId))];
  const players = topIds.length ? await tx.khlFantasyPlayer.findMany({ where: { contestId, id: { in: topIds } },
    select: { id: true, name: true, clubName: true, position: true } }) : [];
  const metadata = new Map(players.map(p => [p.id, { name: p.name, team: p.clubName, position: p.position }]));
  return finishView(view, counter, metadata);
}

function finishView(view: PlatformTransferTrends, counter: PlatformTransferCounter, metadata: Map<string, Metadata>) {
  const entries = (direction: "buys" | "sells") => counter.top(direction).map(row => ({ ...row,
    ...(metadata.get(row.playerId) ?? { name: `#${row.playerId}`, team: null, position: null }) }));
  return { ...view, participants: counter.participants, compared: counter.compared,
    excluded: counter.participants - counter.compared,
    status: !view.baselineRound ? "NO_BASELINE" as const : counter.compared ? "READY" as const : "NO_COMPARABLE_SQUADS" as const,
    buys: entries("buys"), sells: entries("sells") };
}

function rememberPlaceholders(metadata: Map<string, Metadata>, value: unknown, provider: string) {
  if (!Array.isArray(value)) return;
  for (const item of value.slice(0, 25)) {
    const p = record(item);
    if (p?.provider !== provider || typeof p.providerPlayerId !== "string" || typeof p.name !== "string") continue;
    try {
      metadata.set(fantasyProviderPlaceholderPlayerId(provider, p.providerPlayerId), {
        name: p.name.slice(0, 200), team: typeof p.teamName === "string" ? p.teamName.slice(0, 200) : null,
        position: typeof p.position === "string" ? p.position : null
      });
    } catch { /* malformed placeholder metadata cannot change the roster counts */ }
  }
}
