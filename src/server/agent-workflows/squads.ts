/** @spec spec://modules/agents/FEAT-017-squad-workflows#squads */
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-handler";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";
import { plannerReadinessBlocksTransferSuggestions } from "@/machete/planner_readiness";
import {
  latestFantasyPlayerPoolSnapshot, parseFantasyPlayerPoolSnapshotMetadata, userCanUseCurrentXiFantasyPlayerPoolSnapshot
} from "@/machete/fantasy-player-pool-snapshots";
import type { SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import { defaultFantasyHistorySettings, fantasyHistorySettingsKey } from "@/machete/squad-history";
import {
  fantasyProviderPlaceholderPlannerPlayer, fantasyProviderPlaceholdersFromFilters, isFantasyProviderPlaceholderPlayerId, type FantasyPlannerPlayer,
  type FantasySquadSelection
} from "@/machete/squad_logic";
import {
  fantasyRulesForLeague, fantasySquadRoundIdsFromFilters, fantasySquadRoundPlansFromFilters, fantasySquadRoundShift,
  fantasySquadTransferBaselineFromFilters, loadFantasySquadPlannerData, loadFantasySquadPlayerPoolBaseBatch,
  loadOpeningFreeTransfers, loadUpcomingRoundFixtures, rolloverFantasySquadRoundPlans, sportsPublicationId, sportsRuSeasonAliases
} from "@/machete/squad_planner";
import { notFound, pageResult, readPage, stringField } from "./definition";
import type { PlanningContext } from "./transfers";

const maxPoolSize = 1200;
const squadFields = {
  id: true, userId: true, contestId: true, provider: true, leagueId: true, season: true, name: true,
  bank: true, budgetLimit: true, horizonRounds: true, updatedAt: true, filters: true,
  players: { orderBy: [{ slotIndex: "asc" }, { playerId: "asc" }], take: 31, select: {
    playerId: true, teamId: true, position: true, purchasePrice: true, slotIndex: true,
    isStarter: true, isLocked: true, isCaptain: true, isViceCaptain: true, player: { select: { name: true } }
  } }
} satisfies Prisma.UserFantasySquadSelect;

export type OwnedSquad = Prisma.UserFantasySquadGetPayload<{ select: typeof squadFields }>;
type SquadReader = Pick<Prisma.TransactionClient, "userFantasySquad">;

export async function ownedSquad(db: SquadReader, userId: string, id: string) {
  const row = await db.userFantasySquad.findFirst({ where: { userId, id }, select: squadFields });
  if (!row) notFound("Squad");
  const filters = row.filters as { roundPlans?: unknown; providerPlaceholders?: unknown } | null;
  if (row.players.length > 30 || (Array.isArray(filters?.roundPlans) &&
      (filters.roundPlans.length > 5 || filters.roundPlans.some(plan => Array.isArray(plan?.selections) && plan.selections.length > 30))) ||
      (Array.isArray(filters?.providerPlaceholders) && filters.providerPlaceholders.length > 150)) {
    throw new ApiError("SQUAD_TOO_LARGE", "The saved squad exceeds the supported size.", 422);
  }
  return row;
}

export async function listSquads(db: SquadReader, userId: string, input: Record<string, unknown>) {
  const { limit, cursor } = readPage(input);
  const query = input.query === undefined ? undefined : stringField(input.query, "query", 100);
  const rows = await db.userFantasySquad.findMany({
    where: { userId, ...(cursor ? { id: { gt: cursor } } : {}), ...(query ? { name: { contains: query, mode: "insensitive" } } : {}) },
    orderBy: { id: "asc" }, take: limit + 1,
    select: { id: true, name: true, provider: true, contestId: true, leagueId: true, season: true, updatedAt: true }
  });
  return pageResult(rows.map(row => ({ ...row, squadId: row.id, leagueId: String(row.leagueId), updatedAt: row.updatedAt.toISOString() })), limit);
}

export function squadVersion(row: OwnedSquad) {
  // Provider identity reconciliation can update players without touching the parent timestamp.
  const state = { ...row, players: row.players.map(entry => ({
    playerId: entry.playerId, teamId: entry.teamId, position: entry.position, purchasePrice: entry.purchasePrice,
    slotIndex: entry.slotIndex, isStarter: entry.isStarter, isLocked: entry.isLocked,
    isCaptain: entry.isCaptain, isViceCaptain: entry.isViceCaptain
  })) };
  return createHash("sha256").update(JSON.stringify(state, (_, value) => typeof value === "bigint" ? String(value) : value)).digest("hex");
}

function storedPlans(row: OwnedSquad) {
  const selections: FantasySquadSelection[] = row.players.map(entry => ({
    playerId: String(entry.playerId), isStarter: entry.isStarter, isLocked: entry.isLocked,
    isCaptain: entry.isCaptain, isViceCaptain: entry.isViceCaptain, slotIndex: entry.slotIndex, purchasePrice: entry.purchasePrice
  }));
  return fantasySquadRoundPlansFromFilters(row.filters, selections);
}

export function squadDetails(row: OwnedSquad) {
  const names = new Map(row.players.map(entry => [String(entry.playerId), entry.player.name]));
  for (const entry of fantasyProviderPlaceholdersFromFilters(row.filters, row.provider)) names.set(entry.playerId, entry.name);
  return {
    squadId: row.id, name: row.name, provider: row.provider, contestId: row.contestId, leagueId: String(row.leagueId), season: row.season,
    squadVersion: squadVersion(row), sportsPublicationId: sportsPublicationId(row.filters), budget: row.budgetLimit, bank: row.bank,
    horizonRounds: row.horizonRounds, players: storedPlans(row)[0].selections.map(entry => ({ ...entry, name: names.get(entry.playerId) ?? null }))
  };
}

async function snapshotPool(db: PrismaClient, squad: OwnedSquad, league: SharedLeagueSeasonOption, contest: {
  id: string; name: string; budgetLimit: number; squadSize: number; maxPlayersPerTeam: number; scheduleRevision: string | null;
}) {
  if (squad.provider !== "SPORTS_RU") return null;
  const snapshot = await latestFantasyPlayerPoolSnapshot(db, { contestId: contest.id, variant: "CURRENT_XI" });
  const metadata = parseFantasyPlayerPoolSnapshotMetadata(snapshot?.metadata);
  if (!snapshot || !metadata || !Array.isArray(metadata.readiness.reasons) || snapshot.playersCount > maxPoolSize) return null;
  if (!(await userCanUseCurrentXiFantasyPlayerPoolSnapshot(db, squad.userId, fantasyHistorySettingsKey(defaultFantasyHistorySettings)))) return null;
  const { rounds } = await loadUpcomingRoundFixtures(db, league, squad.provider, contest.id, contest.scheduleRevision);
  if (metadata.rounds.length !== rounds.length || rounds.some((round, index) => metadata.rounds[index].id !== round.id)) return null;
  const rows = await db.fantasyPlayerPoolSnapshotPlayer.findMany({
    where: { snapshotId: snapshot.id }, orderBy: { playerId: "asc" }, take: maxPoolSize + 1, select: { playerId: true, payload: true }
  });
  if (rows.length !== snapshot.playersCount) return null;
  const forecasts = new Map<string, FantasyPlannerPlayer>();
  for (const { playerId, payload } of rows) {
    const value = payload as Partial<FantasyPlannerPlayer> | null;
    if (value?.playerId !== playerId || !Array.isArray(value.roundPoints) || !value.roundPoints.every(Number.isFinite)) return null;
    forecasts.set(playerId, value as FantasyPlannerPlayer);
  }
  // A roster can gain players or move clubs before its forecast snapshot is rebuilt.
  // Use the complete live planner when a lightweight row cannot establish the same identity.
  const prices = await db.fantasyPlayerPrice.findMany({
    where: { provider: squad.provider, contestId: contest.id, leagueId: squad.leagueId,
      season: { in: sportsRuSeasonAliases(squad.season) }, playerId: { not: null } }, select: { playerId: true }, take: maxPoolSize + 1
  });
  const currentIds = new Set(prices.map(price => String(price.playerId)));
  if (currentIds.size !== prices.length || [...currentIds].some(id => !forecasts.has(id))) return null;
  const current = await loadFantasySquadPlayerPoolBaseBatch(db, league, contest.id, [...forecasts.keys()]);
  if (current.some(player => {
    const previous = forecasts.get(player.playerId)!;
    return previous.teamId !== player.teamId || previous.positionGroup !== player.positionGroup ||
      (previous.isStarter !== undefined && player.isStarter !== undefined && previous.isStarter !== player.isStarter);
  })) return null;
  const players = current.map(player => {
    const forecast = forecasts.get(player.playerId)!;
    return {
      ...forecast, id: player.id, playerId: player.playerId, name: player.name, teamId: player.teamId, teamName: player.teamName,
      position: player.position, positionGroup: player.positionGroup, price: player.price, priceSource: player.priceSource,
      fixtures: forecast.fixtures ?? [], fixtureDifficulties: forecast.fixtureDifficulties ?? []
    };
  });
  return { players, rounds, rules: fantasyRulesForLeague(league, contest, squad.provider, rounds), readiness: metadata.readiness, openingAvailable: null };
}

export async function loadPlanningContext(db: PrismaClient, row: OwnedSquad): Promise<PlanningContext> {
  const { leagueId, season, provider, contestId } = row;
  if (provider !== "SPORTS_RU" && !(provider === FPL_PROVIDER && leagueId === FPL_LEAGUE_ID && season === FPL_SEASON)) {
    throw new ApiError("UNSUPPORTED_CONTEST", "This provider and season are unavailable in the squad planner.", 422);
  }
  const [scope, contest, priceCount, rosterCount] = await Promise.all([
    db.leagueSeason.findUnique({ where: { leagueId_season: { leagueId, season } }, include: { league: { select: { name: true, country: true } } } }),
    db.fantasyContest.findFirst({ where: { id: contestId, leagueId, provider, season: { in: sportsRuSeasonAliases(season) } } }),
    db.fantasyPlayerPrice.count({ where: { contestId } }),
    db.teamPlayerSeason.count({ where: { leagueId, season, active: true } })
  ]);
  if (!scope || !contest) throw new ApiError("PLANNER_UNAVAILABLE", "The squad's contest or league season is unavailable.", 422);
  if (Math.max(priceCount, rosterCount) > maxPoolSize) throw new ApiError("PLAYER_POOL_TOO_LARGE", "The contest exceeds the supported player pool.", 422);
  const name = scope.name ?? scope.league.name;
  const country = scope.country ?? scope.league.country;
  const providerLeagueId = String(leagueId);
  const league = { leagueId, season, name, country, providerLeagueId, isCurrent: scope.isCurrent, updatedAt: scope.updatedAt,
    displayName: macheteLeagueDisplayName({ id: providerLeagueId, name, country, providerLeagueId }) };
  const snapshot = await snapshotPool(db, row, league, contest);
  const live = snapshot ?? await loadFantasySquadPlannerData(db, row.userId, league, null, { provider, contestId, skipSavedSquads: true });
  const placeholders = fantasyProviderPlaceholdersFromFilters(row.filters, provider);
  const pool = [...live.players.filter(player => player.priceSource === provider && Number.isFinite(player.price) && player.price >= 0),
    ...placeholders.map(entry => fantasyProviderPlaceholderPlannerPlayer(entry, league.displayName))];
  const roundIds = live.rounds.map(round => round.id);
  const plans = storedPlans(row);
  const roundPlans = rolloverFantasySquadRoundPlans({ plans, shift: fantasySquadRoundShift(fantasySquadRoundIdsFromFilters(row.filters), roundIds),
    pool, rules: live.rules, fallbackSelections: plans[0].selections });
  return { pool, rules: live.rules, roundPlans, roundIds, contestUpdatedAt: contest.updatedAt,
    forecastBlocked: plannerReadinessBlocksTransferSuggestions(live.readiness), storedBaseline: fantasySquadTransferBaselineFromFilters(row.filters),
    openingAvailable: "squad" in live ? live.squad.openingFreeTransfers ?? null : live.openingAvailable };
}

/** Check the server inputs again inside the transaction that writes the squad and its run receipt. */
export async function verifyPlanningInputs(tx: Prisma.TransactionClient, row: OwnedSquad, context: PlanningContext, selectedIds: string[]) {
  const changed = () => new ApiError("SQUAD_DATA_CHANGED", "Prices, contest rules or the transfer allowance changed. Test the workflow again.", 409);
  // A parent lock also fences insertion of a new price, round or allowance row referencing this contest.
  const contest = await tx.$queryRaw<{ updatedAt: Date }[]>`
    SELECT updated_at AS "updatedAt" FROM sports_ru_fantasy_contests WHERE id = ${row.contestId} FOR UPDATE`;
  if (!contest.length || +contest[0].updatedAt !== +context.contestUpdatedAt) throw changed();
  if (row.provider === FPL_PROVIDER) {
    await tx.$queryRaw`SELECT id FROM fantasy_user_gameweek_states WHERE contest_id = ${row.contestId}
      AND user_id = ${row.userId} AND provider = ${row.provider} ORDER BY gameweek DESC LIMIT 1 FOR SHARE`;
    if (await loadOpeningFreeTransfers(tx, row) !== context.openingAvailable) throw changed();
  }
  const ids = [...new Set(selectedIds)].filter(id => !isFantasyProviderPlaceholderPlayerId(id));
  if (!ids.length) return;
  const seasons = Prisma.join(sportsRuSeasonAliases(row.season));
  const mapped = row.provider === "SPORTS_RU" ? Prisma.sql`
    LEFT JOIN "ProviderEntityMap" m ON m.contest_id = p.contest_id AND m.provider = p.provider
      AND m.provider_season IN (${seasons}) AND m."providerEntityType" = 'FANTASY_PLAYER_PRICE'
      AND m."providerEntityId" = p.id AND m."internalEntityType" = 'PLAYER' AND m.status = 'MATCHED'` : Prisma.empty;
  const playerId = row.provider === "SPORTS_RU" ? Prisma.sql`COALESCE(m."internalEntityId", p.player_id::text)` : Prisma.sql`p.player_id::text`;
  const prices = await tx.$queryRaw<{ playerId: string; price: number }[]>(Prisma.sql`
    SELECT ${playerId} AS "playerId", p.price FROM fantasy_player_prices p ${mapped}
    WHERE p.contest_id = ${row.contestId} AND p.provider = ${row.provider} AND p.league_id = ${row.leagueId}
      AND p.season IN (${seasons}) AND ${playerId} IN (${Prisma.join(ids)})
    ORDER BY p.last_seen_at DESC, p.id FOR SHARE OF p`);
  const livePrices = new Map<string, number>();
  for (const price of prices) if (!livePrices.has(price.playerId)) livePrices.set(price.playerId, price.price);
  const expected = new Map(context.pool.map(player => [player.playerId, player.price]));
  if (ids.some(id => livePrices.get(id) !== expected.get(id) || !livePrices.has(id))) throw changed();
}

export async function lockOwnedSquad(tx: Prisma.TransactionClient, userId: string, squadId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM user_fantasy_squads WHERE id = ${squadId} AND user_id = ${userId} FOR UPDATE`;
  if (!rows.length) notFound("Squad");
  // Also serialize child-only Sports identity corrections with the final version check.
  await tx.$queryRaw`SELECT id FROM user_fantasy_squad_players WHERE squad_id = ${squadId} ORDER BY id FOR UPDATE`;
  return ownedSquad(tx, userId, squadId);
}
