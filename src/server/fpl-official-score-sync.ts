import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { reconcileFplScoreMappings } from "./fpl-score-reconciliation";
import {
  FPL_EVENT_LIVE_URL,
  FPL_LEAGUE_ID,
  FPL_PROVIDER,
  FPL_SEASON,
  FplPublicClient,
  latestFinalizedFplGameweek,
  type FplClientOptions,
  type FplLiveEvent
} from "@/lib/providers/fpl";

const FPL_LOCK_KEY = "fantasy-scout:fpl:official-score-sync";
const FPL_JOB_TYPE = "FPL_OFFICIAL_SCORE_SYNC";

export type FplOfficialScoreSyncResult = {
  status: "SYNCED" | "SKIPPED";
  contestId: string;
  gameweek: number;
  rows: number;
  mappedRows: number;
  unmatchedRows: number;
  payloadHash: string;
};

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
export async function syncFplOfficialScores(
  prisma: PrismaClient = defaultPrisma,
  options: {
    gameweek: number;
    client?: FplPublicClient;
    clientOptions?: FplClientOptions;
    now?: Date;
    trigger?: "STARTUP" | "SCHEDULED" | "MANUAL";
  }
): Promise<FplOfficialScoreSyncResult> {
  if (!Number.isInteger(options.gameweek) || options.gameweek < 1 || options.gameweek > 50) {
    throw new Error("FPL official score sync requires a valid gameweek.");
  }
  const now = options.now ?? new Date();
  const client = options.client ?? new FplPublicClient(options.clientOptions);
  const bootstrap = await client.getBootstrap();
  const finalizedGameweek = latestFinalizedFplGameweek(bootstrap.events, now)?.id ?? null;
  if (finalizedGameweek !== options.gameweek) {
    throw new Error(`FPL gameweek ${options.gameweek} is not finalized by the official data_checked gate.`);
  }
  const live = await client.getLiveEvent(options.gameweek);
  if (live.gameweek !== options.gameweek || live.elements.length === 0) {
    throw new Error(`FPL live event ${options.gameweek} returned no complete official rows.`);
  }
  const payloadHash = hashPayload(live);
  const trigger = options.trigger ?? "SCHEDULED";

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${FPL_LOCK_KEY}))`);
    const contest = await tx.fantasyContest.findUnique({
      where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
      select: { id: true }
    });
    if (!contest) throw new Error("FPL contest does not exist; synchronize FPL prices before official scores.");

    const providerPlayerIds = live.elements.map((row) => row.providerPlayerId);
    const priceRows = await tx.fantasyPlayerPrice.findMany({
      where: { contestId: contest.id, provider: FPL_PROVIDER, providerPlayerId: { in: providerPlayerIds } },
      select: { providerPlayerId: true, playerId: true, position: true },
      orderBy: { providerPlayerId: "asc" }
    });
    const mappingHash = createHash("sha256").update(JSON.stringify(priceRows.map((row) =>
      [row.providerPlayerId, row.playerId?.toString() ?? null, row.position]))).digest("hex");
    // Mapping changes are inputs even when the official payload is unchanged.
    const idempotencyKey = `${options.gameweek}:${payloadHash}:mapping:${mappingHash}`;
    await reconcileFplScoreMappings(tx, { contestId: contest.id });
    const existingRun = await tx.fantasyProviderSyncRun.findUnique({
      where: { provider_contestId_idempotencyKey: { provider: FPL_PROVIDER, contestId: contest.id, idempotencyKey } },
      select: { status: true }
    });
    if (existingRun?.status === "SUCCEEDED") {
      return {
        status: "SKIPPED",
        contestId: contest.id,
        gameweek: options.gameweek,
        rows: live.elements.length,
        mappedRows: priceRows.filter((row) => row.playerId && row.position).length,
        unmatchedRows: live.elements.length - priceRows.filter((row) => row.playerId && row.position).length,
        payloadHash
      };
    }

    const run = await tx.fantasyProviderSyncRun.upsert({
      where: { provider_contestId_idempotencyKey: { provider: FPL_PROVIDER, contestId: contest.id, idempotencyKey } },
      update: { status: "RUNNING", trigger, startedAt: now, finishedAt: null, errorMessage: null, sourceUrl: `${FPL_EVENT_LIVE_URL}/${options.gameweek}/live/`, payloadHash },
      create: {
        contestId: contest.id,
        provider: FPL_PROVIDER,
        leagueId: FPL_LEAGUE_ID,
        season: FPL_SEASON,
        jobType: FPL_JOB_TYPE,
        trigger,
        idempotencyKey,
        status: "RUNNING",
        startedAt: now,
        sourceUrl: `${FPL_EVENT_LIVE_URL}/${options.gameweek}/live/`,
        payloadHash
      },
      select: { id: true }
    });

    const mappedByProviderId = new Map(priceRows.flatMap((row) => row.providerPlayerId ? [[row.providerPlayerId, row] as const] : []));
    let mappedRows = 0;
    for (const element of live.elements) {
      const priceRow = mappedByProviderId.get(element.providerPlayerId);
      if (priceRow?.playerId && priceRow.position) mappedRows += 1;
      const scoringBreakdown = {
        ...element.stats,
        fixture_breakdowns: element.fixtureBreakdowns
      } as Prisma.InputJsonValue;
      await tx.fantasyProviderPlayerMatchScore.upsert({
        where: { contestId_providerEventId_providerPlayerId: { contestId: contest.id, providerEventId: String(options.gameweek), providerPlayerId: element.providerPlayerId } },
        update: {
          provider: FPL_PROVIDER,
          gameweek: options.gameweek,
          leagueId: FPL_LEAGUE_ID,
          season: FPL_SEASON,
          playerId: priceRow?.playerId ?? null,
          points: element.points,
          breakdown: scoringBreakdown,
          status: "OFFICIAL",
          sourceUrl: `${FPL_EVENT_LIVE_URL}/${options.gameweek}/live/`,
          fetchedAt: now
        },
        create: {
          contestId: contest.id,
          provider: FPL_PROVIDER,
          providerEventId: String(options.gameweek),
          providerPlayerId: element.providerPlayerId,
          gameweek: options.gameweek,
          leagueId: FPL_LEAGUE_ID,
          season: FPL_SEASON,
          playerId: priceRow?.playerId ?? null,
          points: element.points,
          breakdown: scoringBreakdown,
          status: "OFFICIAL",
          sourceUrl: `${FPL_EVENT_LIVE_URL}/${options.gameweek}/live/`,
          fetchedAt: now
        }
      });
    }
    const unmatchedRows = live.elements.length - mappedRows;
    await tx.fantasyProviderSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: now,
        counts: { gameweek: options.gameweek, rows: live.elements.length, mappedRows, unmatchedRows } as Prisma.InputJsonValue
      }
    });
    return {
      status: "SYNCED",
      contestId: contest.id,
      gameweek: options.gameweek,
      rows: live.elements.length,
      mappedRows,
      unmatchedRows,
      payloadHash
    } satisfies FplOfficialScoreSyncResult;
  }, { maxWait: 10_000, timeout: 30_000 });
}

function hashPayload(live: FplLiveEvent) {
  return createHash("sha256").update(JSON.stringify(live.payload)).digest("hex");
}
