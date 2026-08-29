export const progressiveFantasyPlayerPoolBatchSize = 64;

type ProgressivePlayerPoolPlayer = {
  playerId: string;
  ownershipPercent?: number | null;
};

export type ProgressiveFantasyPlayerPoolPage<T> = {
  players: T[];
  pageInfo: {
    nextCursor: string | null;
    loadedPlayers: number;
    totalPlayers: number;
    complete: boolean;
    batchSize: number;
    strategy: "SQUAD_THEN_POPULARITY";
    phase: "POOL";
  };
};

export function orderProgressiveFantasyPlayerPool<T extends ProgressivePlayerPoolPlayer>(
  players: readonly T[],
  priorityPlayerIds: readonly string[]
) {
  const priorityRank = new Map<string, number>();
  for (const playerId of priorityPlayerIds) {
    if (!priorityRank.has(playerId)) priorityRank.set(playerId, priorityRank.size);
  }

  return players
    .map((player, index) => ({ player, index }))
    .sort((left, right) => {
      const leftPriority = priorityRank.get(left.player.playerId);
      const rightPriority = priorityRank.get(right.player.playerId);
      if (leftPriority !== undefined || rightPriority !== undefined) {
        if (leftPriority === undefined) return 1;
        if (rightPriority === undefined) return -1;
        return leftPriority - rightPriority;
      }

      const popularityDifference = fantasyPlayerPopularity(right.player) - fantasyPlayerPopularity(left.player);
      return popularityDifference || left.index - right.index;
    })
    .map(({ player }) => player);
}

export function parseProgressiveFantasyPlayerPoolCursor(value: string | null) {
  if (value === null || value === "") return 0;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function progressiveFantasyPlayerPoolPage<T>(
  players: readonly T[],
  cursor: number,
  batchSize = progressiveFantasyPlayerPoolBatchSize
): ProgressiveFantasyPlayerPoolPage<T> {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid progressive player-pool cursor.");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid progressive player-pool batch size.");

  const start = Math.min(cursor, players.length);
  const end = Math.min(start + batchSize, players.length);
  return {
    players: players.slice(start, end),
    pageInfo: {
      nextCursor: end < players.length ? String(end) : null,
      loadedPlayers: end,
      totalPlayers: players.length,
      complete: end >= players.length,
      batchSize,
      strategy: "SQUAD_THEN_POPULARITY",
      phase: "POOL"
    }
  };
}

function fantasyPlayerPopularity(player: ProgressivePlayerPoolPlayer) {
  const value = player.ownershipPercent;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : -1;
}
