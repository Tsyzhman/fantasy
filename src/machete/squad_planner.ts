import type { PrismaClient } from "@prisma/client";

import { formatDate } from "@/lib/format";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { normalizeName } from "@/lib/text";

import { loadSharedLeagueTeams, loadSharedMachetePlayerRows, type SharedLeagueSeasonOption } from "./shared_read_model";
import {
  defaultFantasySquadRules,
  normalizeFantasyPosition,
  roundFantasyValue,
  type FantasyPlannerPlayer,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasySquadRules,
  type FantasySquadSelection
} from "./squad_logic";

export type SavedFantasySquad = {
  id: string | null;
  name: string;
  leagueId: string;
  season: string;
  horizonRounds: number;
  selections: FantasySquadSelection[];
};

export type FantasySquadPlannerData = {
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  players: FantasyPlannerPlayer[];
  squad: SavedFantasySquad;
  priceStatus: {
    sportsRuPrices: number;
    estimatedPrices: number;
    lastSyncedAt: string | null;
  };
};

type PlannerFixture = {
  id: string;
  roundId: string;
  teamId: string;
  opponentTeamId: string | null;
  opponentName: string;
  side: "H" | "A";
  kickoffAt: Date | null;
  projectedXg: number | null;
  projectedXga: number | null;
  attackMultiplier: number | null;
  defenseMultiplier: number | null;
};

type PlannerMatch = {
  id: string;
  round: string | null;
  matchDate: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  finished: boolean;
  cancelled: boolean;
};

export type FantasyFixtureProjection = Pick<PlannerFixture, "side" | "attackMultiplier" | "defenseMultiplier">;

type PlannerRoundFixtures = {
  rounds: FantasyRoundProjection[];
  fixturesByTeamRound: Map<string, Map<string, PlannerFixture[]>>;
};

type TeamStrengthSide = "home" | "away";

type TeamStrengthSample = {
  teamId: string;
  side: TeamStrengthSide;
  xgFor: number | null;
  xgAgainst: number | null;
};

type TeamStrengthBlock = {
  matches: number;
  xgForPerMatch: number | null;
  xgAgainstPerMatch: number | null;
};

type TeamStrengthProfile = {
  home: TeamStrengthBlock;
  away: TeamStrengthBlock;
  overall: TeamStrengthBlock;
};

type TeamStrengthProfiles = {
  byTeamId: Map<string, TeamStrengthProfile>;
  league: TeamStrengthProfile;
};

type TeamStrengthMatchInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  teamStats: Array<{
    teamId: string;
    opponentTeamId?: string | null;
    isHome?: boolean | null;
    xg?: number | null;
    goals?: number | null;
  }>;
};

const maxProjectionRounds = 10;
const defaultTeamXgPerMatch = 1.25;

