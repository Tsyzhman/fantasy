import { createHash, randomUUID } from "node:crypto";
/** @spec spec://modules/machete/FEAT-004-rotation-risk#contracts */
import { ROTATION_RISK_VERSION, ROTATION_RISK_TTL_MS } from "./rotation-risk";

import { Prisma, type PrismaClient } from "@prisma/client";

import { isFantasySquadLeague, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { createLogger } from "@/lib/logger";
import { fantasyPlayerPoolTeamRefreshPlayerIds } from "@/machete/fantasy-player-pool-team-roster";
import {
  buildFantasyStartingXiState,
  changedFantasyStartingXiTeams
} from "@/machete/fantasy-player-pool-xi-revision";
import { defaultFantasyHistorySettings, fantasyHistorySettingsKey } from "@/machete/squad-history";
import { withoutRetiredFantasyForecasts } from "@/machete/retired-fantasy-forecasts";
import { parseFantasyFixtureCalendar } from "@/machete/squad-fixture-calendar";
import { toFantasyPlayerPoolListItem, type FantasyPlayerPoolListItem } from "@/machete/squad-player-dto";
import {
  loadFantasySquadPlannerData,
  loadSportsRuAuthoritativeRosterContext,
  type FantasySquadPlannerData
} from "@/machete/squad_planner";
import type { SharedLeagueSeasonOption } from "@/machete/shared_read_model";

export const FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI = "CURRENT_XI";
export const FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY = "READY";
export const FANTASY_PLAYER_POOL_SNAPSHOT_METADATA_VERSION = 1;
export const FANTASY_PLAYER_POOL_SNAPSHOT_SYSTEM_USER_ID = "fantasy-player-pool-snapshot";

export type FantasyPlayerPoolSnapshotVariant = typeof FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI;

export type FantasyPlayerPoolSnapshotMetadata = {
  version: typeof FANTASY_PLAYER_POOL_SNAPSHOT_METADATA_VERSION;
  providerIdentityVersion?: 1;
  rotationRiskVersion?: typeof ROTATION_RISK_VERSION;
  rotationRiskExpiresAt?: string;
  readiness: FantasySquadPlannerData["readiness"];
  rules: FantasySquadPlannerData["rules"];
  rounds: FantasySquadPlannerData["rounds"];
  bookmakerFavorites: FantasySquadPlannerData["bookmakerFavorites"];
  fixtureCalendar?: FantasySquadPlannerData["fixtureCalendar"];
  priceStatus: FantasySquadPlannerData["priceStatus"];
  historySeasonOptions: string[];
  startingXiTeamRevisions?: Record<string, string>;
  dataFreshness: {
    fotmobStatsAt: string | null;
    bookmakerOddsAt: string | null;
    startingXiOldest?: { teamName: string; at: string | null } | null;
    startingXiNewest?: { teamName: string; at: string | null } | null;
  };
};

export type FantasyPlayerPoolSnapshotRefreshResult = {
  scopes: number;
  snapshots: number;
  players: number;
  failed: Array<{ scope: string; variant: FantasyPlayerPoolSnapshotVariant; error: string }>;
};

type SnapshotScope = {
  contestId: string;
  league: SharedLeagueSeasonOption;
};

const logger = createLogger("fantasy-player-pool-snapshots");
const retainedSnapshotRevisions = 3;
const publishTransactionTimeoutMs = 120_000;

export async function refreshFantasyPlayerPoolSnapshots(
  prisma: PrismaClient,
  options: {
    leagueId?: bigint;
    season?: string;
    variants?: FantasyPlayerPoolSnapshotVariant[];
    onlyMissing?: boolean;
  } = {}
): Promise<FantasyPlayerPoolSnapshotRefreshResult> {
  const scopes = await loadFantasyPlayerPoolSnapshotScopes(prisma, options);
  const variants = options.variants ?? [FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI];
  const result: FantasyPlayerPoolSnapshotRefreshResult = {
    scopes: scopes.length,
    snapshots: 0,
    players: 0,
    failed: []
  };

  // Build sequentially: each league pool is several megabytes and parallel
  // builds multiply transient heap and database connections without helping
  // the user-facing path.
  for (const scope of scopes) {
    for (const variant of variants) {
      try {
        if (options.onlyMissing) {
          const existing = await latestFantasyPlayerPoolSnapshot(prisma, { contestId: scope.contestId, variant });
          // Upgrade old metadata once in the sequential worker, never on a page request.
          if (fantasyPlayerPoolSnapshotHasFixtureCalendar(existing?.metadata)
            && parseFantasyPlayerPoolSnapshotMetadata(existing?.metadata)?.providerIdentityVersion === 1
            && fantasyPlayerPoolSnapshotHasCurrentRotationRisk(existing?.metadata)) continue;
        }
        const snapshot = await withFantasyPlayerPoolScopeLock(
          snapshotScopeKey(scope.league),
          () => buildAndPublishFantasyPlayerPoolSnapshot(prisma, scope, variant)
        );
        result.snapshots += 1;
        result.players += snapshot.playersCount;
      } catch (error) {
        const failure = {
          scope: `${scope.league.leagueId}:${scope.league.season}`,
          variant,
          error: errorMessage(error)
        };
        result.failed.push(failure);
        logger.error("Fantasy player-pool snapshot refresh failed; the prior READY revision was preserved.", failure);
      }
    }
  }

  return result;
}

export async function buildAndPublishFantasyPlayerPoolSnapshot(
  prisma: PrismaClient,
  scope: SnapshotScope,
  variant: FantasyPlayerPoolSnapshotVariant
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const xiBefore = await loadFantasyStartingXiState(prisma, scope.league);
    const data = await loadFantasySquadPlannerData(
      prisma,
      FANTASY_PLAYER_POOL_SNAPSHOT_SYSTEM_USER_ID,
      scope.league,
      null,
      {
        readiness: undefined,
        historySettings: defaultFantasyHistorySettings,
        skipSavedSquads: true,
        provider: "SPORTS_RU",
        contestId: scope.contestId
      }
    );
    const xiAfter = await loadFantasyStartingXiState(prisma, scope.league);
    if (xiBefore.revision !== xiAfter.revision) {
      if (attempt === 0) continue;
      throw new Error("Starting XI changed while CURRENT_XI was being calculated; stale revision was not published.");
    }

    const players = data.players.map(toFantasyPlayerPoolListItem);
    if (players.length === 0) throw new Error("The planner returned an empty player pool.");
    const dataFreshness = await loadFantasyPlayerPoolDataFreshness(prisma, scope.league);
    return publishFullFantasyPlayerPoolSnapshot(prisma, {
      scope,
      variant,
      sourceXiRevision: xiAfter.revision,
      players,
      metadata: { ...fantasyPlayerPoolSnapshotMetadata(data, dataFreshness), startingXiTeamRevisions: xiAfter.teamRevisions }
    });
  }
  throw new Error("Fantasy player-pool snapshot could not reach a stable starting-XI revision.");
}

