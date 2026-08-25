import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { fantasySquadLeagueFotMobIds, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";
import { defaultFantasyHistorySettings } from "@/machete/squad-history-settings";
import { toFantasyPlayerPoolListItem } from "@/machete/squad-player-dto";
import {
  fantasyProviderRoundKey,
  loadCachedFantasySquadPlayerPool,
  sportsRuSeasonAliases
} from "@/machete/squad_planner";
import type { SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import type { FantasyPlannerPlayer } from "@/machete/squad_logic";

export const SQUAD_PLANNING_SNAPSHOT_LEAD_MS = 60 * 1_000;
export const SQUAD_PLANNING_SNAPSHOT_SYSTEM_USER_ID = "squad-planning-snapshot";
export const SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS = 30 * 1_000;
const CAPTURE_RETRY_DELAY_MS = SQUAD_PLANNING_SNAPSHOT_RETRY_DELAY_MS;
const CAPTURE_GRACE_MS = 15 * 60 * 1_000;
const SCHEDULE_LOOKAHEAD_MS = 60 * 24 * 60 * 60 * 1_000;
const CAPTURE_CONCURRENCY = 4;
const MAX_CAPTURES_PER_SYNC = 32;

export const SQUAD_PLANNING_SNAPSHOT_STATUS_PENDING = "PENDING";
export const SQUAD_PLANNING_SNAPSHOT_STATUS_READY = "READY";
export const SQUAD_PLANNING_SNAPSHOT_STATUS_FAILED = "FAILED";

export type SquadPlanningScheduleMatch = {
  id: bigint;
  round: string | null;
  matchDate: Date | null;
  cancelled: boolean;
  finished: boolean;
};

export type SquadPlanningRoundGroup = {
  leagueId: bigint;
  season: string;
  roundKey: string;
  roundLabel: string | null;
  firstKickoffAt: Date;
  matchIds: bigint[];
};

export type SquadPlanningSyncResult = {
  scopes: number;
  created: number;
  updated: number;
  due: number;
  captured: number;
  failed: number;
};

export function squadPlanningRoundKey(round: string | null, matchId?: bigint) {
  const label = round?.trim();
  if (label) return `round:${label.toLocaleLowerCase("en-US")}`;
  return matchId === undefined ? "round:unknown" : `match:${matchId}`;
}

/**
 * Groups a FotMob schedule into tours and keeps only rounds whose snapshot
 * window is still relevant: the first kickoff is inside the planning horizon
 * and at least one match has not finished yet.
 */
export function groupSquadPlanningRounds(
  leagueId: bigint,
  season: string,
  matches: readonly SquadPlanningScheduleMatch[],
  now: Date
): SquadPlanningRoundGroup[] {
  const horizonStart = now.getTime() - CAPTURE_GRACE_MS;
  const horizonEnd = now.getTime() + SCHEDULE_LOOKAHEAD_MS;
  const groups = new Map<string, { label: string | null; firstKickoffAt: Date; matchIds: bigint[]; allFinished: boolean }>();

  for (const match of matches) {
    if (!match.matchDate || match.cancelled) continue;
    const kickoff = match.matchDate.getTime();
    if (kickoff < horizonStart || kickoff > horizonEnd) continue;
    const key = squadPlanningRoundKey(match.round, match.id);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        label: match.round?.trim() || null,
        firstKickoffAt: match.matchDate,
        matchIds: [match.id],
        allFinished: match.finished
      });
      continue;
    }
    if (kickoff < current.firstKickoffAt.getTime()) current.firstKickoffAt = match.matchDate;
    if (!current.label && match.round?.trim()) current.label = match.round.trim();
    current.matchIds.push(match.id);
    current.allFinished = current.allFinished && match.finished;
  }

  return [...groups.entries()]
    .filter(([, group]) => !group.allFinished)
    .map(([roundKey, group]) => ({
      leagueId,
      season,
      roundKey,
      roundLabel: group.label,
      firstKickoffAt: group.firstKickoffAt,
      matchIds: [...group.matchIds]
    }));
}

