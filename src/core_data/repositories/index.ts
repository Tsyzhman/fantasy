import { Prisma, type PrismaClient } from "@prisma/client";

import {
  FOTMOB_SOURCE,
  OFFICIAL_TRANSFER_ROSTER_SOURCE,
  type LeagueSeasonData,
  type LeagueSeasonTeamData,
  type LeagueData,
  type MatchData,
  type MatchEventData,
  type MatchShotData,
  type PlayerData,
  type PlayerMatchStatsData,
  type TeamPlayerSeasonData,
  type TeamData,
  type TeamMatchStatsData
} from "../models";

type PrismaRepositoryClient = PrismaClient | Prisma.TransactionClient;

export class CoreMatchRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsertLeague(league: LeagueData) {
    return this.prisma.coreLeague.upsert({
      where: { id: league.id },
      update: {
        name: league.name,
        country: league.country,
        rawRef: league.rawRef,
        source: FOTMOB_SOURCE
      },
      create: {
        id: league.id,
        name: league.name,
        country: league.country,
        rawRef: league.rawRef,
        source: FOTMOB_SOURCE
      }
    });
  }

  async ensureLeaguePlaceholders(leagueIds: Array<bigint | null | undefined>) {
    await ensureCoreLeaguePlaceholders(this.prisma, leagueIds);
  }

  async upsert(match: MatchData) {
    await this.ensureLeaguePlaceholders([match.leagueId]);
    await ensureCoreTeamPlaceholders(this.prisma, [match.homeTeamId, match.awayTeamId]);

    return this.prisma.coreMatch.upsert({
      where: { id: match.id },
      update: matchData(match),
      create: {
        id: match.id,
        ...matchData(match)
      }
    });
  }

  async find(matchId: bigint) {
    return this.prisma.coreMatch.findUnique({ where: { id: matchId } });
  }

  async recordPromotionTiming(matchId: bigint, rawReceivedAt: Date, normalizedAt: Date) {
    return this.prisma.coreMatch.update({
      where: { id: matchId },
      data: {
        rawReceivedAt,
        normalizedAt
      }
    });
  }

  async latestTeamMatchIds(teamId: bigint, limitMatches: number) {
    const matches = await this.prisma.coreMatch.findMany({
      where: {
        finished: true,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
      },
      orderBy: { matchDate: "desc" },
      take: limitMatches,
      select: { id: true }
    });

    return matches.map((match) => match.id);
  }
}

export class CoreTeamRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsert(team: TeamData) {
    return this.prisma.coreTeam.upsert({
      where: { id: team.id },
      update: isFotMobPlaceholderTeamName(team.name) ? placeholderTeamUpdateData(team) : teamData(team),
      create: {
        id: team.id,
        ...teamData(team)
      }
    });
  }

  async upsertMany(teams: TeamData[]) {
    for (const team of teams) {
      await this.upsert(team);
    }
  }

  async ensurePlaceholders(teamIds: Array<bigint | null | undefined>) {
    await ensureCoreTeamPlaceholders(this.prisma, teamIds);
  }
}

export class CorePlayerRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsert(player: PlayerData) {
    return this.prisma.corePlayer.upsert({
      where: { id: player.id },
      update: playerData(player),
      create: {
        id: player.id,
        ...playerData(player)
      }
    });
  }

  async upsertMany(players: PlayerData[]) {
    for (const player of players) {
      await this.upsert(player);
    }
  }

  async ensurePlaceholders(playerIds: Array<bigint | null | undefined>) {
    await ensureCorePlayerPlaceholders(this.prisma, playerIds);
  }
}

export class CoreSeasonRosterRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsertLeagueSeason(row: LeagueSeasonData) {
    await ensureCoreLeaguePlaceholders(this.prisma, [row.leagueId]);

    if (row.isCurrent) {
      await this.prisma.leagueSeason.updateMany({
        where: {
          leagueId: row.leagueId,
          season: { not: row.season },
          isCurrent: true
        },
        data: { isCurrent: false }
      });
    }

