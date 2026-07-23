import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { createLogger } from "@/lib/logger";

import { createFotMobClient, extractPlayerSeasonAggregates, type FotMobClient } from "./client";
import type { FotMobPlayerSeasonAggregate } from "./types";

const logger = createLogger("fotmob-player-season-archives");
const DEFAULT_REFRESH_DAYS = 7;
const DEFAULT_BATCH_SIZE = 75;
const FULL_CURRENT_EVIDENCE_MINUTES = 900;

export type PlayerSeasonArchiveSyncOptions = {
  leagueId?: bigint;
  season?: string;
  teamId?: bigint;
  force?: boolean;
  batchSize?: number;
  now?: Date;
  client?: FotMobClient;
};

export async function syncMissingFotMobPlayerSeasonArchives(
  prisma: PrismaClient,
  options: PlayerSeasonArchiveSyncOptions = {}
) {
  const now = options.now ?? new Date();
  const refreshDays = integerEnv("FOTMOB_PLAYER_ARCHIVE_REFRESH_DAYS", DEFAULT_REFRESH_DAYS);
  const batchSize = options.batchSize ?? integerEnv("FOTMOB_PLAYER_ARCHIVE_BATCH_SIZE", DEFAULT_BATCH_SIZE);
  const refreshBefore = new Date(now.getTime() - refreshDays * 86_400_000);
  const currentScopes = await resolveArchiveSyncScopes(prisma, options);
  if (currentScopes.length === 0) return { candidates: 0, fetched: 0, archived: 0, skipped: 0, failed: 0 };

  const rosterRows = await prisma.teamPlayerSeason.findMany({
    where: {
      active: true,
      OR: currentScopes.map((scope) => ({
        leagueId: scope.leagueId,
        season: scope.season,
        ...(options.teamId ? { teamId: options.teamId } : {})
      }))
    },
    select: {
      playerId: true,
      teamId: true,
      player: { select: { rawRef: true } }
    }
  });
  const uniqueRoster = new Map(rosterRows.map((row) => [String(row.playerId), row]));
  const playerIds = [...uniqueRoster.values()].map((row) => row.playerId);
  const [fetchStates, currentStats] = await Promise.all([
    prisma.playerArchiveFetchState.findMany({ where: { playerId: { in: playerIds } } }),
    prisma.matchPlayerStat.findMany({
      where: {
        playerId: { in: playerIds },
        match: {
          OR: currentScopes.map((scope) => ({ leagueId: scope.leagueId, season: scope.season }))
        }
      },
      select: { playerId: true, minutes: true }
    })
  ]);
  const stateByPlayer = new Map(fetchStates.map((state) => [String(state.playerId), state]));
  const currentMinutesByPlayer = new Map<string, number>();
  for (const stat of currentStats) {
    const key = String(stat.playerId);
    currentMinutesByPlayer.set(key, (currentMinutesByPlayer.get(key) ?? 0) + Math.max(0, stat.minutes ?? 0));
  }

  const candidates = [...uniqueRoster.values()]
    .filter((row) => {
      const minutes = currentMinutesByPlayer.get(String(row.playerId)) ?? 0;
      if (minutes >= FULL_CURRENT_EVIDENCE_MINUTES && !options.force) return false;
      const state = stateByPlayer.get(String(row.playerId));
      return Boolean(options.force || !state?.lastSuccessAt || state.lastSuccessAt < refreshBefore);
    })
    .sort((left, right) =>
      (currentMinutesByPlayer.get(String(left.playerId)) ?? 0) - (currentMinutesByPlayer.get(String(right.playerId)) ?? 0)
    )
    .slice(0, Math.max(0, batchSize));

  const client = options.client ?? createFotMobClient();
  let fetched = 0;
  let archived = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const providerPlayerId = candidate.player.rawRef ?? String(candidate.playerId);
    try {
      const aggregates = client.getPlayerSeasonAggregates
        ? await client.getPlayerSeasonAggregates(providerPlayerId)
        : extractPlayerSeasonAggregates((await client.getPlayer(providerPlayerId)).raw, providerPlayerId);
      fetched += 1;
      const stored = await persistPlayerSeasonAggregates(prisma, candidate.playerId, providerPlayerId, aggregates, now);
      archived += stored;
      await prisma.playerArchiveFetchState.upsert({
        where: { playerId: candidate.playerId },
        create: {
          playerId: candidate.playerId,
          providerPlayerId,
          lastAttemptAt: now,
          lastSuccessAt: now,
          lastError: null,
          payloadHash: aggregatePayloadHash(aggregates),
          archivedRows: stored
        },
        update: {
          providerPlayerId,
          lastAttemptAt: now,
          lastSuccessAt: now,
          lastError: null,
          payloadHash: aggregatePayloadHash(aggregates),
          archivedRows: stored
        }
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown FotMob player archive error";
      await prisma.playerArchiveFetchState.upsert({
        where: { playerId: candidate.playerId },
        create: {
          playerId: candidate.playerId,
          providerPlayerId,
          lastAttemptAt: now,
          lastError: message.slice(0, 1000)
        },
        update: {
          providerPlayerId,
          lastAttemptAt: now,
          lastError: message.slice(0, 1000)
        }
      });
      logger.warn("FotMob player archive fetch failed.", { providerPlayerId, error: message });
      if (/TURNSTILE_REQUIRED|Verification required/i.test(message)) break;
    }
  }

  return {
    candidates: candidates.length,
    fetched,
    archived,
    skipped: Math.max(0, uniqueRoster.size - candidates.length),
    failed
  };
}

async function persistPlayerSeasonAggregates(
  prisma: PrismaClient,
  playerId: bigint,
  providerPlayerId: string,
  aggregates: FotMobPlayerSeasonAggregate[],
  fetchedAt: Date
) {
  let stored = 0;
  for (const aggregate of aggregates) {
    const scope = await resolveAggregateScope(prisma, aggregate);
    if (!scope) continue;
    const teamMatches = await prisma.coreMatch.count({
      where: {
        leagueId: scope.leagueId,
        season: aggregate.season,
        finished: true,
        OR: [{ homeTeamId: scope.teamId }, { awayTeamId: scope.teamId }]
      }
    });
    const data = {
      competitionName: aggregate.competitionName,
      providerPlayerId,
      providerTeamId: aggregate.teamId,
      providerLeagueId: aggregate.providerLeagueId,
      appearances: aggregate.appearances,
      starts: aggregate.starts,
      minutes: aggregate.minutes,
      goals: aggregate.goals,
      assists: aggregate.assists,
      yellowCards: aggregate.yellowCards,
      redCards: aggregate.redCards,
      teamMatches: teamMatches > 0 ? teamMatches : null,
      provenance: {
        identity: "FOTMOB_ID_AND_TEAM_SEASON_SCOPE",
        provider_team_name: aggregate.teamName,
        competition_name: aggregate.competitionName
      } satisfies Prisma.InputJsonValue,
      fetchedAt,
      lastSeenAt: fetchedAt
    };
    await prisma.playerSeasonArchive.upsert({
      where: {
        provider_leagueId_season_teamId_playerId_aggregateScope: {
          provider: "FOTMOB",
          leagueId: scope.leagueId,
          season: aggregate.season,
          teamId: scope.teamId,
          playerId,
          aggregateScope: aggregate.aggregateScope
        }
      },
      create: {
        ...data,
        provider: "FOTMOB",
        leagueId: scope.leagueId,
        season: aggregate.season,
        teamId: scope.teamId,
        playerId,
        aggregateScope: aggregate.aggregateScope
      },
      update: data
    });
    stored += 1;
  }
  return stored;
}

async function resolveAggregateScope(prisma: PrismaClient, aggregate: FotMobPlayerSeasonAggregate) {
  if (!/^\d+$/.test(aggregate.teamId)) return null;
  const teamId = BigInt(aggregate.teamId);
  const memberships = await prisma.leagueSeasonTeam.findMany({
    where: { teamId, season: aggregate.season },
    include: { leagueSeason: { include: { league: true } } }
  });
  const explicit = aggregate.providerLeagueId && /^\d+$/.test(aggregate.providerLeagueId)
    ? memberships.find((row) =>
        String(row.leagueId) === aggregate.providerLeagueId ||
        row.leagueSeason.league.rawRef === aggregate.providerLeagueId
      )
    : null;
  if (explicit) return { teamId, leagueId: explicit.leagueId };

  const nameMatches = memberships.filter((row) =>
    competitionMatchesLeague(aggregate.competitionName, row.leagueSeason.name ?? row.leagueSeason.league.name, row.leagueId)
  );
  return nameMatches.length === 1 ? { teamId, leagueId: nameMatches[0].leagueId } : null;
}

function competitionMatchesLeague(competitionName: string, leagueName: string, leagueId: bigint) {
  const competition = normalizedName(competitionName);
  const league = normalizedName(leagueName);
  if (competition && league && (competition.includes(league) || league.includes(competition))) return true;
  return leagueId === 338n && competition === "first league";
}

async function resolveArchiveSyncScopes(prisma: PrismaClient, options: PlayerSeasonArchiveSyncOptions) {
  if (options.leagueId && options.season) return [{ leagueId: options.leagueId, season: options.season }];
  return prisma.leagueSeason.findMany({
    where: {
      isCurrent: true,
      ...(options.leagueId ? { leagueId: options.leagueId } : {}),
      ...(options.season ? { season: options.season } : {})
    },
    select: { leagueId: true, season: true }
  });
}

function aggregatePayloadHash(aggregates: FotMobPlayerSeasonAggregate[]) {
  return createHash("sha256").update(JSON.stringify(aggregates)).digest("hex");
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

function integerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