export async function loadFantasySquadPlannerData(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption
): Promise<FantasySquadPlannerData> {
  const sportsRuSeasons = sportsRuSeasonAliases(league.season);
  const [contest, savedSquad, rosterRows, playerRows, roundsAndFixtures, priceRows] = await Promise.all([
    prisma.sportsRuFantasyContest.findFirst({
      where: {
        provider: "SPORTS_RU",
        leagueId: league.leagueId,
        season: { in: sportsRuSeasons }
      },
      orderBy: { lastSyncedAt: "desc" }
    }),
    prisma.userFantasySquad.findUnique({
      where: {
        userId_leagueId_season: {
          userId,
          leagueId: league.leagueId,
          season: league.season
        }
      },
      include: {
        players: {
          orderBy: { slotIndex: "asc" }
        }
      }
    }),
    prisma.teamPlayerSeason.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true
      },
      include: {
        player: true,
        team: true
      },
      orderBy: [{ team: { name: "asc" } }, { player: { name: "asc" } }]
    }),
    loadProjectedPlayerRows(prisma, league),
    loadUpcomingRoundFixtures(prisma, league),
    prisma.fantasyPlayerPrice.findMany({
      where: {
        provider: "SPORTS_RU",
        leagueId: league.leagueId,
        season: { in: sportsRuSeasons }
      },
      orderBy: { lastSeenAt: "desc" }
    })
  ]);

  const priceMaps =
    priceRows.length > 0
      ? await prisma.providerEntityMap.findMany({
          where: {
            provider: "SPORTS_RU",
            providerEntityType: "FANTASY_PLAYER_PRICE",
            providerEntityId: { in: priceRows.map((row) => row.id) },
            internalEntityType: "PLAYER",
            internalEntityId: { not: null }
          },
          select: {
            providerEntityId: true,
            internalEntityId: true
          }
        })
      : [];
  const rules = fantasyRulesForLeague(league, contest ?? null);
  const projectedByPlayerTeam = new Map(playerRows.map((row) => [playerTeamKey(row.playerId, row.teamId), row]));
  const prices = priceLookup(priceRows, priceMaps);
  const players = rosterRows.map((row) => {
    const projected = projectedByPlayerTeam.get(playerTeamKey(row.playerId, row.teamId));
    const predictedFp = projected?.fantasyScore ?? null;
    const priceRow =
      prices.byPlayerId.get(String(row.playerId)) ??
      prices.byNameTeam.get(nameTeamKey(row.player.name, row.team.name)) ??
      prices.findByPlayerName(row.player.name);
    const position = fantasyPlannerPosition(priceRow?.position ?? null, row.position, projected?.position ?? null);
    const positionGroup = normalizeFantasyPosition(position);
    const price = priceRow?.price ?? estimateFantasyPrice(predictedFp, positionGroup);
    const roundPoints = roundsAndFixtures.rounds.map((round) => {
      const fixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      const basePoints = predictedFp ?? 0;
      return roundFantasyValue(fixtures.reduce((total, fixture) => total + projectFixtureFantasyPoints(basePoints, positionGroup, fixture), 0));
    });
    const fixtures = roundsAndFixtures.rounds.map((round) => {
      const teamFixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      return teamFixtures.map((fixture) => `${fixture.side} ${fixture.opponentName}`).join(", ");
    });

    return {
      id: String(row.playerId),
      playerId: String(row.playerId),
      teamId: String(row.teamId),
      name: row.player.name,
      teamName: row.team.name,
      leagueName: league.displayName,
      position,
      positionGroup,
      price,
      priceSource: priceRow ? ("SPORTS_RU" as const) : ("ESTIMATED" as const),
      predictedFp,
      valueScore: price > 0 ? roundFantasyValue((roundPoints[0] ?? predictedFp ?? 0) / price) : 0,
      roundPoints,
      fixtures
    };
  });

  const sportsRuPrices = players.filter((player) => player.priceSource === "SPORTS_RU").length;
  const latestPriceSync = priceRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.lastSeenAt > latest) return row.lastSeenAt;
    return latest;
  }, null);
  const playersById = new Map(players.map((player) => [player.playerId, player]));

  return {
    rules,
    rounds: roundsAndFixtures.rounds,
    players: players.sort(comparePlannerPlayers),
    squad: {
      id: savedSquad?.id ?? null,
      name: savedSquad?.name ?? "My squad",
      leagueId: String(league.leagueId),
      season: league.season,
      horizonRounds: savedSquad?.horizonRounds ?? 5,
      selections:
        savedSquad?.players.map((player) => ({
          playerId: String(player.playerId),
          isStarter: player.isStarter,
          isLocked: player.isLocked,
          slotIndex: player.slotIndex,
          purchasePrice: playersById.get(String(player.playerId))?.price ?? player.purchasePrice
        })) ?? []
    },
    priceStatus: {
      sportsRuPrices,
      estimatedPrices: players.length - sportsRuPrices,
      lastSyncedAt: latestPriceSync?.toISOString() ?? null
    }
  };
}

