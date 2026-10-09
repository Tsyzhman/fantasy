/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { SourcePlayer } from '../providers/sorareinside/client';
import { resolveSourcePlayer, type IdentityPlayer } from './sorareinside-identity';

const MAX_PRICE_AGE_MS = 48 * 60 * 60_000;
const priceSelect = { id: true, provider: true, contestId: true, leagueId: true, season: true,
  teamId: true, playerId: true, fotmobPlayerName: true, providerBirthDate: true, lastSeenAt: true } as const;
const mappingSelect = { provider: true, contestId: true, providerSeason: true, providerEntityType: true,
  providerEntityId: true, internalEntityType: true, internalEntityId: true, status: true } as const;
type Price = Prisma.FantasyPlayerPriceGetPayload<{ select: typeof priceSelect }>;
type Mapping = Prisma.ProviderEntityMapGetPayload<{ select: typeof mappingSelect }>;
export type SorareRosterEvidence = Price & { teamId: bigint; playerId: bigint; providerBirthDate: Date; fotmobPlayerName: string };
type Scope = { leagueId: bigint; season: string; teamId: bigint };
export type SorareRosterMember = { player: IdentityPlayer; active: boolean; position: string | null };
export type SorareRosterRepair = { source: SourcePlayer; evidence: SorareRosterEvidence };

function priceKey(row: Pick<Price, 'contestId' | 'season' | 'id'>) { return `${row.contestId}:${row.season}:${row.id}`; }
function day(date: Date) { return date.toISOString().slice(0, 10); }

export function verifiedSorareRosterEvidence(prices: Price[], maps: Mapping[], now: Date): SorareRosterEvidence[] {
  const mapped = new Map<string, Mapping[]>();
  for (const row of maps) {
    if (row.provider !== 'SPORTS_RU' || row.providerEntityType !== 'FANTASY_PLAYER_PRICE' || row.internalEntityType !== 'PLAYER') continue;
    const key = `${row.contestId}:${row.providerSeason}:${row.providerEntityId}`;
    mapped.set(key, [...(mapped.get(key) ?? []), row]);
  }
  const verified = prices.filter((row): row is SorareRosterEvidence => {
    const bindings = mapped.get(priceKey(row)) ?? [];
    return row.provider === 'SPORTS_RU' && row.teamId !== null && row.playerId !== null
      && row.providerBirthDate !== null && Boolean(row.fotmobPlayerName?.trim())
      && row.lastSeenAt.getTime() <= now.getTime() && now.getTime() - row.lastSeenAt.getTime() <= MAX_PRICE_AGE_MS
      && bindings.length === 1 && bindings[0].status === 'MATCHED' && bindings[0].internalEntityId === String(row.playerId);
  });
  // Multiple fantasy scopes may repeat a player, but cannot disagree on identity
  // or current club. A conflicting row contributes no alias or membership proof.
  const identities = new Map<string, Set<string>>();
  for (const row of verified) {
    const key = `${row.season}:${row.playerId}`;
    const values = identities.get(key) ?? new Set<string>();
    values.add(`${row.teamId}:${day(row.providerBirthDate)}`);
    identities.set(key, values);
  }
  return verified.filter(row => identities.get(`${row.season}:${row.playerId}`)?.size === 1);
}

export async function loadSorareRosterEvidence(db: PrismaClient, scopes: Array<{ leagueId: bigint; season: string }>, now: Date) {
  const prices = await db.fantasyPlayerPrice.findMany({ where: { provider: 'SPORTS_RU', OR: scopes,
    lastSeenAt: { gte: new Date(now.getTime() - MAX_PRICE_AGE_MS) }, playerId: { not: null }, providerBirthDate: { not: null } }, select: priceSelect });
  const maps = prices.length === 0 ? [] : await db.providerEntityMap.findMany({ where: { provider: 'SPORTS_RU',
    providerEntityType: 'FANTASY_PLAYER_PRICE', internalEntityType: 'PLAYER', providerEntityId: { in: prices.map(row => row.id) } }, select: mappingSelect });
  return verifiedSorareRosterEvidence(prices, maps, now);
}

export function sorareRosterIdentity(player: IdentityPlayer, evidence: readonly SorareRosterEvidence[]): IdentityPlayer {
  const rows = evidence.filter(row => row.playerId === player.id);
  if (rows.length === 0 || (player.birthDate && rows.some(row => day(row.providerBirthDate) !== day(player.birthDate!)))) return player;
  return { ...player, birthDate: player.birthDate ?? rows[0].providerBirthDate,
    aliases: [...new Set(rows.map(row => row.fotmobPlayerName))] };
}

export function corroboratedSorareRosterRepair(source: SourcePlayer, member: SorareRosterMember, scope: Scope,
  evidence: readonly SorareRosterEvidence[], activeOtherClub: boolean): SorareRosterRepair | null {
  if (member.active || !member.position || activeOtherClub || !source.birthDate) return null;
  const rows = evidence.filter(row => row.leagueId === scope.leagueId && row.season === scope.season
    && row.teamId === scope.teamId && row.playerId === member.player.id && day(row.providerBirthDate) === source.birthDate);
  if (rows.length === 0) return null;
  const identity = sorareRosterIdentity(member.player, rows);
  if (identity.birthDate && day(identity.birthDate) !== source.birthDate) return null;
  // Recheck the name independently even when a saved source UUID exists.
  if (resolveSourcePlayer(source, [identity]).player?.id !== member.player.id) return null;
  return { source, evidence: rows[0] };
}

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
export async function restoreSorareRosterMembers(tx: Prisma.TransactionClient, scope: Scope, repairs: SorareRosterRepair[]) {
  if (repairs.length === 0) return;
  const now = new Date();
  const ids = repairs.map(repair => repair.evidence.playerId);
  const prices = await tx.fantasyPlayerPrice.findMany({ where: { id: { in: repairs.map(repair => repair.evidence.id) } }, select: priceSelect });
  const maps = await tx.providerEntityMap.findMany({ where: { provider: 'SPORTS_RU', providerEntityType: 'FANTASY_PLAYER_PRICE',
    internalEntityType: 'PLAYER', providerEntityId: { in: prices.map(row => row.id) } }, select: mappingSelect });
  const evidence = verifiedSorareRosterEvidence(prices, maps, now);
  const members = await tx.teamPlayerSeason.findMany({ where: { leagueId: scope.leagueId, season: scope.season, playerId: { in: ids } },
    select: { teamId: true, playerId: true, active: true, position: true, player: { select: { id: true, name: true, birthDate: true } } } });
  for (const repair of repairs) {
    const currentEvidence = evidence.find(row => row.id === repair.evidence.id && row.playerId === repair.evidence.playerId
      && row.teamId === scope.teamId && row.contestId === repair.evidence.contestId && row.season === scope.season
      && row.leagueId === scope.leagueId && day(row.providerBirthDate) === day(repair.evidence.providerBirthDate));
    const member = members.find(row => row.teamId === scope.teamId && row.playerId === repair.evidence.playerId);
    const activeElsewhere = members.some(row => row.playerId === repair.evidence.playerId && row.teamId !== scope.teamId && row.active);
    if (!currentEvidence || !member || activeElsewhere || (!member.active && !corroboratedSorareRosterRepair(repair.source, member, scope, [currentEvidence], false))) {
      throw new Error('SorareInside: roster corroboration changed while applying');
    }
    if (member.active) continue;
    const result = await tx.teamPlayerSeason.updateMany({ where: { ...scope, playerId: member.playerId, active: false }, data: { active: true } });
    if (result.count !== 1) throw new Error('SorareInside: roster membership changed while applying');
  }
}
