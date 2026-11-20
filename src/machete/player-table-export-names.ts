import type { PrismaClient } from "@prisma/client";
import { firstKnownPlayerName } from "@/lib/players/display-name";

type ExportRow = Record<string, string | number | null>;
type PriceScope = { provider: string; leagueId: bigint; season: string };

function recordName(index: Map<string, string | null>, key: string, name: string) {
  if (!index.has(key)) index.set(key, name);
  else if (index.get(key) !== name) index.set(key, null);
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function resolvePoolExportNames(
  prisma: Pick<PrismaClient, "fantasyPlayerPrice" | "corePlayer">,
  rows: ExportRow[],
  scope: PriceScope
) {
  if (!rows.length) return;
  const ids = rows.flatMap((row) => typeof row.providerPlayerId === "string" ? [row.providerPlayerId] : []);
  const hasLegacyRows = ids.length < rows.length;
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: { ...scope, ...(hasLegacyRows ? {} : { providerPlayerId: { in: [...new Set(ids)] } }) },
    select: {
      providerPlayerId: true, playerName: true,
      ...(hasLegacyRows && {
        playerId: true, fotmobPlayerName: true, teamName: true, sportsTeamName: true,
        player: { select: { name: true } }, team: { select: { name: true } }
      })
    }
  });
  const byId = new Map<string, string | null>();
  const byTeamAndName = new Map<string, string | null>();
  for (const price of prices) {
    const name = firstKnownPlayerName(price.playerName);
    if (!name) continue;
    if (price.providerPlayerId) recordName(byId, price.providerPlayerId, name);
    if (!hasLegacyRows) continue;
    const aliases = [name, price.player?.name, price.fotmobPlayerName, price.playerId && `FotMob player ${price.playerId}`];
    for (const team of new Set([price.team?.name, price.teamName, price.sportsTeamName])) {
      if (!team) continue;
      for (const alias of aliases) {
        if (alias) recordName(byTeamAndName, JSON.stringify([team, alias]), name);
      }
    }
  }
  for (const row of rows) {
    const name = typeof row.providerPlayerId === "string"
      ? byId.get(row.providerPlayerId)
      : byTeamAndName.get(JSON.stringify([row.team, row.player]));
    if (name) row.player = name;
  }
  await resolveStoredPlayerExportNames(prisma, rows, scope);
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function resolveStoredPlayerExportNames(
  prisma: Pick<PrismaClient, "corePlayer">,
  rows: ExportRow[],
  scope: { provider: string; leagueId?: bigint; season?: string } = { provider: "SPORTS_RU" }
) {
  // A tab opened before the repair can submit just the old label in its player column.
  const rowsById = new Map<bigint, typeof rows>();
  for (const row of rows) {
    if (typeof row.player !== "string" || !row.player.trim() || firstKnownPlayerName(row.player)) continue;
    const idText = /^FotMob player\s+(\d{1,19})$/i.exec(row.player.trim())?.[1];
    row.player = null;
    if (!idText) continue;
    const id = BigInt(idText);
    if (id > 9223372036854775807n) continue;
    const matches = rowsById.get(id) ?? [];
    matches.push(row);
    rowsById.set(id, matches);
  }
  if (!rowsById.size) return;
  const players = await prisma.corePlayer.findMany({
    where: { id: { in: [...rowsById.keys()] } },
    select: { id: true, name: true, fantasyPrices: { where: scope, select: { playerName: true } } }
  });
  for (const player of players) {
    const priceNames = new Set(player.fantasyPrices.map((price) => firstKnownPlayerName(price.playerName)).filter(Boolean));
    const name = firstKnownPlayerName(priceNames.size === 1 ? [...priceNames][0] : null, player.name);
    for (const row of rowsById.get(player.id) ?? []) row.player = name || null;
  }
}
