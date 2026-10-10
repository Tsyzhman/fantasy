/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import { Prisma } from "@prisma/client";

/** Exact contest/provider IDs only. Official points, breakdown and timestamps stay intact. */
export async function reconcileFplScoreMappings(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  options: { contestId: string; gameweek?: number; batchSize?: number }
) {
  const batchSize = Math.max(1, Math.min(5000, options.batchSize ?? 5000));
  return tx.$executeRaw(Prisma.sql`
    WITH pending AS (
      SELECT s.id, p.player_id
      FROM fantasy_provider_player_match_scores s
      JOIN fantasy_player_prices p ON p.contest_id = s.contest_id
        AND p.provider = s.provider AND p.provider_player_id = s.provider_player_id
      WHERE s.provider = 'FPL' AND s.contest_id = ${options.contestId}
        AND s.status = 'OFFICIAL' AND p.player_id IS NOT NULL
        AND s.player_id IS DISTINCT FROM p.player_id
        ${options.gameweek == null ? Prisma.empty : Prisma.sql`AND s.gameweek = ${options.gameweek}`}
      ORDER BY s.id LIMIT ${batchSize} FOR UPDATE OF s SKIP LOCKED
    )
    UPDATE fantasy_provider_player_match_scores s SET player_id = pending.player_id
    FROM pending WHERE s.id = pending.id
  `);
}