export function isCapturableSquadPlanningSnapshot(
  snapshot: {
    status: string;
    dueAt: Date;
    firstKickoffAt: Date;
    nextAttemptAt: Date | null;
  },
  now: Date
) {
  if (snapshot.status !== SQUAD_PLANNING_SNAPSHOT_STATUS_PENDING) return false;
  if (snapshot.dueAt.getTime() > now.getTime()) return false;
  if (snapshot.nextAttemptAt && snapshot.nextAttemptAt.getTime() > now.getTime()) return false;
  return true;
}

export function squadPlanningCaptureDeadline(firstKickoffAt: Date) {
  return firstKickoffAt.getTime() + CAPTURE_GRACE_MS;
}

async function loadCurrentFantasyLeagueSeasons(prisma: PrismaClient) {
  const rows = await prisma.leagueSeason.findMany({
    where: {
      leagueId: { in: fantasySquadLeagueFotMobIds.map((id) => BigInt(id)) },
      isCurrent: true
    },
    include: { league: true },
    orderBy: [{ leagueId: "asc" }, { season: "desc" }]
  });
  return rows.map<SharedLeagueSeasonOption>((row) => ({
    leagueId: row.leagueId,
    season: row.season,
    name: row.name ?? row.league.name,
    displayName: macheteLeagueDisplayName({
      id: String(row.leagueId),
      name: row.name ?? row.league.name,
      country: row.country ?? row.league.country,
      providerLeagueId: String(row.leagueId)
    }),
    country: row.country ?? row.league.country,
    providerLeagueId: String(row.leagueId),
    isCurrent: row.isCurrent,
    updatedAt: row.updatedAt
  }));
}

/**
 * Mirrors the provider resolution of the squad planner: FPL contests are keyed
 * by the fixed FPL season, every other provider accepts Sports.ru aliases.
 */
export async function resolveSquadPlanningProviders(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const contests = await prisma.fantasyContest.findMany({
    where: {
      leagueId: league.leagueId,
      OR: [
        { provider: FPL_PROVIDER, season: FPL_SEASON },
        { provider: { not: FPL_PROVIDER }, season: { in: sportsRuSeasonAliases(league.season) } }
      ]
    },
    select: { id: true, provider: true, lastSyncedAt: true },
    orderBy: { lastSyncedAt: "desc" }
  });
  const providers = new Map<string, string>();
  for (const contest of contests) {
    if (!providers.has(contest.provider)) providers.set(contest.provider, contest.id);
  }
  return [...providers.entries()].map(([provider, contestId]) => ({ provider, contestId }));
}

export type SquadPlanningProviderRoundInput = {
  providerRoundId: string;
  ordinal: number;
  name: string;
  startsAt: Date | null;
  fixtures: ReadonlyArray<{ kickoffAt: Date | null; status: string | null }>;
};

export type SquadPlanningProviderRoundGroup = {
  roundKey: string;
  roundLabel: string | null;
  firstKickoffAt: Date;
};

/**
 * Turns synced provider tours (Sports.ru is the source of truth for fantasy
 * tours) into snapshot groups. The first kickoff of a tour is the earliest
 * non-cancelled fixture kickoff; cancelled and postponed fixtures are ignored.
 */
export function groupSquadPlanningProviderRounds(
  provider: string,
  rounds: readonly SquadPlanningProviderRoundInput[]
): SquadPlanningProviderRoundGroup[] {
  return rounds.flatMap((round): SquadPlanningProviderRoundGroup[] => {
    const firstKickoffAt = round.fixtures
      .filter((fixture) => !["CANCELLED", "POSTPONED"].includes(fixture.status?.toUpperCase() ?? ""))
      .map((fixture) => fixture.kickoffAt)
      .filter((kickoff): kickoff is Date => kickoff !== null)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? round.startsAt;
    if (!firstKickoffAt) return [];
    return [{
      roundKey: fantasyProviderRoundKey(provider, round.ordinal, round.providerRoundId),
      roundLabel: round.name,
      firstKickoffAt
    }];
  });
}