export async function saveFantasySquad(
  prisma: PrismaClient,
  input: {
    userId: string;
    leagueId: bigint;
    season: string;
    name?: string;
    horizonRounds: number;
    selections: FantasySquadSelection[];
    rules: FantasySquadRules;
  }
) {
  const rosterRows = await prisma.teamPlayerSeason.findMany({
    where: {
      leagueId: input.leagueId,
      season: input.season,
      playerId: { in: input.selections.map((selection) => BigInt(selection.playerId)) },
      active: true
    },
    select: {
      playerId: true,
      teamId: true,
      position: true
    }
  });
  const sportsPositionsByPlayerId = await loadSportsRuFantasyPositionsByPlayerId(prisma, {
    leagueId: input.leagueId,
    season: input.season
  });
  const rosterByPlayerId = new Map(rosterRows.map((row) => [String(row.playerId), row]));
  const squad = await prisma.userFantasySquad.upsert({
    where: {
      userId_leagueId_season: {
        userId: input.userId,
        leagueId: input.leagueId,
        season: input.season
      }
    },
    update: {
      name: input.name?.trim() || "My squad",
      budgetLimit: input.rules.budgetLimit,
      horizonRounds: input.horizonRounds
    },
    create: {
      userId: input.userId,
      leagueId: input.leagueId,
      season: input.season,
      name: input.name?.trim() || "My squad",
      budgetLimit: input.rules.budgetLimit,
      horizonRounds: input.horizonRounds
    }
  });

  await prisma.$transaction([
    prisma.userFantasySquadPlayer.deleteMany({ where: { squadId: squad.id } }),
    ...input.selections.map((selection, index) =>
      prisma.userFantasySquadPlayer.create({
        data: {
          squadId: squad.id,
          playerId: BigInt(selection.playerId),
          teamId: rosterByPlayerId.get(selection.playerId)?.teamId ?? null,
          position: sportsPositionsByPlayerId.get(selection.playerId) ?? rosterByPlayerId.get(selection.playerId)?.position ?? null,
          isStarter: selection.isStarter,
          isLocked: selection.isLocked,
          slotIndex: selection.slotIndex ?? index,
          purchasePrice: selection.purchasePrice
        }
      })
    )
  ]);

  return squad;
}

export function fantasyRulesForLeague(
  league: SharedLeagueSeasonOption,
  contest: {
    budgetLimit: number;
    squadSize: number;
    maxPlayersPerTeam: number;
    name: string;
  } | null
): FantasySquadRules {
  const inferredMaxPlayers = isTopFiveLeague(league) ? 3 : 2;
  return {
    ...defaultFantasySquadRules,
    budgetLimit: contest?.budgetLimit ?? 100,
    squadSize: contest?.squadSize ?? defaultFantasySquadRules.squadSize,
    maxPlayersPerTeam: contest?.maxPlayersPerTeam ?? inferredMaxPlayers,
    sourceLabel: contest ? `Sports.ru: ${contest.name}` : isTopFiveLeague(league) ? "Inferred top-five league rules" : "Inferred default Sports.ru rules"
  };
}

async function loadProjectedPlayerRows(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const teams = await loadSharedLeagueTeams(prisma, league.leagueId, league.season);
  const rows = await loadSharedMachetePlayerRows(prisma, {
    scopes: teams.map((team) => ({
      leagueId: league.leagueId,
      season: league.season,
      teamId: team.id
    })),
    matchWindow: { kind: "last", matches: 5 }
  });

  return rows.map((row) => {
    const parts = row.id.split(":");
    return {
      ...row,
      teamId: parts[2] ?? "",
      playerId: parts[3] ?? ""
    };
  });
}

async function loadUpcomingRoundFixtures(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const now = new Date();
  const [matches, teamStrengthProfiles] = await Promise.all([
    prisma.coreMatch.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        cancelled: false,
        OR: [{ finished: false }, { matchDate: { gte: now } }]
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } }
      },
      orderBy: [{ matchDate: "asc" }, { id: "asc" }],
      take: 180
    }),
    loadTeamStrengthProfiles(prisma, league.leagueId, league.season)
  ]);
  const coreFixtures = buildPlannerRoundFixtures(
    matches.map((match) => ({
      id: String(match.id),
      round: match.round,
      matchDate: match.matchDate,
      homeTeamId: match.homeTeamId ? String(match.homeTeamId) : null,
      awayTeamId: match.awayTeamId ? String(match.awayTeamId) : null,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      finished: match.finished,
      cancelled: match.cancelled
    })),
    now
  );

  if (coreFixtures.rounds.length > 0) return applyFixtureStrength(coreFixtures, teamStrengthProfiles);

  return applyFixtureStrength(await loadLegacyMacheteUpcomingRoundFixtures(prisma, league, now), teamStrengthProfiles);
}

