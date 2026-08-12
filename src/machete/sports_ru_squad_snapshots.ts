import { Prisma, type PrismaClient } from "@prisma/client";

import {
  fetchSportsRuLatestPublishedSquad,
  type SportsRuPublishedSquad
} from "@/lib/providers/sports-ru-fantasy";

import type { SportsRuFantasySyncScope } from "./sports_ru_fantasy_config";
import {
  mapSportsRuPublishedSquad,
  readSportsRuSeasonId,
  SportsRuSquadImportError,
  type SportsRuSquadImportPreview
} from "./sports_ru_squad_import";
import type { FantasySquadSelection } from "./squad_logic";
import { sportsRuSeasonAliases } from "./squad_planner";

export const SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS = 30 * 60 * 1_000;
const SPORTS_RU_SQUAD_RETRY_DELAY_MS = 15 * 60 * 1_000;
const SPORTS_RU_SQUAD_MAPPING_RETRY_DELAY_MS = 60 * 60 * 1_000;
const SPORTS_RU_SQUAD_LEASE_MS = 10 * 60 * 1_000;
const SPORTS_RU_SQUAD_MAX_PUBLICATION_ATTEMPTS = 8;
const SPORTS_RU_SQUAD_MANUAL_RETRY_COOLDOWN_MS = 60 * 1_000;

export type SportsRuSquadScheduleMatch = {
  id: bigint;
  round: string | null;
  matchDate: Date | null;
  cancelled: boolean;
};

export type SportsRuSquadRoundSchedule = {
  roundKey: string;
  roundLabel: string;
  firstMatchAt: Date;
  availableAfter: Date;
};

export type SportsRuSquadSnapshotStatus = {
  linked: boolean;
  available: boolean;
  status: string | null;
  tourName: string | null;
  fetchedAt: string | null;
  availableAfter: string | null;
  nextAttemptAt: string | null;
  inProgress: boolean;
  attemptCount: number;
  playersCount: number;
  mappedPlayersCount: number;
  lastError: string | null;
};

export type SportsRuSquadSnapshotSyncResult = {
  profiles: number;
  scopes: number;
  scheduled: number;
  stored: number;
  retried: number;
  unavailable: number;
  skipped: number;
  failed: number;
  failedScopes: number;
};

type FetchPublishedSquad = typeof fetchSportsRuLatestPublishedSquad;

/**
 * Returns the most recently started league round. The publication time is
 * anchored to the earliest FotMob kickoff in that round plus 30 minutes.
 */
export function latestStartedSportsRuSquadRound(
  matches: readonly SportsRuSquadScheduleMatch[],
  now: Date
): SportsRuSquadRoundSchedule | null {
  const rounds = new Map<string, { label: string; firstMatchAt: Date }>();
  for (const match of matches) {
    const label = match.round?.trim();
    if (!label || !match.matchDate || match.cancelled || match.matchDate > now) continue;
    const key = `round:${label.toLocaleLowerCase("en-US")}`;
    const current = rounds.get(key);
    if (!current || match.matchDate < current.firstMatchAt) {
      rounds.set(key, { label, firstMatchAt: match.matchDate });
    }
  }
  const latest = [...rounds.entries()]
    .sort((left, right) => right[1].firstMatchAt.getTime() - left[1].firstMatchAt.getTime())[0];
  if (!latest) return null;
  return {
    roundKey: latest[0],
    roundLabel: latest[1].label,
    firstMatchAt: latest[1].firstMatchAt,
    availableAfter: new Date(latest[1].firstMatchAt.getTime() + SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS)
  };
}