function withinSnapshotHorizon(firstKickoffAt: Date, now: Date) {
  const kickoff = firstKickoffAt.getTime();
  return kickoff >= now.getTime() - CAPTURE_GRACE_MS && kickoff <= now.getTime() + SCHEDULE_LOOKAHEAD_MS;
}

async function planSquadPlanningSnapshotSchedule(
  prisma: PrismaClient,
  now: Date
): Promise<Pick<SquadPlanningSyncResult, "scopes" | "created" | "updated">> {
  const leagues = await loadCurrentFantasyLeagueSeasons(prisma);
  let created = 0;
  let updated = 0;
  let scopes = 0;

  for (const league of leagues) {
    const providers = await resolveSquadPlanningProviders(prisma, league);
    if (providers.length === 0) continue;

    const existingSnapshots = await prisma.squadPlanningSnapshot.findMany({
      where: { leagueId: league.leagueId, season: league.season },
      select: { id: true, provider: true, roundKey: true, firstKickoffAt: true }
    });
    const existingByKey = new Map(existingSnapshots.map((row) => [`${row.provider}:${row.roundKey}`, row]));

    for (const providerScope of providers) {
      // Provider tours (Sports.ru) are the authoritative source for tour
      // boundaries; the FotMob schedule is only a fallback for scopes whose
      // provider rounds have not been synchronized.
      let rounds: SquadPlanningRoundGroup[] = [];
      if (providerScope.contestId) {
        const providerRounds = await prisma.fantasyProviderRound.findMany({
          where: { contestId: providerScope.contestId, provider: providerScope.provider },
          select: {
            providerRoundId: true,
            ordinal: true,
            name: true,
            startsAt: true,
            fixtures: { select: { kickoffAt: true, status: true } }
          },
          orderBy: { ordinal: "asc" }
        });
        rounds = groupSquadPlanningProviderRounds(providerScope.provider, providerRounds).map((round) => ({
          ...round,
          leagueId: league.leagueId,
          season: league.season,
          matchIds: []
        }));
      }
      if (rounds.length === 0) {
        const matches = await prisma.coreMatch.findMany({
          where: { leagueId: league.leagueId, season: league.season },
          select: { id: true, round: true, matchDate: true, cancelled: true, finished: true }
        });
        rounds = groupSquadPlanningRounds(league.leagueId, league.season, matches, now);
      }

      for (const round of rounds) {
        if (!withinSnapshotHorizon(round.firstKickoffAt, now)) continue;
        scopes += 1;
        const dueAt = new Date(round.firstKickoffAt.getTime() - SQUAD_PLANNING_SNAPSHOT_LEAD_MS);
        const existing = existingByKey.get(`${providerScope.provider}:${round.roundKey}`);
        if (existing) {
          if (existing.firstKickoffAt.getTime() !== round.firstKickoffAt.getTime()) {
            await prisma.squadPlanningSnapshot.update({
              where: { id: existing.id },
              data: { firstKickoffAt: round.firstKickoffAt, dueAt }
            });
            updated += 1;
          }
          continue;
        }
        await prisma.squadPlanningSnapshot.create({
          data: {
            provider: providerScope.provider,
            leagueId: round.leagueId,
            season: round.season,
            roundKey: round.roundKey,
            roundLabel: round.roundLabel,
            contestId: providerScope.contestId,
            firstKickoffAt: round.firstKickoffAt,
            dueAt
          }
        });
        created += 1;
      }
    }
  }

  return { scopes, created, updated };
}

function canonicalPlayerPayload(players: readonly FantasyPlannerPlayer[]) {
  return players.map(toFantasyPlayerPoolListItem);
}