export function buildPlannerRoundFixtures(matches: PlannerMatch[], now = new Date()): PlannerRoundFixtures {
  const upcoming = matches.filter((match) => !match.finished && !match.cancelled && (!match.matchDate || match.matchDate >= startOfTodayUtc(now)));
  const grouped = groupMatchesByRound(upcoming.length > 0 ? upcoming : matches.filter((match) => !match.finished && !match.cancelled));
  const rounds = grouped.slice(0, maxProjectionRounds).map((group, index) => ({
    id: group.id,
    label: group.label || `Round ${index + 1}`,
    startsAt: group.startsAt?.toISOString() ?? null,
    fixtureCount: group.matches.length
  }));
  const selectedRoundIds = new Set(rounds.map((round) => round.id));
  const fixturesByTeamRound = new Map<string, Map<string, PlannerFixture[]>>();

  for (const group of grouped) {
    if (!selectedRoundIds.has(group.id)) continue;
    for (const match of group.matches) {
      if (match.homeTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.homeTeamId,
          opponentTeamId: match.awayTeamId,
          opponentName: match.awayTeamName ?? "Opponent",
          side: "H",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null
        });
      }
      if (match.awayTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.awayTeamId,
          opponentTeamId: match.homeTeamId,
          opponentName: match.homeTeamName ?? "Opponent",
          side: "A",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null
        });
      }
    }
  }

  return {
    rounds,
    fixturesByTeamRound
  };
}

export function projectFixtureFantasyPoints(
  basePoints: number,
  positionGroup: FantasyPositionGroup,
  fixture: FantasyFixtureProjection
) {
  return basePoints * fixtureMultiplier(fixture, positionGroup);
}

export function buildTeamStrengthProfilesFromMatches(matches: TeamStrengthMatchInput[]): TeamStrengthProfiles {
  const samples: TeamStrengthSample[] = [];

  for (const match of matches) {
    for (const stat of match.teamStats) {
      const teamId = stat.teamId.trim();
      if (!teamId) continue;

      const opponent = findOpponentTeamStat(match, stat);
      const side = teamStatSide(match, stat);
      if (!side) continue;

      samples.push({
        teamId,
        side,
        xgFor: numericOrNull(stat.xg) ?? numericOrNull(stat.goals),
        xgAgainst: numericOrNull(opponent?.xg) ?? numericOrNull(opponent?.goals)
      });
    }
  }

  const teamIds = new Set(samples.map((sample) => sample.teamId));
  const byTeamId = new Map<string, TeamStrengthProfile>();
  for (const teamId of teamIds) {
    const teamSamples = samples.filter((sample) => sample.teamId === teamId);
    byTeamId.set(teamId, profileFromSamples(teamSamples));
  }

  return {
    byTeamId,
    league: profileFromSamples(samples)
  };
}

function applyFixtureStrength(fixtures: PlannerRoundFixtures, profiles: TeamStrengthProfiles): PlannerRoundFixtures {
  for (const roundFixtures of fixtures.fixturesByTeamRound.values()) {
    for (const teamFixtures of roundFixtures.values()) {
      for (const fixture of teamFixtures) {
        const projection = fixtureStrengthProjection(fixture, profiles);
        fixture.projectedXg = projection.projectedXg;
        fixture.projectedXga = projection.projectedXga;
        fixture.attackMultiplier = projection.attackMultiplier;
        fixture.defenseMultiplier = projection.defenseMultiplier;
      }
    }
  }

  return fixtures;
}

function fixtureStrengthProjection(
  fixture: Pick<PlannerFixture, "teamId" | "opponentTeamId" | "side">,
  profiles: TeamStrengthProfiles
) {
  const side = fixture.side === "H" ? "home" : "away";
  const opponentSide = fixture.side === "H" ? "away" : "home";
  const teamProfile = profiles.byTeamId.get(fixture.teamId);
  const opponentProfile = fixture.opponentTeamId ? profiles.byTeamId.get(fixture.opponentTeamId) : undefined;
  const own = strengthBlockForSide(teamProfile, side, profiles.league);
  const opponent = strengthBlockForSide(opponentProfile, opponentSide, profiles.league);
  const ownOverall = strengthBlockForSide(teamProfile, null, profiles.league);

  const projectedXg = averageKnown([own.xgForPerMatch, opponent.xgAgainstPerMatch]);
  const projectedXga = averageKnown([own.xgAgainstPerMatch, opponent.xgForPerMatch]);
  const attackBase = own.xgForPerMatch ?? ownOverall.xgForPerMatch ?? profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const defenseBase = own.xgAgainstPerMatch ?? ownOverall.xgAgainstPerMatch ?? profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;

  return {
    projectedXg,
    projectedXga,
    attackMultiplier: ratioMultiplier(projectedXg, attackBase),
    defenseMultiplier: ratioMultiplier(defenseBase, projectedXga)
  };
}