export async function syncSportsRuSquadSnapshots(
  prisma: PrismaClient,
  scopes: readonly SportsRuFantasySyncScope[],
  options: {
    now?: Date;
    fetchPublishedSquad?: FetchPublishedSquad;
  } = {}
): Promise<SportsRuSquadSnapshotSyncResult> {
  const now = options.now ?? new Date();
  const fetchPublishedSquad = options.fetchPublishedSquad ?? fetchSportsRuLatestPublishedSquad;
  const profiles = await prisma.userExternalProfile.findMany({
    where: {
      provider: "SPORTS_RU",
      user: { isActive: true }
    },
    select: { id: true, userId: true, providerUserId: true }
  });
  const result: SportsRuSquadSnapshotSyncResult = {
    profiles: profiles.length,
    scopes: scopes.length,
    scheduled: 0,
    stored: 0,
    retried: 0,
    unavailable: 0,
    skipped: 0,
    failed: 0,
    failedScopes: 0
  };
  if (profiles.length === 0 || scopes.length === 0) return result;

  for (const scope of scopes) {
    try {
      const contest = await fantasyContestClient(prisma).findFirst({
        where: {
          provider: "SPORTS_RU",
          leagueId: scope.leagueId,
          season: { in: sportsRuSeasonAliases(scope.season) }
        },
        orderBy: { lastSyncedAt: "desc" }
      });
      const providerSeasonId = readSportsRuSeasonId(contest?.rules);
      if (!contest || !providerSeasonId) {
        result.skipped += profiles.length;
        continue;
      }
      const matches = await prisma.coreMatch.findMany({
        where: {
          leagueId: scope.leagueId,
          season: { in: sportsRuSeasonAliases(scope.season) },
          cancelled: false,
          matchDate: { lte: now }
        },
        select: { id: true, round: true, matchDate: true, cancelled: true }
      });
      const schedule = latestStartedSportsRuSquadRound(matches, now);
      if (!schedule) {
        result.skipped += profiles.length;
        continue;
      }

      for (const profile of profiles) {
        try {
          const snapshot = await prisma.sportsRuSquadSnapshot.upsert({
            where: {
              userId_providerProfileId_leagueId_season_roundKey: {
                userId: profile.userId,
                providerProfileId: profile.providerUserId,
                leagueId: scope.leagueId,
                season: scope.season,
                roundKey: schedule.roundKey
              }
            },
            create: {
              userId: profile.userId,
              leagueId: scope.leagueId,
              season: scope.season,
              roundKey: schedule.roundKey,
              roundLabel: schedule.roundLabel,
              firstMatchAt: schedule.firstMatchAt,
              availableAfter: schedule.availableAfter,
              providerProfileId: profile.providerUserId,
              providerSeasonId
            },
            update: {
              roundLabel: schedule.roundLabel,
              firstMatchAt: schedule.firstMatchAt,
              availableAfter: schedule.availableAfter,
              providerSeasonId
            }
          });
          result.scheduled += 1;
          const outcome = await syncOneSportsRuSquadSnapshot(prisma, snapshot.id, {
            expectedSquadSize: contest.squadSize,
            contestId: contest.id,
            now,
            profileId: profile.providerUserId,
            fetchPublishedSquad
          });
          result[outcome] += 1;
        } catch {
          result.failed += 1;
        }
      }
    } catch {
      result.failedScopes += 1;
    }
  }
  return result;
}

/**
 * Creates the current-round snapshot immediately for one linked user and,
 * once the 30-minute publication delay has elapsed, tries to fill it during
 * the button request. A manual request can revive an exhausted snapshot, but
 * the one-minute cooldown and the database lease prevent click-spam and
 * duplicate cross-process Sports.ru requests.
 */
export async function syncSportsRuSquadSnapshotOnDemand(
  prisma: PrismaClient,
  input: {
    userId: string;
    leagueId: bigint;
    season: string;
    expectedSquadSize: number;
    now?: Date;
    fetchPublishedSquad?: FetchPublishedSquad;
  }
): Promise<SportsRuSquadSnapshotStatus> {
  const now = input.now ?? new Date();
  const profile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: input.userId, provider: "SPORTS_RU" } },
    select: { providerUserId: true }
  });
  if (!profile) {
    throw new SportsRuSquadImportError(
      "SPORTS_PROFILE_REQUIRED",
      "Save a Sports.ru profile in your profile settings first."
    );
  }
      const contest = await fantasyContestClient(prisma).findFirst({
    where: {
      provider: "SPORTS_RU",
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) }
    },
    orderBy: { lastSyncedAt: "desc" }
  });
  const providerSeasonId = readSportsRuSeasonId(contest?.rules);
  if (!contest || !providerSeasonId) {
    throw new SportsRuSquadImportError(
      "SPORTS_TOURNAMENT_NOT_CONFIGURED",
      "Sports.ru squad import is not configured for this league season yet."
    );
  }
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) },
      cancelled: false,
      matchDate: { lte: now }
    },
    select: { id: true, round: true, matchDate: true, cancelled: true }
  });
  const schedule = latestStartedSportsRuSquadRound(matches, now);
  if (!schedule) {
    const status = await loadSportsRuSquadSnapshotStatus(prisma, {
      userId: input.userId,
      leagueId: input.leagueId,
      season: input.season
    });
    return { ...status, status: "WAITING_FOR_FIRST_MATCH" };
  }
  const snapshot = await prisma.sportsRuSquadSnapshot.upsert({
    where: {
      userId_providerProfileId_leagueId_season_roundKey: {
        userId: input.userId,
        providerProfileId: profile.providerUserId,
        leagueId: input.leagueId,
        season: input.season,
        roundKey: schedule.roundKey
      }
    },
    create: {
      userId: input.userId,
      leagueId: input.leagueId,
      season: input.season,
      roundKey: schedule.roundKey,
      roundLabel: schedule.roundLabel,
      firstMatchAt: schedule.firstMatchAt,
      availableAfter: schedule.availableAfter,
      providerProfileId: profile.providerUserId,
      providerSeasonId
    },
    update: {
      roundLabel: schedule.roundLabel,
      firstMatchAt: schedule.firstMatchAt,
      availableAfter: schedule.availableAfter,
      providerSeasonId
    }
  });
  await syncOneSportsRuSquadSnapshot(prisma, snapshot.id, {
    expectedSquadSize: input.expectedSquadSize,
    contestId: contest.id,
    now,
    profileId: profile.providerUserId,
    fetchPublishedSquad: input.fetchPublishedSquad ?? fetchSportsRuLatestPublishedSquad,
    manualRetry: true
  });
  return loadSportsRuSquadSnapshotStatus(prisma, {
    userId: input.userId,
    leagueId: input.leagueId,
    season: input.season
  });
}