export async function refreshCurrentXiTeamSnapshot(
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; teamId: bigint }
) {
  return refreshCurrentXiTeamsSnapshot(prisma, {
    leagueId: input.leagueId,
    season: input.season,
    teamIds: [input.teamId]
  });
}

export async function refreshCurrentXiTeamsSnapshot(
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; teamIds: bigint[] }
) {
  const teamIds = [...new Set(input.teamIds.map(String))].map(BigInt);
  if (teamIds.length === 0) return null;
  return withFantasyPlayerPoolScopeLock(teamRefreshScopeKey(input), () =>
    refreshCurrentXiTeamsSnapshotUnlocked(prisma, { ...input, teamIds })
  );
}

async function refreshCurrentXiTeamsSnapshotUnlocked(
  prisma: PrismaClient,
  input: { leagueId: bigint; season: string; teamIds: bigint[] }
) {
  const scope = (await loadFantasyPlayerPoolSnapshotScopes(prisma, {
    leagueId: input.leagueId,
    season: input.season
  }))[0];
  if (!scope) return null;
  const previous = await latestFantasyPlayerPoolSnapshot(prisma, {
    contestId: scope.contestId,
    variant: FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI
  });
  if (!previous) {
    return buildAndPublishFantasyPlayerPoolSnapshot(prisma, scope, FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI);
  }

  const previousMetadata = parseFantasyPlayerPoolSnapshotMetadata(previous.metadata);
  if (!previousMetadata?.startingXiTeamRevisions || previousMetadata.providerIdentityVersion !== 1 || !fantasyPlayerPoolSnapshotHasCurrentRotationRisk(previous.metadata)) {
    return buildAndPublishFantasyPlayerPoolSnapshot(prisma, scope, FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI);
  }
  const xiBefore = await loadFantasyStartingXiState(prisma, scope.league);
  // Compare the complete stored team vector, not merely the current global XI
  // hash. A second team's edit can arrive before the queue picked its request.
  const changedTeamIds = changedFantasyStartingXiTeams(previousMetadata.startingXiTeamRevisions, xiBefore.teamRevisions);
  if (changedTeamIds.length === 0) return previous;
  const [teamMemberships, authoritativeRoster] = await Promise.all([
    prisma.teamPlayerSeason.findMany({
      where: {
        leagueId: input.leagueId,
        season: input.season,
        teamId: { in: changedTeamIds },
        active: true
      },
      select: { playerId: true, teamId: true }
    }),
    loadSportsRuAuthoritativeRosterContext(prisma, scope.league, undefined, scope.contestId)
  ]);
  // The full pool also contains mapped Sports.ru players without an active
  // FotMob membership. Replacing a team from memberships alone drops those
  // players and changes the team-wide allocation used by its formulas.
  const playerIds = fantasyPlayerPoolTeamRefreshPlayerIds(
    changedTeamIds,
    teamMemberships,
    authoritativeRoster.rosterOverrides
  );
  if (playerIds.length === 0) {
    return buildAndPublishFantasyPlayerPoolSnapshot(prisma, scope, FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI);
  }
  const data = await loadFantasySquadPlannerData(
    prisma,
    FANTASY_PLAYER_POOL_SNAPSHOT_SYSTEM_USER_ID,
    scope.league,
    null,
    {
      playerIds,
      historySettings: defaultFantasyHistorySettings,
      skipSavedSquads: true,
      provider: "SPORTS_RU",
      contestId: scope.contestId
    }
  );
  const xiAfter = await loadFantasyStartingXiState(prisma, scope.league);
  if (xiBefore.revision !== xiAfter.revision) {
    throw new Error("Starting XI changed during a team refresh; the stale team revision was not published.");
  }
  const teamIds = new Set(changedTeamIds.map(String));
  const players = data.players
    .filter((player) => Boolean(player.teamId && teamIds.has(player.teamId)))
    .map(toFantasyPlayerPoolListItem);
  if (players.length === 0) {
    throw new Error(`The planner returned no players for teams ${[...teamIds].join(", ")}.`);
  }
  const metadata = { ...previousMetadata, startingXiTeamRevisions: xiAfter.teamRevisions };

  return publishIncrementalTeamsFantasyPlayerPoolSnapshot(prisma, {
    scope,
    previousSnapshotId: previous.id,
    variant: FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI,
    sourceXiRevision: xiAfter.revision,
    teamIds: [...teamIds],
    players,
    metadata
  });
}