async function loadTeamStrengthProfiles(prisma: PrismaClient, leagueId: bigint, season: string) {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId,
      season,
      finished: true,
      cancelled: false
    },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    take: 600,
    select: {
      homeTeamId: true,
      awayTeamId: true,
      teamStats: {
        select: {
          teamId: true,
          opponentTeamId: true,
          isHome: true,
          xg: true,
          goals: true
        }
      }
    }
  });

  return buildTeamStrengthProfilesFromMatches(
    matches.map((match) => ({
      homeTeamId: stringifyBigInt(match.homeTeamId),
      awayTeamId: stringifyBigInt(match.awayTeamId),
      teamStats: match.teamStats.map((stat) => ({
        teamId: String(stat.teamId),
        opponentTeamId: stringifyBigInt(stat.opponentTeamId),
        isHome: stat.isHome,
        xg: stat.xg,
        goals: stat.goals
      }))
    }))
  );
}

export async function loadSportsRuFantasyPositionsByPlayerId(
  prisma: PrismaClient,
  input: {
    leagueId: bigint;
    season: string;
  }
) {
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) },
      position: { not: null }
    },
    select: {
      id: true,
      playerId: true,
      position: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (priceRows.length === 0) return new Map<string, string>();

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "SPORTS_RU",
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceRows.map((row) => row.id) },
      internalEntityType: "PLAYER",
      internalEntityId: { not: null }
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });
  const mappedPlayerIdsByPriceId = new Map(maps.map((row) => [row.providerEntityId, row.internalEntityId]));
  const positionsByPlayerId = new Map<string, string>();

  for (const row of priceRows) {
    if (!row.position) continue;
    const playerId = mappedPlayerIdsByPriceId.get(row.id) ?? (row.playerId ? String(row.playerId) : null);
    if (!playerId || positionsByPlayerId.has(playerId)) continue;
    positionsByPlayerId.set(playerId, row.position);
  }

  return positionsByPlayerId;
}

async function loadLegacyMacheteUpcomingRoundFixtures(prisma: PrismaClient, league: SharedLeagueSeasonOption, now: Date) {
  const macheteLeague = await prisma.macheteLeague.findFirst({
    where: {
      provider: "FOTMOB",
      providerLeagueId: String(league.leagueId),
      OR: [{ season: { in: sportsRuSeasonAliases(league.season) } }, { season: null }]
    }
  });
  if (!macheteLeague) return buildPlannerRoundFixtures([], now);

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId: macheteLeague.id,
      OR: [{ status: { notIn: ["FINISHED", "PLAYED", "CANCELLED", "POSTPONED"] } }, { kickoffAt: { gte: startOfTodayUtc(now) } }]
    },
    include: {
      homeTeam: { select: { providerTeamId: true, name: true } },
      awayTeam: { select: { providerTeamId: true, name: true } }
    },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    take: 180
  });

  return buildPlannerRoundFixtures(
    fixtures.map((fixture) => ({
      id: fixture.providerFixtureId ?? fixture.id,
      round: legacyFixtureRound(fixture.raw),
      matchDate: fixture.kickoffAt,
      homeTeamId: fixture.homeTeam?.providerTeamId ?? null,
      awayTeamId: fixture.awayTeam?.providerTeamId ?? null,
      homeTeamName: fixture.homeTeam?.name ?? null,
      awayTeamName: fixture.awayTeam?.name ?? null,
      finished: fixture.status === "FINISHED" || fixture.status === "PLAYED",
      cancelled: fixture.status === "CANCELLED" || fixture.status === "POSTPONED"
    })),
    now
  );
}

