import type { PrismaClient } from "@prisma/client";
import type { CsvColumn } from "@/lib/csv";
import { compactPlayerDisplayName, firstKnownPlayerName } from "@/lib/players/display-name";

type ExportRow = Record<string, string | number | null>;
type PriceScope = { provider: string; leagueId: bigint; season: string };
type CoreName = { id: bigint; name: string; source: string };
type PriceName = { playerName: string; player: CoreName | null };
type NameScope = { provider: string; leagueId?: bigint; season?: string };

function coreId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return null;
  const id = BigInt(value);
  return id <= 9223372036854775807n ? id : null;
}

function technicalId(value: unknown) {
  return typeof value === "string" ? coreId(/^FotMob player\s+(\d+)$/i.exec(value.trim())?.[1]) : null;
}

function fotMobName(player: CoreName | null | undefined) {
  return player?.source === "fotmob" ? firstKnownPlayerName(player.name) || null : null;
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export function fotMobExportColumns<T>(fullName: (row: T) => string | null | undefined, language: "ru" | "en"): CsvColumn<T>[] {
  return [
    { header: language === "ru" ? "Сокращённое имя FotMob" : "FotMob short name", value: row => compactPlayerDisplayName(fullName(row) ?? "") || null },
    { header: language === "ru" ? "Полное имя FotMob" : "FotMob full name", value: row => fullName(row) ?? null }
  ];
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function loadFotMobExportNames(prisma: Pick<PrismaClient, "corePlayer">, playerIds: string[]) {
  const ids = [...new Set(playerIds.map(coreId).filter((id): id is bigint => id !== null))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const players = await prisma.corePlayer.findMany({
    where: { source: "fotmob", id: { in: ids } }, select: { id: true, name: true }
  });
  for (const player of players) {
    const name = firstKnownPlayerName(player.name);
    if (name) names.set(String(player.id), name);
  }
  return names;
}

function indexUnique<T>(index: Map<string, T | null>, key: string, item: T, same: (a: T, b: T) => boolean) {
  if (!index.has(key)) index.set(key, item);
  else {
    const previous = index.get(key);
    if (previous && !same(previous, item)) index.set(key, null);
  }
}

function samePriceIdentity(a: PriceName, b: PriceName) {
  return a.playerName === b.playerName && a.player?.id === b.player?.id;
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function resolvePoolExportNames(
  prisma: Pick<PrismaClient, "fantasyPlayerPrice" | "corePlayer">,
  rows: ExportRow[],
  scope: PriceScope
) {
  const names = new Map<ExportRow, string | null>();
  if (!rows.length) return names;
  const providerIds = new Set<string>();
  const coreIds = new Set<bigint>();
  let legacy = false;
  for (const row of rows) {
    const id = coreId(row.playerId);
    if (typeof row.providerPlayerId === "string") providerIds.add(row.providerPlayerId);
    else if (id) coreIds.add(id);
    else legacy = true;
  }
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: { ...scope, ...(!legacy && { OR: [
      ...(providerIds.size ? [{ providerPlayerId: { in: [...providerIds] } }] : []),
      ...(coreIds.size ? [{ playerId: { in: [...coreIds] } }] : [])
    ] }) },
    select: {
      providerPlayerId: true, playerName: true, playerId: true,
      player: { select: { id: true, name: true, source: true } },
      ...(legacy && { fotmobPlayerName: true, teamName: true, sportsTeamName: true, team: { select: { name: true } } })
    }
  });
  const byProvider = new Map<string, PriceName | null>();
  const byCore = new Map<string, PriceName | null>();
  const byTeamAndName = new Map<string, PriceName | null>();
  for (const price of prices) {
    if (price.providerPlayerId) indexUnique(byProvider, price.providerPlayerId, price, samePriceIdentity);
    if (price.playerId) indexUnique(byCore, String(price.playerId), price, samePriceIdentity);
    if (!legacy) continue;
    const aliases = [price.playerName, price.player?.name, price.fotmobPlayerName, price.playerId && `FotMob player ${price.playerId}`];
    for (const team of new Set([price.team?.name, price.teamName, price.sportsTeamName])) {
      if (!team) continue;
      for (const alias of aliases) {
        if (alias) indexUnique(byTeamAndName, JSON.stringify([team, alias]), price, samePriceIdentity);
      }
    }
  }
  const unresolved: ExportRow[] = [];
  for (const row of rows) {
    const price = typeof row.providerPlayerId === "string" ? byProvider.get(row.providerPlayerId)
      : coreId(row.playerId) ? byCore.get(String(row.playerId)) : byTeamAndName.get(JSON.stringify([row.team, row.player]));
    if (price) {
      row.player = firstKnownPlayerName(price.playerName, typeof row.player === "string" ? row.player : null, price.player?.name) || null;
      names.set(row, fotMobName(price.player));
    } else if (price === undefined && (coreId(row.playerId) || technicalId(row.player))) {
      unresolved.push(row);
    } else if (typeof row.player === "string" && !firstKnownPlayerName(row.player)) row.player = null;
  }
  if (unresolved.length) {
    const fallback = await resolveStoredPlayerExportNames(prisma, unresolved, scope);
    for (const [row, name] of fallback) names.set(row, name);
  }
  return names;
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function resolveStoredPlayerExportNames(
  prisma: Pick<PrismaClient, "corePlayer">, rows: ExportRow[], scope: NameScope = { provider: "SPORTS_RU" }
) {
  const names = new Map<ExportRow, string | null>();
  const ids = new Set<bigint>();
  const legacyNames = new Set<string>();
  const rowIds = new Map<ExportRow, bigint>();
  let repairLabels = false;
  for (const row of rows) {
    const id = coreId(row.playerId) ?? technicalId(row.player);
    if (id) { ids.add(id); rowIds.set(row, id); }
    if (typeof row.player !== "string") {
      if (id && row.player === null) repairLabels = true;
      continue;
    }
    const name = firstKnownPlayerName(row.player);
    if (!name) { row.player = null; if (id) repairLabels = true; }
    else if (!id) legacyNames.add(name);
  }
  if (!legacyNames.size && !repairLabels) {
    const byId = await loadFotMobExportNames(prisma, [...ids].map(String));
    for (const [row, id] of rowIds) names.set(row, byId.get(String(id)) ?? null);
    return names;
  }

  // Older tabs can send a provider label or a technical ID without the core ID.
  const labels = [...legacyNames];
  const players = await prisma.corePlayer.findMany({
    where: { OR: [
      ...(ids.size ? [{ id: { in: [...ids] } }] : []),
      ...(labels.length ? [{ name: { in: labels } }, { fantasyPrices: { some: { ...scope, playerName: { in: labels } } } }] : [])
    ] },
    select: { id: true, name: true, source: true, fantasyPrices: { where: scope, select: {
      playerName: true, ...(labels.length > 0 && { teamName: true, sportsTeamName: true, team: { select: { name: true } } })
    } } }
  });
  const byId = new Map(players.map(player => [player.id, player]));
  const byLabel = new Map<string, CoreName | null>();
  const byTeam = new Map<string, CoreName | null>();
  const samePlayer = (a: CoreName, b: CoreName) => a.id === b.id;
  for (const player of (legacyNames.size ? players : [])) {
    if (legacyNames.has(player.name)) indexUnique(byLabel, player.name, player, samePlayer);
    for (const price of player.fantasyPrices) {
      for (const alias of [price.playerName, player.name]) {
        if (!legacyNames.has(alias)) continue;
        indexUnique(byLabel, alias, player, samePlayer);
        for (const team of [price.team?.name, price.teamName, price.sportsTeamName]) {
          if (team) indexUnique(byTeam, JSON.stringify([team, alias]), player, samePlayer);
        }
      }
    }
  }
  for (const row of rows) {
    const id = rowIds.get(row);
    if (id) {
      const player = byId.get(id);
      names.set(row, fotMobName(player));
      if (row.player === null && player) {
        const prices = new Set(player.fantasyPrices.map(p => firstKnownPlayerName(p.playerName)).filter(Boolean));
        row.player = firstKnownPlayerName(prices.size === 1 ? [...prices][0] : null, player.name) || null;
      }
    } else if (typeof row.player === "string") {
      const label = row.player.trim();
      const key = JSON.stringify([row.team, label]);
      const player = byTeam.has(key) ? byTeam.get(key) : byLabel.get(label);
      names.set(row, fotMobName(player));
    }
  }
  return names;
}
