import { Prisma, type PrismaClient } from "@prisma/client";

import { currentSportsRuPhase } from "./foontasy_forecasts";
import { parseFantasyProviderRoundKey } from "./sports-trends";
import { applySquadFoontasyUpdate, type SquadFoontasyUpdate } from "./squad-player-dto";
import type { FantasyPlannerPlayer } from "./squad_logic";

type SquadFoontasyRound = {
  leagueId: bigint;
  season: string;
  sourceSeasonId: string;
  sourceRoundNumber: number;
  roundNumber: number;
};

type SquadFoontasyForecast = {
  playerId: bigint;
  points: number;
  selectedByPercent: number | null;
  fetchedAt: Date;
};

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round */
export function squadFoontasyRound(
  league: { leagueId: bigint; season: string },
  contestRules: unknown,
  roundKey: string | undefined
): SquadFoontasyRound | null {
  if (!roundKey) return null;
  const { ordinal, providerRoundId } = parseFantasyProviderRoundKey(roundKey);
  if (!ordinal || !providerRoundId) return null;

  const phase = currentSportsRuPhase(contestRules);
  if (!phase) return null;
  // Displayed labels and provider ordinals can repeat after a phase change.
  const index = phase.tours.findIndex((tour) => tour.id === providerRoundId);
  if (index < 0) return null;

  return {
    leagueId: league.leagueId,
    season: league.season,
    sourceSeasonId: phase.seasonId,
    sourceRoundNumber: index + 1,
    roundNumber: phase.canonicalOffset + index + 1
  };
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round */
export async function loadSquadFoontasyForecasts(
  prisma: PrismaClient,
  round: SquadFoontasyRound | null,
  playerIds?: readonly bigint[]
): Promise<SquadFoontasyForecast[]> {
  if (!round || playerIds?.length === 0) return [];

  const scope = Prisma.sql`
    league_id = ${round.leagueId} AND season = ${round.season} AND source_variant = 'sports'
    AND source_season_id = ${round.sourceSeasonId} AND source_round_number = ${round.sourceRoundNumber}
    AND round_number = ${round.roundNumber}
  `;
  const players = playerIds ? Prisma.sql`AND player_id IN (${Prisma.join(playerIds)})` : Prisma.empty;
  // A single statement selects the batch and its rows, even during an import.
  return prisma.$queryRaw<SquadFoontasyForecast[]>`
    SELECT DISTINCT ON (player_id) player_id AS "playerId", points,
      selected_by_percent AS "selectedByPercent", fetched_at AS "fetchedAt"
    FROM foontasy_forecasts
    WHERE ${scope}
      AND fetched_at = (SELECT max(fetched_at) FROM foontasy_forecasts WHERE ${scope})
      AND player_id IS NOT NULL ${players}
    ORDER BY player_id, updated_at DESC, source_player_id
  `;
}

export async function withSquadFoontasyForecasts<
  T extends Pick<FantasyPlannerPlayer, "playerId" | "foontasyPoints" | "foontasyFetchedAt">
>(prisma: PrismaClient, players: T[], round: SquadFoontasyRound | null) {
  const ids = players.filter((player) => /^\d+$/.test(player.playerId)).map((player) => BigInt(player.playerId));
  return applySquadFoontasyUpdate(players, squadFoontasyUpdate(await loadSquadFoontasyForecasts(prisma, round, ids)));
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round */
export async function loadSquadFoontasyUpdate(
  prisma: PrismaClient,
  round: SquadFoontasyRound | null,
  knownRevision: string | null
): Promise<SquadFoontasyUpdate | undefined> {
  const latest = round ? await prisma.foontasyForecast.aggregate({
    where: { ...round, sourceVariant: "sports" },
    _max: { fetchedAt: true }
  }) : null;
  const revision = latest?._max.fetchedAt?.toISOString() ?? "";
  if (revision === knownRevision) return undefined;

  return squadFoontasyUpdate(revision ? await loadSquadFoontasyForecasts(prisma, round) : [], revision);
}

function squadFoontasyUpdate(rows: SquadFoontasyForecast[], emptyRevision = ""): SquadFoontasyUpdate {
  return {
    revision: rows[0]?.fetchedAt.toISOString() ?? emptyRevision,
    pointsByPlayerId: Object.fromEntries(rows.map((row) => [String(row.playerId), row.points]))
  };
}