function groupMatchesByRound<T extends { id: string; round: string | null; matchDate: Date | null }>(matches: T[]) {
  const groups = new Map<string, { id: string; label: string; startsAt: Date | null; rank: number; matches: T[] }>();
  for (const match of matches) {
    const roundLabel = normalizeRoundLabel(match.round);
    const dateKey = match.matchDate ? match.matchDate.toISOString().slice(0, 10) : `fixture-${match.id}`;
    const id = roundLabel ? `round:${roundLabel}` : `date:${dateKey}`;
    const label = roundLabel ? `Round ${roundLabel}` : formatDate(match.matchDate);
    const existing = groups.get(id);
    if (existing) {
      existing.matches.push(match);
      if (dateMs(match.matchDate) < dateMs(existing.startsAt)) existing.startsAt = match.matchDate;
      continue;
    }

    groups.set(id, {
      id,
      label,
      startsAt: match.matchDate,
      rank: roundLabel ? Number(roundLabel) || dateMs(match.matchDate) : dateMs(match.matchDate),
      matches: [match]
    });
  }

  return [...groups.values()].sort((left, right) => left.rank - right.rank || dateMs(left.startsAt) - dateMs(right.startsAt));
}

function addTeamFixture(map: Map<string, Map<string, PlannerFixture[]>>, roundId: string, fixture: PlannerFixture) {
  const roundMap = map.get(roundId) ?? new Map<string, PlannerFixture[]>();
  const fixtures = roundMap.get(fixture.teamId) ?? [];
  fixtures.push(fixture);
  roundMap.set(fixture.teamId, fixtures);
  map.set(roundId, roundMap);
}

function findOpponentTeamStat(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]) {
  const opponentTeamId =
    stat.opponentTeamId ??
    (stat.teamId === match.homeTeamId ? match.awayTeamId : stat.teamId === match.awayTeamId ? match.homeTeamId : null);

  return (
    match.teamStats.find((candidate) => opponentTeamId && candidate.teamId === opponentTeamId) ??
    match.teamStats.find((candidate) => candidate.teamId !== stat.teamId) ??
    null
  );
}

function teamStatSide(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]): TeamStrengthSide | null {
  if (stat.isHome === true) return "home";
  if (stat.isHome === false) return "away";
  if (stat.teamId === match.homeTeamId) return "home";
  if (stat.teamId === match.awayTeamId) return "away";
  return null;
}

function profileFromSamples(samples: TeamStrengthSample[]): TeamStrengthProfile {
  return {
    home: strengthBlock(samples.filter((sample) => sample.side === "home")),
    away: strengthBlock(samples.filter((sample) => sample.side === "away")),
    overall: strengthBlock(samples)
  };
}

function strengthBlock(samples: TeamStrengthSample[]): TeamStrengthBlock {
  return {
    matches: samples.length,
    xgForPerMatch: averageKnown(samples.map((sample) => sample.xgFor)),
    xgAgainstPerMatch: averageKnown(samples.map((sample) => sample.xgAgainst))
  };
}

function strengthBlockForSide(
  profile: TeamStrengthProfile | undefined,
  side: TeamStrengthSide | null,
  leagueProfile: TeamStrengthProfile
): TeamStrengthBlock {
  const preferred = side ? profile?.[side] : profile?.overall;
  if (preferred && hasStrengthSignal(preferred)) return preferred;
  if (profile?.overall && hasStrengthSignal(profile.overall)) return profile.overall;
  if (side && hasStrengthSignal(leagueProfile[side])) return leagueProfile[side];
  if (hasStrengthSignal(leagueProfile.overall)) return leagueProfile.overall;

  return {
    matches: 0,
    xgForPerMatch: defaultTeamXgPerMatch,
    xgAgainstPerMatch: defaultTeamXgPerMatch
  };
}

function hasStrengthSignal(block: TeamStrengthBlock) {
  return block.matches > 0 && (block.xgForPerMatch !== null || block.xgAgainstPerMatch !== null);
}

function ratioMultiplier(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return clamp(numerator / denominator, 0.72, 1.28);
}