    return this.prisma.leagueSeason.upsert({
      where: {
        leagueId_season: {
          leagueId: row.leagueId,
          season: row.season
        }
      },
      update: leagueSeasonData(row),
      create: leagueSeasonData(row)
    });
  }

  async upsertSeasonTeams(rows: LeagueSeasonTeamData[]) {
    await ensureCoreTeamPlaceholders(this.prisma, rows.map((row) => row.teamId));

    const now = new Date();
    for (const row of rows) {
      await this.prisma.leagueSeasonTeam.upsert({
        where: {
          leagueId_season_teamId: {
            leagueId: row.leagueId,
            season: row.season,
            teamId: row.teamId
          }
        },
        update: {
          active: row.active,
          lastSeenAt: now,
          metadata: jsonValue(row.metadata)
        },
        create: {
          ...leagueSeasonTeamData(row),
          firstSeenAt: now,
          lastSeenAt: now
        }
      });
    }
  }

  async deactivateMissingSeasonTeams(leagueId: bigint, season: string, activeTeamIds: bigint[]) {
    await this.prisma.leagueSeasonTeam.updateMany({
      where: {
        leagueId,
        season,
        teamId: { notIn: activeTeamIds },
        active: true
      },
      data: { active: false }
    });
  }

  async upsertTeamPlayers(rows: TeamPlayerSeasonData[]) {
    await ensureCoreTeamPlaceholders(this.prisma, rows.map((row) => row.teamId));
    await ensureCorePlayerPlaceholders(this.prisma, rows.map((row) => row.playerId));

    const authoritativeMemberships = rows.length === 0
      ? []
      : await this.prisma.teamPlayerSeason.findMany({
          where: {
            active: true,
            source: { not: FOTMOB_SOURCE },
            OR: rows.map((row) => ({
              leagueId: row.leagueId,
              season: row.season,
              playerId: row.playerId
            }))
          },
          select: {
            leagueId: true,
            season: true,
            teamId: true,
            playerId: true,
            source: true
          }
        });
    const authoritativeByPlayerScope = new Map<string, Array<(typeof authoritativeMemberships)[number]>>();
    for (const membership of authoritativeMemberships) {
      const key = rosterPlayerScopeKey(membership.leagueId, membership.season, membership.playerId);
      const memberships = authoritativeByPlayerScope.get(key) ?? [];
      memberships.push(membership);
      authoritativeByPlayerScope.set(key, memberships);
    }

    const now = new Date();
    for (const row of rows) {
      const authoritative = authoritativeByPlayerScope.get(
        rosterPlayerScopeKey(row.leagueId, row.season, row.playerId)
      ) ?? [];
      if (authoritative.some((membership) => membership.teamId !== row.teamId)) continue;
      const synchronizedSource = authoritative.some((membership) =>
        membership.source === OFFICIAL_TRANSFER_ROSTER_SOURCE
      )
        ? OFFICIAL_TRANSFER_ROSTER_SOURCE
        : FOTMOB_SOURCE;

      await this.prisma.teamPlayerSeason.upsert({
        where: {
          leagueId_season_teamId_playerId: {
            leagueId: row.leagueId,
            season: row.season,
            teamId: row.teamId,
            playerId: row.playerId
          }
        },
        update: {
          source: synchronizedSource,
          active: row.active,
          position: row.position,
          shirtNumber: row.shirtNumber,
          nationality: row.nationality,
          age: row.age,
          photoUrl: row.photoUrl,
          lastSeenAt: now
        },
        create: {
          ...teamPlayerSeasonData(row),
          firstSeenAt: now,
          lastSeenAt: now
        }
      });
    }
  }

  async deactivateMissingTeamPlayers(leagueId: bigint, season: string, teamId: bigint, activePlayerIds: bigint[]) {
    await this.prisma.teamPlayerSeason.updateMany({
      where: {
        leagueId,
        season,
        teamId,
        source: FOTMOB_SOURCE,
        playerId: { notIn: activePlayerIds },
        active: true
      },
      data: { active: false }
    });
  }
}

