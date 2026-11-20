import type { PrismaClient } from "@prisma/client";
import { firstKnownPlayerName } from "@/lib/players/display-name";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export async function resolveStoredPlayerExportNames(
  prisma: Pick<PrismaClient, "corePlayer">,
  rows: Array<Record<string, string | number | null>>
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
    select: { id: true, name: true }
  });
  for (const player of players) {
    for (const row of rowsById.get(player.id) ?? []) row.player = firstKnownPlayerName(player.name) || null;
  }
}