async function syncOneSportsRuSquadSnapshot(
  prisma: PrismaClient,
  snapshotId: string,
  input: {
    expectedSquadSize: number;
    contestId: string;
    now: Date;
    profileId: string;
    fetchPublishedSquad: FetchPublishedSquad;
    manualRetry?: boolean;
  }
): Promise<"stored" | "retried" | "unavailable" | "skipped"> {
  const retryEligibility: Prisma.SportsRuSquadSnapshotWhereInput = input.manualRetry
    ? {
        OR: [
          { lastAttemptAt: null },
          { lastAttemptAt: { lte: new Date(input.now.getTime() - SPORTS_RU_SQUAD_MANUAL_RETRY_COOLDOWN_MS) } }
        ]
      }
    : { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }] };
  const claimed = await prisma.sportsRuSquadSnapshot.updateMany({
    where: {
      id: snapshotId,
      status: {
        in: input.manualRetry
          ? ["PENDING", "RETRY", "MAPPING_INCOMPLETE", "UNAVAILABLE"]
          : ["PENDING", "RETRY", "MAPPING_INCOMPLETE"]
      },
      availableAfter: { lte: input.now },
      AND: [
        retryEligibility,
        { OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: input.now } }] }
      ]
    },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: input.now,
      syncLeaseUntil: new Date(input.now.getTime() + SPORTS_RU_SQUAD_LEASE_MS)
    }
  });
  if (claimed.count !== 1) return "skipped";

  const snapshot = await prisma.sportsRuSquadSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) return "skipped";

  let published = snapshot.status === "MAPPING_INCOMPLETE"
    ? parseStoredPublishedSquad(snapshot.providerPayload)
    : null;
  if (!published) {
    try {
      published = await input.fetchPublishedSquad(input.profileId, snapshot.providerSeasonId, {
        expectedTourNumber: firstPositiveInteger(snapshot.roundLabel) ?? undefined
      });
    } catch (error) {
      return markPublicationRetry(prisma, snapshot, input.now, errorMessage(error, "Sports.ru request failed."));
    }
  }
  if (!published) {
    return markPublicationRetry(prisma, snapshot, input.now, "The current tour squad is not public yet.");
  }
  if (published.players.length !== input.expectedSquadSize) {
    return markPublicationRetry(
      prisma,
      snapshot,
      input.now,
      `Sports.ru returned ${published.players.length}/${input.expectedSquadSize} players.`
    );
  }
  if (!sportsRuTourMatchesFotMobRound(snapshot.roundLabel, published.tourName)) {
    return markPublicationRetry(
      prisma,
      snapshot,
      input.now,
      `Sports.ru still exposes ${published.tourName}, while FotMob has started ${snapshot.roundLabel}.`
    );
  }
  const duplicate = await prisma.sportsRuSquadSnapshot.findFirst({
    where: {
      id: { not: snapshot.id },
      userId: snapshot.userId,
      leagueId: snapshot.leagueId,
      season: snapshot.season,
      status: "COMPLETE",
      providerTourId: published.tourId
    },
    select: { id: true }
  });
  if (duplicate) {
    return markPublicationRetry(prisma, snapshot, input.now, "Sports.ru still exposes the preceding published tour.");
  }

  let preview: SportsRuSquadImportPreview;
  try {
    preview = await mapSportsRuPublishedSquad(prisma, {
      profileId: input.profileId,
      contestId: input.contestId,
      leagueId: snapshot.leagueId,
      season: snapshot.season,
      expectedSquadSize: input.expectedSquadSize,
      published
    });
  } catch (error) {
    return markPublicationRetry(prisma, snapshot, input.now, errorMessage(error, "Sports.ru squad mapping failed."));
  }
  if (preview.unmapped.length > 0) {
    await prisma.sportsRuSquadSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "MAPPING_INCOMPLETE",
        providerSquadId: preview.providerSquadId,
        providerTourId: preview.tourId,
        squadName: preview.squadName,
        tournamentName: preview.tournamentName,
        tourName: preview.tourName,
        playersCount: published.players.length,
        mappedPlayersCount: preview.selections.length,
        providerPayload: published as unknown as Prisma.InputJsonValue,
        unmappedPlayers: preview.unmapped as Prisma.InputJsonValue,
        nextAttemptAt: new Date(input.now.getTime() + SPORTS_RU_SQUAD_MAPPING_RETRY_DELAY_MS),
        syncLeaseUntil: null,
        lastError: `${preview.unmapped.length} Sports.ru players are not mapped to FotMob.`
      }
    });
    return "retried";
  }

  await prisma.sportsRuSquadSnapshot.update({
    where: { id: snapshot.id },
    data: {
      status: "COMPLETE",
      providerSquadId: preview.providerSquadId,
      providerTourId: preview.tourId,
      squadName: preview.squadName,
      tournamentName: preview.tournamentName,
      tourName: preview.tourName,
      playersCount: published.players.length,
      mappedPlayersCount: preview.selections.length,
      selections: preview.selections as Prisma.InputJsonValue,
      providerPayload: published as unknown as Prisma.InputJsonValue,
      unmappedPlayers: [],
      fetchedAt: input.now,
      completedAt: input.now,
      nextAttemptAt: null,
      syncLeaseUntil: null,
      lastError: null
    }
  });
  return "stored";
}