export class CoreStatsRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsertTeamStats(rows: TeamMatchStatsData[]) {
    await ensureCoreTeamPlaceholders(
      this.prisma,
      rows.flatMap((row) => [row.teamId, row.opponentTeamId])
    );

    for (const row of rows) {
      if (!isPositiveBigInt(row.teamId)) continue;
      await this.prisma.matchTeamStat.upsert({
        where: {
          matchId_teamId: {
            matchId: row.matchId,
            teamId: row.teamId
          }
        },
        update: teamStatsData(row),
        create: teamStatsData(row)
      });
    }
  }

  async upsertPlayerStats(rows: PlayerMatchStatsData[]) {
    await ensureCorePlayerPlaceholders(this.prisma, rows.map((row) => row.playerId));
    await ensureCoreTeamPlaceholders(
      this.prisma,
      rows.flatMap((row) => [row.teamId, row.opponentTeamId])
    );

    for (const row of rows) {
      if (!isPositiveBigInt(row.playerId)) continue;
      await this.prisma.matchPlayerStat.upsert({
        where: {
          matchId_playerId: {
            matchId: row.matchId,
            playerId: row.playerId
          }
        },
        update: playerStatsData(row),
        create: playerStatsData(row)
      });
    }
  }
}

export class CoreEventRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async replaceMatchEvents(matchId: bigint, rows: MatchEventData[]) {
    await this.prisma.matchEvent.deleteMany({ where: { matchId } });
    if (rows.length === 0) return;
    await this.ensureReferencedPlayers(rows);

    await this.prisma.matchEvent.createMany({
      data: rows.map(eventData),
      skipDuplicates: true
    });
  }

  private async ensureReferencedPlayers(rows: MatchEventData[]) {
    await ensureCorePlayerPlaceholders(
      this.prisma,
      rows.flatMap((row) => [row.playerId, row.relatedPlayerId])
    );
    await ensureCoreTeamPlaceholders(this.prisma, rows.map((row) => row.teamId));
  }
}

export class CoreShotRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async upsertShots(rows: MatchShotData[]) {
    await ensureCoreTeamPlaceholders(
      this.prisma,
      rows.flatMap((row) => [row.teamId, row.opponentTeamId])
    );
    await ensureCorePlayerPlaceholders(this.prisma, rows.map((row) => row.playerId));

    for (const row of rows) {
      await this.prisma.matchShot.upsert({
        where: {
          matchId_sourceFingerprint: {
            matchId: row.matchId,
            sourceFingerprint: row.sourceFingerprint
          }
        },
        update: shotData(row),
        create: shotData(row)
      });
    }
  }

  async findTeamShotsForMatches(teamId: bigint, matchIds: bigint[]) {
    if (matchIds.length === 0) return [];
    return this.prisma.matchShot.findMany({
      where: {
        matchId: { in: matchIds },
        teamId
      },
      include: shotInclude(),
      orderBy: [{ match: { matchDate: "desc" } }, { minute: "asc" }]
    });
  }

  async findPlayerShotsForTeamMatches(playerId: bigint, teamId: bigint, matchIds: bigint[]) {
    if (matchIds.length === 0) return [];
    return this.prisma.matchShot.findMany({
      where: {
        matchId: { in: matchIds },
        playerId,
        teamId
      },
      include: shotInclude(),
      orderBy: [{ match: { matchDate: "desc" } }, { minute: "asc" }]
    });
  }

  async findTeamConcededShotsForMatches(teamId: bigint, matchIds: bigint[]) {
    if (matchIds.length === 0) return [];
    return this.prisma.matchShot.findMany({
      where: {
        matchId: { in: matchIds },
        OR: [
          { opponentTeamId: teamId },
          {
            opponentTeamId: null,
            teamId: { not: teamId }
          }
        ]
      },
      include: shotInclude(),
      orderBy: [{ match: { matchDate: "desc" } }, { minute: "asc" }]
    });
  }
}