function priceLookup(
  priceRows: Array<{
    id: string;
    playerId: bigint | null;
    playerName: string;
    normalizedName: string;
    teamName: string;
    position: string | null;
    price: number;
  }>,
  priceMaps: Array<{
    providerEntityId: string;
    internalEntityId: string | null;
  }>
) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const byPlayerId = new Map<string, (typeof priceRows)[number]>();
  const byNameTeam = new Map<string, (typeof priceRows)[number]>();
  for (const row of priceRows) {
    const mappedPlayerId = mappedPlayerIdsByPriceId.get(row.id);
    if (mappedPlayerId) {
      byPlayerId.set(mappedPlayerId, row);
    } else if (row.playerId) {
      byPlayerId.set(String(row.playerId), row);
    }
    byNameTeam.set(nameTeamKey(row.playerName, row.teamName), row);
  }
  return {
    byPlayerId,
    byNameTeam,
    findByPlayerName(playerName: string) {
      const normalizedPlayerName = normalizeName(playerName);
      return priceRows.find((row) => {
        const normalizedPriceName = row.normalizedName || normalizeName(row.playerName);
        return normalizedPriceName.length >= 3 && normalizedPlayerName.split(" ").includes(normalizedPriceName);
      });
    }
  };
}

export function fantasyPlannerPosition(
  sportsPosition: string | null | undefined,
  rosterPosition: string | null | undefined,
  projectedPosition: string | null | undefined
) {
  return sportsPosition ?? rosterPosition ?? projectedPosition ?? null;
}

function estimateFantasyPrice(score: number | null, positionGroup: string) {
  const safeScore = Math.max(0, score ?? 0);
  const base = positionGroup === "GK" ? 4.5 : positionGroup === "DEF" ? 4.5 : positionGroup === "MID" ? 5 : 5.5;
  const multiplier = positionGroup === "GK" ? 0.28 : positionGroup === "DEF" ? 0.38 : positionGroup === "MID" ? 0.48 : 0.55;
  return Math.min(13.5, Math.max(3.5, roundFantasyValue(base + safeScore * multiplier)));
}

function fixtureMultiplier(fixture: FantasyFixtureProjection, positionGroup: FantasyPositionGroup) {
  const venueMultiplier = fixture.side === "H" ? 1.04 : 0.96;
  const attack = fixture.attackMultiplier ?? 1;
  const defense = fixture.defenseMultiplier ?? 1;
  const positionBlend =
    positionGroup === "GK" || positionGroup === "DEF"
      ? 1 + (attack - 1) * 0.12 + (defense - 1) * 0.42
      : positionGroup === "MID"
        ? 1 + (attack - 1) * 0.32 + (defense - 1) * 0.12
        : positionGroup === "FWD"
          ? 1 + (attack - 1) * 0.48
          : 1 + (attack - 1) * 0.24 + (defense - 1) * 0.12;

  return clamp(venueMultiplier * positionBlend, 0.68, 1.35);
}

function comparePlannerPlayers(left: FantasyPlannerPlayer, right: FantasyPlannerPlayer) {
  return (right.roundPoints[0] ?? right.predictedFp ?? 0) - (left.roundPoints[0] ?? left.predictedFp ?? 0) || right.valueScore - left.valueScore || left.name.localeCompare(right.name);
}

function playerTeamKey(playerId: string | number | bigint, teamId: string | number | bigint) {
  return `${playerId}:${teamId}`;
}

function nameTeamKey(playerName: string, teamName: string) {
  return `${normalizeName(playerName)}:${normalizeName(teamName)}`;
}

function isTopFiveLeague(league: Pick<SharedLeagueSeasonOption, "leagueId" | "name" | "displayName" | "country">) {
  const name = `${league.name} ${league.displayName} ${league.country ?? ""}`.toLowerCase();
  return (
    String(league.leagueId) === "47" ||
    ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((candidate) => name.includes(candidate))
  );
}

function normalizeRoundLabel(value: string | null) {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match?.[0] ?? value.trim();
}

function stringifyBigInt(value: bigint | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

function dateMs(value: Date | null) {
  return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function startOfTodayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function sportsRuSeasonAliases(season: string) {
  const values = new Set([season]);
  const long = season.match(/^(\d{4})\/(\d{4})$/);
  if (long) values.add(`${long[1]}/${long[2].slice(-2)}`);
  const short = season.match(/^(\d{4})\/(\d{2})$/);
  if (short) values.add(`${short[1]}/20${short[2]}`);
  return [...values];
}

function legacyFixtureRound(raw: unknown) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const value = record.round ?? record.roundName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function displayLeagueName(league: SharedLeagueSeasonOption) {
  return macheteLeagueDisplayName({
    id: league.providerLeagueId,
    name: league.name,
    country: league.country,
    providerLeagueId: league.providerLeagueId
  });
}

function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function averageKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return null;
  return sum(known) / known.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