export async function latestFantasyPlayerPoolSnapshot(
  prisma: PrismaClient,
  input: {
    contestId: string;
    variant: FantasyPlayerPoolSnapshotVariant;
    snapshotId?: string | null;
  }
) {
  return prisma.fantasyPlayerPoolSnapshot.findFirst({
    where: {
      ...(input.snapshotId ? { id: input.snapshotId } : {}),
      provider: "SPORTS_RU",
      contestId: input.contestId,
      variant: input.variant,
      status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY,
      historySettingsKey: fantasyHistorySettingsKey(defaultFantasyHistorySettings)
    },
    orderBy: [{ calculatedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function loadFantasyPlayerPoolSnapshotPlayers(
  prisma: PrismaClient,
  input: {
    contestId: string;
    playerIds: readonly string[];
    snapshotId?: string | null;
  }
) {
  const snapshot = await latestFantasyPlayerPoolSnapshot(prisma, {
    contestId: input.contestId,
    variant: FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI,
    snapshotId: input.snapshotId
  });
  if (!snapshot) return { snapshot: null, players: [] as FantasyPlayerPoolListItem[] };
  const playerIds = [...new Set(input.playerIds.filter(Boolean))];
  if (playerIds.length === 0) return { snapshot, players: [] as FantasyPlayerPoolListItem[] };
  const rows = await prisma.fantasyPlayerPoolSnapshotPlayer.findMany({
    where: { snapshotId: snapshot.id, playerId: { in: playerIds } },
    select: { playerId: true, payload: true }
  });
  const byPlayerId = new Map<string, FantasyPlayerPoolListItem>();
  for (const row of rows) {
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) continue;
    const payload = row.payload as unknown as FantasyPlayerPoolListItem;
    if (payload.playerId !== row.playerId) continue;
    byPlayerId.set(row.playerId, withoutRetiredFantasyForecasts(payload));
  }
  return {
    snapshot,
    players: playerIds.flatMap((playerId) => {
      const player = byPlayerId.get(playerId);
      return player ? [player] : [];
    })
  };
}

export async function userCanUseCurrentXiFantasyPlayerPoolSnapshot(
  prisma: PrismaClient,
  userId: string,
  historySettingsKey: string
) {
  if (historySettingsKey !== fantasyHistorySettingsKey(defaultFantasyHistorySettings)) return false;
  const preference = await prisma.userScoringPreference.findUnique({
    where: { userId_modelSource: { userId, modelSource: "MACHETE" } },
    select: {
      alternativeFormulaEnabled: true,
      alternativeFormulaGk: true,
      alternativeFormulaDef: true,
      alternativeFormulaMid: true,
      alternativeFormulaFwd: true,
      alternativeProjectionFormulaConfig: true
    }
  });
  if (!preference?.alternativeFormulaEnabled) return true;
  return !preference.alternativeProjectionFormulaConfig && ![
    preference.alternativeFormulaGk,
    preference.alternativeFormulaDef,
    preference.alternativeFormulaMid,
    preference.alternativeFormulaFwd
  ].some((formula) => Boolean(formula?.trim()));
}

export async function loadFantasyStartingXiRevision(
  prisma: Pick<Prisma.TransactionClient, "teamPlayerSeason">,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">
) {
  return (await loadFantasyStartingXiState(prisma, league)).revision;
}

async function loadFantasyStartingXiState(
  prisma: Pick<Prisma.TransactionClient, "teamPlayerSeason">,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">
) {
  const roster = await prisma.teamPlayerSeason.findMany({
    where: {
      leagueId: league.leagueId,
      season: league.season,
      active: true
    },
    select: { teamId: true, playerId: true, isStarter: true },
    orderBy: [{ teamId: "asc" }, { playerId: "asc" }]
  });
  return buildFantasyStartingXiState(roster);
}

export function parseFantasyPlayerPoolSnapshotMetadata(value: unknown): FantasyPlayerPoolSnapshotMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Partial<FantasyPlayerPoolSnapshotMetadata>;
  if (metadata.version !== FANTASY_PLAYER_POOL_SNAPSHOT_METADATA_VERSION) return null;
  if (!metadata.readiness || !metadata.rules || !Array.isArray(metadata.rounds)) return null;
  if (!Array.isArray(metadata.bookmakerFavorites) || !metadata.priceStatus || !Array.isArray(metadata.historySeasonOptions)) return null;
  if (!metadata.dataFreshness || typeof metadata.dataFreshness !== "object") return null;
  return metadata as FantasyPlayerPoolSnapshotMetadata;
}

export function fantasyPlayerPoolSnapshotHasFixtureCalendar(value: unknown): boolean {
  const metadata = parseFantasyPlayerPoolSnapshotMetadata(value);
  return parseFantasyFixtureCalendar(metadata?.fixtureCalendar) !== null;
}

export function fantasyPlayerPoolSnapshotHasCurrentRotationRisk(value: unknown, now = Date.now()): boolean {
  const metadata = parseFantasyPlayerPoolSnapshotMetadata(value);
  return metadata?.rotationRiskVersion === ROTATION_RISK_VERSION && now < Date.parse(metadata.rotationRiskExpiresAt ?? "");
}

function fantasyPlayerPoolSnapshotMetadata(
  data: FantasySquadPlannerData,
  dataFreshness: FantasyPlayerPoolSnapshotMetadata["dataFreshness"]
): FantasyPlayerPoolSnapshotMetadata {
  return {
    version: FANTASY_PLAYER_POOL_SNAPSHOT_METADATA_VERSION,
    // @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts
    // Rebuild legacy pools in the sequential worker; retain their ordinary UI until ready.
    providerIdentityVersion: 1,
    rotationRiskVersion: ROTATION_RISK_VERSION,
    rotationRiskExpiresAt: new Date(data.players.reduce((expires, player) => Math.min(expires, Date.parse(player.rotationRisk?.expiresAt ?? "") || expires), Date.now() + ROTATION_RISK_TTL_MS)).toISOString(),
    readiness: data.readiness,
    rules: data.rules,
    rounds: data.rounds,
    bookmakerFavorites: data.bookmakerFavorites,
    fixtureCalendar: data.fixtureCalendar ?? null,
    priceStatus: data.priceStatus,
    historySeasonOptions: data.historySeasonOptions,
    dataFreshness
  };
}

export async function loadFantasyPlayerPoolDataFreshness(
  prisma: PrismaClient,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">
) {
  const [fotmobStats, bookmakerOdds, startingXiTeams] = await Promise.all([
    prisma.matchPlayerStat.aggregate({
      where: {
        player: {
          seasonRosterEntries: {
            some: {
              leagueId: league.leagueId,
              season: league.season,
              active: true
            }
          }
        }
      },
      _max: { updatedAt: true }
    }),
    prisma.fixtureOddsSnapshot.aggregate({
      where: { match: { leagueId: league.leagueId, season: league.season } },
      _max: { fetchedAt: true }
    }),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: league.leagueId, season: league.season, active: true },
      select: { startingXiChangedAt: true, team: { select: { name: true } } }
    })
  ]);
  return {
    fotmobStatsAt: fotmobStats._max.updatedAt?.toISOString() ?? null,
    bookmakerOddsAt: bookmakerOdds._max.fetchedAt?.toISOString() ?? null,
    ...startingXiFreshnessFromTeams(startingXiTeams)
  };
}