export class RawPayloadRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async find(matchId: bigint) {
    return this.prisma.rawMatchPayload.findUnique({ where: { matchId } });
  }

  async upsert(input: {
    matchId: bigint;
    payload: unknown;
    payloadHash: string;
    parserVersion: string;
    schemaVersion: string;
    isFinal: boolean;
  }) {
    return this.prisma.rawMatchPayload.upsert({
      where: { matchId: input.matchId },
      update: {
        payload: jsonValue(input.payload),
        payloadHash: input.payloadHash,
        parserVersion: input.parserVersion,
        schemaVersion: input.schemaVersion,
        isFinal: input.isFinal,
        fetchedAt: new Date(),
        source: FOTMOB_SOURCE
      },
      create: {
        matchId: input.matchId,
        payload: jsonValue(input.payload),
        payloadHash: input.payloadHash,
        parserVersion: input.parserVersion,
        schemaVersion: input.schemaVersion,
        isFinal: input.isFinal,
        source: FOTMOB_SOURCE
      }
    });
  }

  async delete(matchId: bigint) {
    const rawPayloads = this.prisma.rawMatchPayload as typeof this.prisma.rawMatchPayload & {
      deleteMany?: (input: { where: { matchId: bigint } }) => Promise<{ count: number }>;
    };
    if (typeof rawPayloads.deleteMany !== "function") return { count: 0 };

    return rawPayloads.deleteMany({ where: { matchId } });
  }
}

export class CoreIngestionRepository {
  constructor(private readonly prisma: PrismaRepositoryClient) {}

  async createRun(input: { jobType: string; leagueId?: bigint | null; season?: string | null }) {
    return this.prisma.ingestionRun.create({
      data: {
        source: FOTMOB_SOURCE,
        jobType: input.jobType,
        leagueId: input.leagueId ?? null,
        season: input.season ?? null,
        status: "RUNNING"
      }
    });
  }

  async updateRun(id: bigint, data: Prisma.IngestionRunUpdateInput) {
    return this.prisma.ingestionRun.update({ where: { id }, data });
  }

  async upsertCheckpoint(input: {
    jobType: string;
    leagueId: bigint;
    season: string;
    lastProcessedMatchId?: bigint | null;
    lastProcessedDate?: Date | null;
    cursor?: unknown;
  }) {
    return this.prisma.ingestionCheckpoint.upsert({
      where: {
        source_jobType_leagueId_season: {
          source: FOTMOB_SOURCE,
          jobType: input.jobType,
          leagueId: input.leagueId,
          season: input.season
        }
      },
      update: {
        lastProcessedMatchId: input.lastProcessedMatchId ?? null,
        lastProcessedDate: input.lastProcessedDate ?? null,
        cursor: input.cursor === undefined ? undefined : jsonValue(input.cursor)
      },
      create: {
        source: FOTMOB_SOURCE,
        jobType: input.jobType,
        leagueId: input.leagueId,
        season: input.season,
        lastProcessedMatchId: input.lastProcessedMatchId ?? null,
        lastProcessedDate: input.lastProcessedDate ?? null,
        cursor: input.cursor === undefined ? undefined : jsonValue(input.cursor)
      }
    });
  }
}

function matchData(match: MatchData) {
  return {
    leagueId: relationId(match.leagueId),
    season: match.season,
    round: match.round,
    homeTeamId: relationId(match.homeTeamId),
    awayTeamId: relationId(match.awayTeamId),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    status: match.status,
    started: match.started,
    finished: match.finished,
    cancelled: match.cancelled,
    matchDate: match.matchDate,
    utcTime: match.utcTime,
    source: FOTMOB_SOURCE,
    sourceUrl: match.sourceUrl,
    rawRef: match.rawRef
  };
}

