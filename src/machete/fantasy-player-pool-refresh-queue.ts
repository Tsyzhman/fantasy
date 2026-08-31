import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { createLogger } from "@/lib/logger";

export type StartingXiTeamsChanged = {
  leagueId: bigint;
  season: string;
  teamIds: readonly bigint[];
};

// Enqueue inside the flag transaction: either both the flags and their refresh
// request commit, or neither does. No forecast calculation runs in the writer.
export type StartingXiTeamsChangedListener = (
  input: StartingXiTeamsChanged,
  tx: Prisma.TransactionClient
) => void | Promise<void>;

type QueueWriter = Pick<Prisma.TransactionClient, "$executeRaw">;
type TeamSnapshotRefresher = (
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; teamIds: bigint[] }
) => Promise<{ id: string } | null>;

const logger = createLogger("fantasy-player-pool-refresh-queue");
const queueBatchSize = 200;

export async function enqueueCurrentXiTeamsSnapshotRefresh(
  prisma: QueueWriter,
  input: StartingXiTeamsChanged
): Promise<void> {
  const teamIds = [...new Set(input.teamIds.map(String))].sort();
  if (teamIds.length === 0) return;
  const values = teamIds.map((teamId) => Prisma.sql`(
    ${randomUUID()}, ${input.leagueId}, ${input.season}, ${BigInt(teamId)},
    ${randomUUID()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 second',
    0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "fantasy_player_pool_refresh_requests"
      ("id", "league_id", "season", "team_id", "request_token", "requested_at", "available_at", "attempts", "created_at", "updated_at")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("league_id", "season", "team_id") DO UPDATE SET
      "request_token" = EXCLUDED."request_token",
      "requested_at" = EXCLUDED."requested_at",
      "available_at" = EXCLUDED."available_at",
      "attempts" = 0,
      "last_error" = NULL,
      "updated_at" = EXCLUDED."updated_at"
  `);
}

export async function drainCurrentXiTeamSnapshotRefreshQueue(
  prisma: PrismaClient,
  refreshTeams: TeamSnapshotRefresher = refreshCurrentXiTeamsInWorker
) {
  const requests = await prisma.fantasyPlayerPoolRefreshRequest.findMany({
    where: { availableAt: { lte: new Date() } },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: queueBatchSize
  });
  const scopes = new Map<string, typeof requests>();
  for (const request of requests) {
    const key = `${request.leagueId}:${request.season}`;
    const batch = scopes.get(key);
    if (batch) batch.push(request);
    else scopes.set(key, [request]);
  }
  const result = { requests: requests.length, scopes: scopes.size, completed: 0, failed: 0 };
  for (const batch of scopes.values()) {
    const first = batch[0];
    if (!first) continue;
    const input = {
      leagueId: first.leagueId,
      season: first.season,
      teamIds: batch.map((request) => request.teamId)
    };
    try {
      const snapshot = await refreshTeams(prisma, input);
      // A later event changes the token, even within the same millisecond.
      // Never acknowledge a flag change that arrived during this calculation.
      const deleted = await prisma.fantasyPlayerPoolRefreshRequest.deleteMany({
        where: { OR: batch.map(({ id, requestToken }) => ({ id, requestToken })) }
      });
      result.completed += deleted.count;
      logger.info("Processed CURRENT_XI team refresh requests.", {
        leagueId: String(input.leagueId),
        season: input.season,
        teamIds: input.teamIds.map(String),
        snapshotId: snapshot?.id ?? null,
        acknowledged: deleted.count
      });
    } catch (error) {
      result.failed += batch.length;
      for (const request of batch) {
        await prisma.fantasyPlayerPoolRefreshRequest.updateMany({
          where: { id: request.id, requestToken: request.requestToken },
          data: {
            attempts: Math.min(request.attempts + 1, 30),
            lastError: errorMessage(error).slice(0, 2_000),
            availableAt: new Date(Date.now() + fantasyPlayerPoolRefreshRetryDelayMs(request.attempts))
          }
        });
      }
      logger.error("CURRENT_XI refresh failed; preserved READY snapshot and queued a bounded-backoff retry.", {
        leagueId: String(input.leagueId),
        season: input.season,
        teamIds: input.teamIds.map(String),
        error: errorMessage(error)
      });
    }
  }
  return result;
}

export function fantasyPlayerPoolRefreshRetryDelayMs(previousAttempts: number) {
  return Math.min(300_000, 5_000 * 2 ** Math.min(Math.max(0, previousAttempts), 6));
}

async function refreshCurrentXiTeamsInWorker(
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; teamIds: bigint[] }
) {
  // The web process only imports the small enqueue helper above.
  const { refreshCurrentXiTeamsSnapshot } = await import("@/machete/fantasy-player-pool-snapshots");
  return refreshCurrentXiTeamsSnapshot(prisma, input);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