function startingXiFreshnessFromTeams(
  teams: Array<{ startingXiChangedAt: Date | null; team: { name: string } }>
) {
  if (teams.length === 0) {
    return { startingXiOldest: null, startingXiNewest: null };
  }
  let oldest = teams[0];
  let newest = teams[0];
  for (const team of teams) {
    const at = team.startingXiChangedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const oldestAt = oldest.startingXiChangedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const newestAt = newest.startingXiChangedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (at < oldestAt) oldest = team;
    if (at > newestAt) newest = team;
  }
  return {
    startingXiOldest: { teamName: oldest.team.name, at: oldest.startingXiChangedAt?.toISOString() ?? null },
    startingXiNewest: { teamName: newest.team.name, at: newest.startingXiChangedAt?.toISOString() ?? null }
  };
}

async function publishFullFantasyPlayerPoolSnapshot(
  prisma: PrismaClient,
  input: {
    scope: SnapshotScope;
    variant: FantasyPlayerPoolSnapshotVariant;
    sourceXiRevision: string | null;
    players: FantasyPlayerPoolListItem[];
    metadata: FantasyPlayerPoolSnapshotMetadata;
  }
) {
  const calculatedAt = new Date();
  // JSON serialization already normalizes the payload; parsing it into a full
  // second player pool before serializing again only duplicates the working set.
  const payloadHash = createHash("sha256").update(JSON.stringify(input.players)).digest("hex");
  const snapshotId = randomUUID();
  const revision = `${calculatedAt.toISOString()}:${payloadHash.slice(0, 16)}`;
  const snapshot = await prisma.$transaction(async (tx) => {
    const lockKey = `fantasy-player-pool-snapshot:${input.scope.contestId}:${input.variant}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (await loadFantasyStartingXiRevision(tx, input.scope.league) !== input.sourceXiRevision) {
      throw new Error("Starting XI advanced before snapshot publication; stale revision was not published.");
    }
    const created = await tx.fantasyPlayerPoolSnapshot.create({
      data: {
        id: snapshotId,
        provider: "SPORTS_RU",
        contestId: input.scope.contestId,
        leagueId: input.scope.league.leagueId,
        season: input.scope.league.season,
        variant: input.variant,
        revision,
        sourceXiRevision: input.sourceXiRevision,
        historySettingsKey: fantasyHistorySettingsKey(defaultFantasyHistorySettings),
        status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY,
        playersCount: input.players.length,
        payloadHash,
        metadata: jsonInput(input.metadata),
        calculatedAt
      }
    });
    await tx.fantasyPlayerPoolSnapshotPlayer.createMany({
      data: input.players.map((player) => ({
        id: `${snapshotId}:${player.playerId}`,
        snapshotId,
        playerId: player.playerId,
        payload: jsonInput(player)
      }))
    });
    await pruneFantasyPlayerPoolSnapshotRevisions(tx, input.scope.contestId, input.variant);
    return created;
  }, { maxWait: 10_000, timeout: publishTransactionTimeoutMs });
  return snapshot;
}

async function publishIncrementalTeamsFantasyPlayerPoolSnapshot(
  prisma: PrismaClient,
  input: {
    scope: SnapshotScope;
    previousSnapshotId: string;
    variant: typeof FANTASY_PLAYER_POOL_SNAPSHOT_CURRENT_XI;
    sourceXiRevision: string;
    teamIds: string[];
    players: FantasyPlayerPoolListItem[];
    metadata: FantasyPlayerPoolSnapshotMetadata;
  }
) {
  const calculatedAt = new Date();
  const snapshotId = randomUUID();
  const teamRevision = createHash("sha256").update(input.teamIds.slice().sort().join(",")).digest("hex").slice(0, 12);
  const revision = `${calculatedAt.toISOString()}:teams-${teamRevision}:${input.sourceXiRevision.slice(0, 16)}`;
  const snapshot = await prisma.$transaction(async (tx) => {
    const lockKey = `fantasy-player-pool-snapshot:${input.scope.contestId}:${input.variant}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const latest = await tx.fantasyPlayerPoolSnapshot.findFirst({
      where: {
        provider: "SPORTS_RU",
        contestId: input.scope.contestId,
        variant: input.variant,
        status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY
      },
      orderBy: [{ calculatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true }
    });
    if (latest?.id !== input.previousSnapshotId) {
      throw new Error("Fantasy player-pool snapshot advanced during an incremental refresh; retry from the latest revision.");
    }
    if (await loadFantasyStartingXiRevision(tx, input.scope.league) !== input.sourceXiRevision) {
      throw new Error("Starting XI advanced before team snapshot publication; stale revision was not published.");
    }
    await tx.fantasyPlayerPoolSnapshot.create({
      data: {
        id: snapshotId,
        provider: "SPORTS_RU",
        contestId: input.scope.contestId,
        leagueId: input.scope.league.leagueId,
        season: input.scope.league.season,
        variant: input.variant,
        revision,
        sourceXiRevision: input.sourceXiRevision,
        historySettingsKey: fantasyHistorySettingsKey(defaultFantasyHistorySettings),
        status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY,
        playersCount: 0,
        payloadHash: null,
        metadata: jsonInput(input.metadata),
        calculatedAt
      }
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "fantasy_player_pool_snapshot_players" ("id", "snapshot_id", "player_id", "payload", "created_at")
      SELECT ${snapshotId} || ':' || previous."player_id", ${snapshotId}, previous."player_id", previous."payload", NOW()
      FROM "fantasy_player_pool_snapshot_players" AS previous
      WHERE previous."snapshot_id" = ${input.previousSnapshotId}
        AND COALESCE(previous."payload"->>'teamId', '') NOT IN (${Prisma.join(input.teamIds)})
    `);
    await tx.fantasyPlayerPoolSnapshotPlayer.createMany({
      data: input.players.map((player) => ({
        id: `${snapshotId}:${player.playerId}`,
        snapshotId,
        playerId: player.playerId,
        payload: jsonInput(player)
      }))
    });
    const playersCount = await tx.fantasyPlayerPoolSnapshotPlayer.count({ where: { snapshotId } });
    const updated = await tx.fantasyPlayerPoolSnapshot.update({
      where: { id: snapshotId },
      data: { playersCount }
    });
    await pruneFantasyPlayerPoolSnapshotRevisions(tx, input.scope.contestId, input.variant);
    return updated;
  }, { maxWait: 10_000, timeout: publishTransactionTimeoutMs });
  return snapshot;
}

async function pruneFantasyPlayerPoolSnapshotRevisions(
  prisma: Prisma.TransactionClient,
  contestId: string,
  variant: FantasyPlayerPoolSnapshotVariant
) {
  const retained = await prisma.fantasyPlayerPoolSnapshot.findMany({
    where: {
      provider: "SPORTS_RU",
      contestId,
      variant,
      status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY
    },
    orderBy: [{ calculatedAt: "desc" }, { createdAt: "desc" }],
    take: retainedSnapshotRevisions,
    select: { id: true }
  });
  await prisma.fantasyPlayerPoolSnapshot.deleteMany({
    where: {
      provider: "SPORTS_RU",
      contestId,
      variant,
      status: FANTASY_PLAYER_POOL_SNAPSHOT_STATUS_READY,
      id: { notIn: retained.map((row) => row.id) }
    }
  });
}

async function loadFantasyPlayerPoolSnapshotScopes(
  prisma: PrismaClient,
  options: { leagueId?: bigint; season?: string }
): Promise<SnapshotScope[]> {
  const seasons = await prisma.leagueSeason.findMany({
    where: {
      ...(options.leagueId ? { leagueId: options.leagueId } : {}),
      ...(options.season ? { season: options.season } : { isCurrent: true }),
      teams: { some: { active: true } }
    },
    include: { league: true },
    orderBy: [{ leagueId: "asc" }, { season: "desc" }]
  });
  const fantasySeasons = seasons.filter((row) => isFantasySquadLeague({ providerLeagueId: String(row.leagueId) }));
  if (fantasySeasons.length === 0) return [];
  const contests = await prisma.fantasyContest.findMany({
    where: {
      provider: "SPORTS_RU",
      OR: fantasySeasons.map((row) => ({ leagueId: row.leagueId, season: row.season }))
    },
    select: { id: true, leagueId: true, season: true }
  });
  const contestByScope = new Map(contests.map((contest) => [`${contest.leagueId}:${contest.season}`, contest]));
  return fantasySeasons.flatMap((row): SnapshotScope[] => {
    const contest = contestByScope.get(`${row.leagueId}:${row.season}`);
    if (!contest) return [];
    const name = row.name ?? row.league.name;
    const country = row.country ?? row.league.country;
    return [{
      contestId: contest.id,
      league: {
        leagueId: row.leagueId,
        season: row.season,
        name,
        displayName: macheteLeagueDisplayName({
          id: String(row.leagueId),
          name,
          country,
          providerLeagueId: String(row.leagueId)
        }),
        country,
        providerLeagueId: String(row.leagueId),
        isCurrent: row.isCurrent,
        updatedAt: row.updatedAt
      }
    }];
  });
}

function jsonInput<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const globalForSnapshotScopeLocks = globalThis as unknown as {
  fantasyPlayerPoolSnapshotScopeLocks?: Map<string, Promise<void>>;
};

async function withFantasyPlayerPoolScopeLock<T>(scopeKey: string, work: () => Promise<T>): Promise<T> {
  const locks = globalForSnapshotScopeLocks.fantasyPlayerPoolSnapshotScopeLocks ??
    (globalForSnapshotScopeLocks.fantasyPlayerPoolSnapshotScopeLocks = new Map());
  const previous = locks.get(scopeKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const queued = previous.then(() => current);
  locks.set(scopeKey, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(scopeKey) === queued) locks.delete(scopeKey);
  }
}

function snapshotScopeKey(scope: Pick<SharedLeagueSeasonOption, "leagueId" | "season">) {
  return `${scope.leagueId}:${scope.season}`;
}

function teamRefreshScopeKey(input: { leagueId: bigint; season: string }) {
  return `${input.leagueId}:${input.season}`;
}