function leagueSeasonData(row: LeagueSeasonData) {
  return {
    leagueId: row.leagueId,
    season: row.season,
    source: FOTMOB_SOURCE,
    calendarType: row.calendarType,
    isCurrent: row.isCurrent,
    providerSeason: row.providerSeason,
    name: row.name,
    country: row.country,
    metadata: jsonValue(row.metadata)
  };
}

function leagueSeasonTeamData(row: LeagueSeasonTeamData) {
  return {
    leagueId: row.leagueId,
    season: row.season,
    teamId: row.teamId,
    source: FOTMOB_SOURCE,
    active: row.active,
    metadata: jsonValue(row.metadata)
  };
}

function teamPlayerSeasonData(row: TeamPlayerSeasonData) {
  return {
    leagueId: row.leagueId,
    season: row.season,
    teamId: row.teamId,
    playerId: row.playerId,
    source: FOTMOB_SOURCE,
    active: row.active,
    position: row.position,
    shirtNumber: row.shirtNumber,
    nationality: row.nationality,
    age: row.age,
    photoUrl: row.photoUrl
  };
}

function rosterPlayerScopeKey(leagueId: bigint, season: string, playerId: bigint) {
  return `${leagueId}:${season}:${playerId}`;
}

function teamData(team: TeamData) {
  return {
    name: team.name,
    country: team.country,
    ccode: team.ccode,
    source: FOTMOB_SOURCE,
    rawRef: team.rawRef
  };
}

function placeholderTeamUpdateData(team: TeamData): Prisma.CoreTeamUpdateInput {
  const data: Prisma.CoreTeamUpdateInput = { source: FOTMOB_SOURCE };
  if (team.rawRef !== null) data.rawRef = team.rawRef;
  return data;
}

function isFotMobPlaceholderTeamName(name: string) {
  return /^FotMob team \d+$/.test(name);
}

function playerData(player: PlayerData) {
  return {
    name: player.name,
    country: player.country,
    birthDate: player.birthDate,
    source: FOTMOB_SOURCE,
    rawRef: player.rawRef
  };
}

function teamStatsData(row: TeamMatchStatsData) {
  return {
    matchId: row.matchId,
    teamId: row.teamId,
    opponentTeamId: relationId(row.opponentTeamId),
    isHome: row.isHome,
    goals: row.goals,
    xg: row.xg,
    xgot: row.xgot,
    xa: row.xa,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget,
    shotsOffTarget: row.shotsOffTarget,
    blockedShots: row.blockedShots,
    bigChances: row.bigChances,
    bigChancesMissed: row.bigChancesMissed,
    touchesInOppBox: row.touchesInOppBox,
    possession: row.possession,
    passes: row.passes,
    accuratePasses: row.accuratePasses,
    passAccuracy: row.passAccuracy,
    corners: row.corners,
    offsides: row.offsides,
    fouls: row.fouls,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    tacklesWon: row.tacklesWon,
    interceptions: row.interceptions,
    clearances: row.clearances,
    saves: row.saves
  };
}

function playerStatsData(row: PlayerMatchStatsData) {
  return {
    matchId: row.matchId,
    playerId: row.playerId,
    teamId: relationId(row.teamId),
    opponentTeamId: relationId(row.opponentTeamId),
    isHome: row.isHome,
    started: row.started,
    substitutedIn: row.substitutedIn,
    substitutedOut: row.substitutedOut,
    minutes: row.minutes,
    position: row.position,
    shirtNumber: row.shirtNumber,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    saves: row.saves,
    goalsConceded: row.goalsConceded,
    cleanSheet: row.cleanSheet,
    xg: row.xg,
    xgot: row.xgot,
    xa: row.xa,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget,
    keyPasses: row.keyPasses,
    chancesCreated: row.chancesCreated,
    tacklesWon: row.tacklesWon,
    interceptions: row.interceptions,
    clearances: row.clearances,
    duelsWon: row.duelsWon,
    aerialsWon: row.aerialsWon,
    recoveries: row.recoveries,
    touchesInOppBox: row.touchesInOppBox,
    foulsWon: row.foulsWon,
    penaltiesWon: row.penaltiesWon,
    rating: row.rating
  };
}