async function markPublicationRetry(
  prisma: PrismaClient,
  snapshot: {
    id: string;
    attemptCount: number;
  },
  now: Date,
  message: string
): Promise<"retried" | "unavailable"> {
  const unavailable = snapshot.attemptCount >= SPORTS_RU_SQUAD_MAX_PUBLICATION_ATTEMPTS;
  await prisma.sportsRuSquadSnapshot.update({
    where: { id: snapshot.id },
    data: {
      status: unavailable ? "UNAVAILABLE" : "RETRY",
      nextAttemptAt: unavailable ? null : new Date(now.getTime() + SPORTS_RU_SQUAD_RETRY_DELAY_MS),
      syncLeaseUntil: null,
      lastError: message.slice(0, 500)
    }
  });
  return unavailable ? "unavailable" : "retried";
}

export async function loadStoredSportsRuSquadImportPreview(
  prisma: PrismaClient,
  input: {
    userId: string;
    leagueId: bigint;
    season: string;
    expectedSquadSize: number;
  }
): Promise<SportsRuSquadImportPreview> {
  const profile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: input.userId, provider: "SPORTS_RU" } },
    select: { providerUserId: true }
  });
  if (!profile) {
    throw new SportsRuSquadImportError(
      "SPORTS_PROFILE_REQUIRED",
      "Save a Sports.ru profile in your profile settings first."
    );
  }
  const snapshot = await prisma.sportsRuSquadSnapshot.findFirst({
    where: {
      userId: input.userId,
      providerProfileId: profile.providerUserId,
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) }
    },
    orderBy: [{ firstMatchAt: "desc" }, { completedAt: "desc" }]
  });
  if (!snapshot || snapshot.status !== "COMPLETE") {
    throw new SportsRuSquadImportError(
      "SPORTS_SNAPSHOT_PENDING",
      snapshot?.lastError
        ? `The current Sports.ru squad is not stored yet: ${snapshot.lastError}`
        : "The current Sports.ru squad is not stored yet. It is fetched automatically 30 minutes after the first match starts."
    );
  }
  const selections = parseStoredSelections(snapshot.selections);
  if (selections.length !== input.expectedSquadSize) {
    throw new SportsRuSquadImportError(
      "STORED_SPORTS_SQUAD_INVALID",
      `The stored Sports.ru squad contains ${selections.length}/${input.expectedSquadSize} mapped players.`
    );
  }
  return {
    profileId: profile.providerUserId,
    providerSquadId: snapshot.providerSquadId ?? "",
    squadName: snapshot.squadName ?? "Sports.ru squad",
    tournamentName: snapshot.tournamentName ?? "Sports.ru fantasy",
    tourId: snapshot.providerTourId ?? "",
    tourName: snapshot.tourName ?? snapshot.roundLabel ?? "Current tour",
    selections,
    unmapped: parseStoredUnmappedPlayers(snapshot.unmappedPlayers)
  };
}

