/** @spec spec://modules/machete/FEAT-004-rotation-risk#contracts */
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateRotationRisk, type RotationRisk, type RotationObservation } from "@/machete/rotation-risk";

export type RotationPlayerInput = { playerId: string; kickoffAt: Date | null };
type HistoryRow = { playerId: bigint; matchId: bigint | null; matchDate: Date | null; started: boolean | null; lastPlayedAt: Date | null };

export async function loadRotationRisks(prisma: PrismaClient, players: readonly RotationPlayerInput[], now = new Date()): Promise<Map<string, RotationRisk>> {
  const unique = [...new Map(players.filter((p) => /^\d{1,19}$/.test(p.playerId) && BigInt(p.playerId) <= 9223372036854775807n).map((p) => [p.playerId, p])).values()];
  const result = new Map<string, RotationRisk>();
  for (let offset = 0; offset < unique.length; offset += 250) {
    const batch = unique.slice(offset, offset + 250);
    // Each lateral read is indexable by player_id. Only 50 known lineup rows
    // leave Postgres per player; no all-history array or per-player network round trip.
    const rows = await prisma.$queryRaw<HistoryRow[]>(Prisma.sql`
      SELECT p.id AS "playerId", h.match_id AS "matchId", h.match_date AS "matchDate", h.started,
             last_played.match_date AS "lastPlayedAt"
      FROM (VALUES ${Prisma.join(batch.map((p) => Prisma.sql`(${BigInt(p.playerId)}::bigint)`))}) AS p(id)
      LEFT JOIN LATERAL (
        SELECT s.match_id, m.match_date, s.started
        FROM match_player_stats s JOIN matches m ON m.id = s.match_id
        WHERE s.player_id = p.id AND s.started IS NOT NULL AND m.finished AND NOT m.cancelled AND m.match_date < ${now}
        ORDER BY m.match_date DESC, s.match_id DESC LIMIT 50
      ) h ON TRUE
      LEFT JOIN LATERAL (
        SELECT m.match_date FROM match_player_stats s JOIN matches m ON m.id = s.match_id
        WHERE s.player_id = p.id AND s.minutes > 0 AND m.finished AND NOT m.cancelled AND m.match_date < ${now}
        ORDER BY m.match_date DESC, s.match_id DESC LIMIT 1
      ) last_played ON TRUE`);
    const historyById = new Map<string, RotationObservation[]>();
    const lastById = new Map<string, Date>();
    for (const row of rows) {
      const id = String(row.playerId);
      if (row.matchId !== null && row.matchDate) {
        const history = historyById.get(id) ?? [];
        history.push({ matchId: String(row.matchId), matchDate: row.matchDate, started: row.started });
        historyById.set(id, history);
      }
      if (row.lastPlayedAt) lastById.set(id, row.lastPlayedAt);
    }
    for (const player of batch) result.set(player.playerId, calculateRotationRisk({ history: historyById.get(player.playerId) ?? [], lastPlayedAt: lastById.get(player.playerId) ?? null, kickoffAt: player.kickoffAt, observedAt: now }));
  }
  return result;
}