export function squadPlanningPayloadHash(players: readonly FantasyPlannerPlayer[]) {
  const payload = canonicalPlayerPayload(players);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function captureDueSquadPlanningSnapshots(
  prisma: PrismaClient,
  now: Date
): Promise<Pick<SquadPlanningSyncResult, "due" | "captured" | "failed">> {
  const candidates = await prisma.squadPlanningSnapshot.findMany({
    where: {
      status: SQUAD_PLANNING_SNAPSHOT_STATUS_PENDING,
      dueAt: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
    },
    orderBy: { dueAt: "asc" },
    take: MAX_CAPTURES_PER_SYNC
  });
  const due = candidates.filter((snapshot) => isCapturableSquadPlanningSnapshot(snapshot, now));
  let captured = 0;
  let failed = 0;

  // Many leagues share the same first kickoff slot, so captures run in
  // parallel batches to finish well inside the one-minute pre-kickoff window.
  for (let index = 0; index < due.length; index += CAPTURE_CONCURRENCY) {
    const batch = due.slice(index, index + CAPTURE_CONCURRENCY);
    const results = await Promise.all(batch.map((snapshot) => captureSnapshot(prisma, snapshot, now)));
    for (const result of results) {
      if (result === "captured") captured += 1;
      else failed += 1;
    }
  }

  return { due: due.length, captured, failed };
}

type CaptureOutcome = "captured" | "failed";

async function captureSnapshot(
  prisma: PrismaClient,
  snapshot: { id: string; provider: string; leagueId: bigint; season: string; contestId: string | null; firstKickoffAt: Date },
  now: Date
): Promise<CaptureOutcome> {
  if (now.getTime() > squadPlanningCaptureDeadline(snapshot.firstKickoffAt)) {
    await prisma.squadPlanningSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: SQUAD_PLANNING_SNAPSHOT_STATUS_FAILED,
        lastError: "Capture window closed before the squad table could be stored."
      }
    });
    return "failed";
  }
  try {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { leagueId_season: { leagueId: snapshot.leagueId, season: snapshot.season } },
      include: { league: true }
    });
    if (!leagueSeason) throw new Error(`League season ${snapshot.leagueId}:${snapshot.season} was not found.`);
    const league: SharedLeagueSeasonOption = {
      leagueId: leagueSeason.leagueId,
      season: leagueSeason.season,
      name: leagueSeason.name ?? leagueSeason.league.name,
      displayName: macheteLeagueDisplayName({
        id: String(leagueSeason.leagueId),
        name: leagueSeason.name ?? leagueSeason.league.name,
        country: leagueSeason.country ?? leagueSeason.league.country,
        providerLeagueId: String(leagueSeason.leagueId)
      }),
      country: leagueSeason.country ?? leagueSeason.league.country,
      providerLeagueId: String(leagueSeason.leagueId),
      isCurrent: leagueSeason.isCurrent,
      updatedAt: leagueSeason.updatedAt
    };
    const players = await loadCachedFantasySquadPlayerPool(
      prisma,
      SQUAD_PLANNING_SNAPSHOT_SYSTEM_USER_ID,
      league,
      defaultFantasyHistorySettings,
      snapshot.provider,
      snapshot.contestId ?? undefined
    );
    if (!players || players.length === 0) throw new Error("The planner returned an empty player pool.");
    const payloadHash = squadPlanningPayloadHash(players);
    // Prisma JSON input rejects Date instances; the DTO already carries dates
    // as strings, but round-tripping guarantees a plain JSON document.
    const payload = JSON.parse(JSON.stringify(canonicalPlayerPayload(players)));
    await prisma.squadPlanningSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: SQUAD_PLANNING_SNAPSHOT_STATUS_READY,
        capturedAt: now,
        playersCount: players.length,
        players: payload,
        payloadHash,
        lastError: null,
        attemptCount: { increment: 1 }
      }
    });
    return "captured";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.squadPlanningSnapshot.update({
      where: { id: snapshot.id },
      data: {
        attemptCount: { increment: 1 },
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(now.getTime() + CAPTURE_RETRY_DELAY_MS)
      }
    });
    return "failed";
  }
}

export async function syncSquadPlanningSnapshots(
  prisma: PrismaClient,
  options: { now?: Date } = {}
): Promise<SquadPlanningSyncResult> {
  const now = options.now ?? new Date();
  const plan = await planSquadPlanningSnapshotSchedule(prisma, now);
  const capture = await captureDueSquadPlanningSnapshots(prisma, now);
  return { ...plan, ...capture };
}