export async function loadSportsRuSquadSnapshotStatus(
  prisma: PrismaClient,
  input: { userId: string; leagueId: bigint; season: string }
): Promise<SportsRuSquadSnapshotStatus> {
  const profile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: input.userId, provider: "SPORTS_RU" } },
    select: { providerUserId: true }
  });
  const snapshot = profile
    ? await prisma.sportsRuSquadSnapshot.findFirst({
      where: {
        userId: input.userId,
        providerProfileId: profile.providerUserId,
        leagueId: input.leagueId,
        season: { in: sportsRuSeasonAliases(input.season) }
      },
      orderBy: [{ firstMatchAt: "desc" }, { completedAt: "desc" }],
      select: {
        status: true,
        tourName: true,
        fetchedAt: true,
        availableAfter: true,
        nextAttemptAt: true,
        syncLeaseUntil: true,
        attemptCount: true,
        playersCount: true,
        mappedPlayersCount: true,
        lastError: true
      }
    })
    : null;
  return {
    linked: Boolean(profile),
    available: snapshot?.status === "COMPLETE",
    status: snapshot?.status ?? null,
    tourName: snapshot?.tourName ?? null,
    fetchedAt: snapshot?.fetchedAt?.toISOString() ?? null,
    availableAfter: snapshot?.availableAfter.toISOString() ?? null,
    nextAttemptAt: snapshot?.nextAttemptAt?.toISOString() ?? null,
    inProgress: Boolean(snapshot?.syncLeaseUntil && snapshot.syncLeaseUntil > new Date()),
    attemptCount: snapshot?.attemptCount ?? 0,
    playersCount: snapshot?.playersCount ?? 0,
    mappedPlayersCount: snapshot?.mappedPlayersCount ?? 0,
    lastError: snapshot?.lastError ?? null
  };
}

function parseStoredPublishedSquad(value: Prisma.JsonValue | null): SportsRuPublishedSquad | null {
  if (!isRecord(value) || !Array.isArray(value.players)) return null;
  if (
    typeof value.providerSquadId !== "string"
    || typeof value.squadName !== "string"
    || typeof value.seasonId !== "string"
    || typeof value.tournamentHru !== "string"
    || typeof value.tournamentName !== "string"
    || typeof value.tourId !== "string"
    || typeof value.tourName !== "string"
  ) return null;
  return value as unknown as SportsRuPublishedSquad;
}

function parseStoredSelections(value: Prisma.JsonValue | null): FantasySquadSelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): FantasySquadSelection[] => {
    if (
      !isRecord(row)
      || typeof row.playerId !== "string"
      || typeof row.isStarter !== "boolean"
      || typeof row.isLocked !== "boolean"
      || typeof row.slotIndex !== "number"
      || !Number.isInteger(row.slotIndex)
    ) return [];
    return [{
      playerId: row.playerId,
      isStarter: row.isStarter,
      isLocked: row.isLocked,
      isCaptain: row.isCaptain === true,
      isViceCaptain: row.isViceCaptain === true,
      slotIndex: Number(row.slotIndex),
      purchasePrice: typeof row.purchasePrice === "number" && Number.isFinite(row.purchasePrice)
        ? row.purchasePrice
        : null
    }];
  });
}

function parseStoredUnmappedPlayers(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.providerPlayerId !== "string" || typeof row.name !== "string") return [];
    return [{
      providerPlayerId: row.providerPlayerId,
      name: row.name,
      teamName: typeof row.teamName === "string" ? row.teamName : null
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sportsRuTourMatchesFotMobRound(roundLabel: string | null, tourName: string) {
  const fotmobRound = firstPositiveInteger(roundLabel);
  const sportsRound = firstPositiveInteger(tourName);
  return fotmobRound === null || sportsRound === null || fotmobRound === sportsRound;
}

function firstPositiveInteger(value: string | null) {
  const match = value?.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function fantasyContestClient(prisma: PrismaClient) {
  const candidate = prisma as unknown as {
    fantasyContest?: Pick<PrismaClient["fantasyContest"], "findFirst">;
    sportsRuFantasyContest?: Pick<PrismaClient["fantasyContest"], "findFirst">;
  };
  return candidate.fantasyContest ?? candidate.sportsRuFantasyContest ?? {
    findFirst: async () => null
  };
}