function eventData(row: MatchEventData) {
  return {
    matchId: row.matchId,
    teamId: relationId(row.teamId),
    playerId: relationId(row.playerId),
    relatedPlayerId: relationId(row.relatedPlayerId),
    minute: row.minute,
    addedTime: row.addedTime,
    eventType: row.eventType,
    eventSubtype: row.eventSubtype,
    isGoal: row.isGoal,
    isAssist: row.isAssist,
    isOwnGoal: row.isOwnGoal,
    isPenalty: row.isPenalty,
    isCard: row.isCard,
    isSubstitution: row.isSubstitution
  };
}

function shotData(row: MatchShotData) {
  return {
    matchId: row.matchId,
    teamId: relationId(row.teamId),
    opponentTeamId: relationId(row.opponentTeamId),
    playerId: relationId(row.playerId),
    isHome: row.isHome,
    minute: row.minute,
    addedTime: row.addedTime,
    x: row.x,
    y: row.y,
    normalizedX: row.normalizedX,
    normalizedY: row.normalizedY,
    eventType: row.eventType,
    shotType: row.shotType,
    bodyPart: row.bodyPart,
    situation: row.situation,
    isGoal: row.isGoal,
    isOnTarget: row.isOnTarget,
    isBlocked: row.isBlocked,
    isBigChance: row.isBigChance,
    xg: row.xg,
    xgot: row.xgot,
    sourceFingerprint: row.sourceFingerprint
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}

async function ensureCoreLeaguePlaceholders(prisma: PrismaRepositoryClient, leagueIds: Array<bigint | null | undefined>) {
  const ids = uniqueBigints(leagueIds.filter(isPositiveBigInt));
  if (ids.length === 0) return;

  await prisma.coreLeague.createMany({
    data: ids.map((id) => ({
      id,
      name: `FotMob league ${String(id)}`,
      country: null,
      source: FOTMOB_SOURCE,
      rawRef: String(id)
    })),
    skipDuplicates: true
  });
}

async function ensureCoreTeamPlaceholders(prisma: PrismaRepositoryClient, teamIds: Array<bigint | null | undefined>) {
  const ids = uniqueBigints(teamIds.filter(isPositiveBigInt));
  if (ids.length === 0) return;

  await prisma.coreTeam.createMany({
    data: ids.map((id) => ({
      id,
      name: `FotMob team ${String(id)}`,
      country: null,
      ccode: null,
      source: FOTMOB_SOURCE,
      rawRef: String(id)
    })),
    skipDuplicates: true
  });
}

async function ensureCorePlayerPlaceholders(prisma: PrismaRepositoryClient, playerIds: Array<bigint | null | undefined>) {
  const ids = uniqueBigints(playerIds.filter(isPositiveBigInt));
  if (ids.length === 0) return;

  await prisma.corePlayer.createMany({
    data: ids.map((id) => ({
      id,
      name: `FotMob player ${String(id)}`,
      source: FOTMOB_SOURCE,
      rawRef: String(id)
    })),
    skipDuplicates: true
  });
}

function uniqueBigints(values: bigint[]) {
  const seen = new Set<string>();
  const result: bigint[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function isPositiveBigInt(value: bigint | null | undefined): value is bigint {
  return value !== null && value !== undefined && value > 0n;
}

function relationId(value: bigint | null | undefined) {
  return isPositiveBigInt(value) ? value : null;
}

function shotInclude() {
  return {
    match: {
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } }
      }
    },
    team: { select: { id: true, name: true, rawRef: true } },
    opponentTeam: { select: { id: true, name: true, rawRef: true } },
    player: { select: { id: true, name: true, rawRef: true } }
  } as const;
}
