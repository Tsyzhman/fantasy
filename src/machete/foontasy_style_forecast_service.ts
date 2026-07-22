import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeFantasyPosition } from "@/machete/squad_logic";
import {
  FANTASY_MODEL_VERSION,
  calculatePlayerHorizons,
  defaultFantasyModelConfig,
  selectTeamProjection,
  type ModelFixture,
  type ModelPlayer,
  type PlayerHistoryRow,
  type RateProfile
} from "@/machete/foontasy_style_model";
import type { FantasyPosition } from "@/machete/deterministic_fantasy_projection";

export type RecalculateFantasyModelOptions = {
  leagueId: bigint;
  season: string;
  calculatedAt?: Date;
};

export async function recalculateFantasyModelForecasts(prisma: PrismaClient, options: RecalculateFantasyModelOptions) {
  const calculatedAt = options.calculatedAt ?? new Date();
  const roster = await prisma.teamPlayerSeason.findMany({
    where: { leagueId: options.leagueId, season: options.season, active: true },
    include: { player: true, team: true }
  });
  const teamIds = [...new Set(roster.map((row) => row.teamId))];
  const futureMatches = await prisma.coreMatch.findMany({
    where: {
      leagueId: options.leagueId, season: options.season, finished: false, cancelled: false,
      matchDate: { gte: calculatedAt }, homeTeamId: { in: teamIds }, awayTeamId: { in: teamIds }
    },
    include: { homeTeam: true, awayTeam: true, oddsSnapshots: { orderBy: { fetchedAt: "desc" } } },
    orderBy: { matchDate: "asc" }
  });
  const historicalMatches = await prisma.coreMatch.findMany({
    where: { leagueId: options.leagueId, season: options.season, finished: true, matchDate: { lt: calculatedAt } },
    include: { teamStats: true },
    orderBy: { matchDate: "desc" }
  });
  const playerStats = await prisma.matchPlayerStat.findMany({
    where: {
      playerId: { in: roster.map((row) => row.playerId) },
      match: {
        finished: true,
        matchDate: { lt: calculatedAt },
        league: { OR: [{ country: null }, { country: { not: "International" } }] }
      }
    },
    include: { match: { select: { matchDate: true } } },
    orderBy: { match: { matchDate: "desc" } }
  });

  const historyByPlayer = new Map<string, PlayerHistoryRow[]>();
  for (const row of playerStats) {
    if (!row.match.matchDate) continue;
    const historyRow: PlayerHistoryRow = {
      matchDate: row.match.matchDate,
      minutes: Math.max(0, row.minutes ?? 0),
      started: row.started,
      xg: row.xg,
      xa: row.xa,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      yellowCards: row.yellowCards ?? 0,
      redCards: row.redCards ?? 0,
      saves: row.saves ?? 0,
      recoveries: row.recoveries ?? 0
    };
    const key = String(row.playerId);
    historyByPlayer.set(key, [...(historyByPlayer.get(key) ?? []), historyRow]);
  }

  const positionByPlayer = new Map<string, FantasyPosition>();
  for (const row of roster) positionByPlayer.set(String(row.playerId), modelPosition(row.position));
  const leagueFallbacks = buildFallbackProfiles(roster.map((row) => ({
    teamId: String(row.teamId),
    playerId: String(row.playerId),
    position: positionByPlayer.get(String(row.playerId))!,
    history: historyByPlayer.get(String(row.playerId)) ?? []
  })));
  const teamFallbacks = buildFallbackProfiles(roster.map((row) => ({
    teamId: String(row.teamId), playerId: String(row.playerId), position: positionByPlayer.get(String(row.playerId))!,
    history: historyByPlayer.get(String(row.playerId)) ?? []
  })), true);

  const players: ModelPlayer[] = roster.map((row) => {
    const position = positionByPlayer.get(String(row.playerId))!;
    return {
      playerId: String(row.playerId), teamId: String(row.teamId), position,
      history: historyByPlayer.get(String(row.playerId)) ?? [],
      teamPositionFallback: teamFallbacks.get(`${row.teamId}:${position}`) ?? null,
      leaguePositionFallback: leagueFallbacks.get(position) ?? defaultProfile(position),
      isRosterStarter: row.isStarter
    };
  });

  const formByTeam = buildTeamForms(historicalMatches, teamIds);
  const eventTotalsByTeam = buildTeamEventTotals(playerStats);
  const fixtures: ModelFixture[] = [];
  for (const match of futureMatches) {
    if (!match.matchDate || !match.homeTeamId || !match.awayTeamId || !match.homeTeam || !match.awayTeam) continue;
    const odds = match.oddsSnapshots[0] ?? null;
    for (const side of ["home", "away"] as const) {
      const isHome = side === "home";
      const teamId = isHome ? match.homeTeamId : match.awayTeamId;
      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = isHome ? match.awayTeam : match.homeTeam;
      const teamForm = formByTeam.get(String(teamId));
      const opponentForm = formByTeam.get(String(opponentId));
      const teamVenue = isHome ? teamForm?.home : teamForm?.away;
      const opponentVenue = isHome ? opponentForm?.away : opponentForm?.home;
      const xgForm = teamVenue?.xgFor !== null && teamVenue?.xgFor !== undefined && opponentVenue?.xgAgainst !== null && opponentVenue?.xgAgainst !== undefined
        ? { expectedGoals: (teamVenue.xgFor + opponentVenue.xgAgainst) / 2, expectedGoalsAgainst: ((teamVenue.xgAgainst ?? 1.25) + (opponentVenue.xgFor ?? 1.25)) / 2, matches: Math.min(teamVenue.matches, opponentVenue.matches) }
        : null;
      const goalsForm = {
        expectedGoals: ((teamVenue?.goalsFor ?? 1.25) + (opponentVenue?.goalsAgainst ?? 1.25)) / 2,
        expectedGoalsAgainst: ((teamVenue?.goalsAgainst ?? 1.25) + (opponentVenue?.goalsFor ?? 1.25)) / 2,
        matches: Math.min(teamVenue?.matches ?? 0, opponentVenue?.matches ?? 0)
      };
      fixtures.push({
        id: String(match.id), round: match.round, kickoffAt: match.matchDate,
        teamId: String(teamId), opponentId: String(opponentId), opponentName: opponent.name, isHome,
        teamProjection: selectTeamProjection({
          odds: odds ? {
            over15Probability: isHome ? odds.homeOver15Probability : odds.awayOver15Probability,
            cleanSheetProbability: isHome ? odds.homeCleanSheetProbability : odds.awayCleanSheetProbability,
            fetchedAt: odds.fetchedAt
          } : null,
          xgForm,
          goalsForm
        }, match.matchDate, defaultFantasyModelConfig, calculatedAt),
        expectedRecoveries: eventTotalsByTeam.get(String(teamId))?.recoveries ?? teamForm?.recoveries ?? 45,
        expectedSaves: eventTotalsByTeam.get(String(teamId))?.saves ?? teamForm?.saves ?? 3
      });
    }
  }

  const forecasts = calculatePlayerHorizons(players, fixtures, defaultFantasyModelConfig);
  await prisma.$transaction(forecasts.map((forecast) => prisma.fantasyModelForecast.upsert({
    where: {
      leagueId_season_playerId_horizon_modelVersion: {
        leagueId: options.leagueId, season: options.season, playerId: BigInt(forecast.playerId),
        horizon: forecast.horizon, modelVersion: FANTASY_MODEL_VERSION
      }
    },
    create: {
      leagueId: options.leagueId, season: options.season, playerId: BigInt(forecast.playerId), horizon: forecast.horizon,
      points: forecast.points, fixturesAvailable: forecast.fixturesAvailable, fixturesRequired: forecast.fixturesRequired,
      status: forecast.status, modelVersion: FANTASY_MODEL_VERSION,
      inputSources: sourceSummary(forecast.breakdown) as Prisma.InputJsonValue,
      breakdown: forecast.breakdown as Prisma.InputJsonValue, calculatedAt
    },
    update: {
      points: forecast.points, fixturesAvailable: forecast.fixturesAvailable, fixturesRequired: forecast.fixturesRequired,
      status: forecast.status, inputSources: sourceSummary(forecast.breakdown) as Prisma.InputJsonValue,
      breakdown: forecast.breakdown as Prisma.InputJsonValue, calculatedAt
    }
  })));
  return { players: players.length, fixtures: futureMatches.length, forecasts: forecasts.length, calculatedAt: calculatedAt.toISOString(), modelVersion: FANTASY_MODEL_VERSION };
}

type FallbackInput = { teamId: string; playerId: string; position: FantasyPosition; history: PlayerHistoryRow[] };

function buildFallbackProfiles(players: FallbackInput[], byTeam = false) {
  const groups = new Map<string, FallbackInput[]>();
  for (const player of players) {
    const key = byTeam ? `${player.teamId}:${player.position}` : player.position;
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  return new Map([...groups].flatMap(([key, group]) => {
    const position = key.includes(":") ? key.split(":")[1] as FantasyPosition : key as FantasyPosition;
    if (!byTeam) return [[key, profileFromRows(group.flatMap((player) => player.history), position)] as const];
    const profiles = group.filter((player) => player.history.length > 0).map((player) => profileFromRows(player.history, position));
    return profiles.length > 0 ? [[key, medianProfile(profiles)] as const] : [];
  }));
}

function profileFromRows(rows: PlayerHistoryRow[], position: FantasyPosition): RateProfile {
  if (rows.length === 0) return defaultProfile(position);
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const rate = (value: (row: PlayerHistoryRow) => number) => minutes > 0 ? rows.reduce((sum, row) => sum + value(row), 0) / minutes * 90 : 0;
  return {
    expectedMinutes: rows.reduce((sum, row) => sum + row.minutes, 0) / rows.length,
    appearance: rows.filter((row) => row.minutes > 0).length / rows.length,
    sixtyMinutes: rows.filter((row) => row.minutes >= 60).length / rows.length,
    fullMatch: rows.filter((row) => row.minutes >= 85).length / rows.length,
    xg90: rate((row) => row.xg ?? row.goals), xa90: rate((row) => row.xa ?? row.assists),
    yellowCards90: rate((row) => row.yellowCards), redCards90: rate((row) => row.redCards),
    saves90: rate((row) => row.saves), recoveries90: rate((row) => row.recoveries)
  };
}

function defaultProfile(position: FantasyPosition): RateProfile {
  return {
    expectedMinutes: 30, appearance: 0.55, sixtyMinutes: 0.25, fullMatch: 0.15,
    xg90: position === "FWD" ? 0.25 : position === "MID" ? 0.15 : 0.05,
    xa90: position === "MID" ? 0.15 : 0.08, yellowCards90: 0.12, redCards90: 0.01,
    saves90: position === "GK" ? 3 : 0, recoveries90: position === "GK" ? 0 : 5
  };
}

function medianProfile(profiles: RateProfile[]) {
  const keys = Object.keys(profiles[0]) as Array<keyof RateProfile>;
  return Object.fromEntries(keys.map((key) => [key, median(profiles.map((profile) => profile[key]))])) as RateProfile;
}

type TeamFormMatch = {
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  homeScore: number | null;
  awayScore: number | null;
  teamStats: Array<{ teamId: bigint; xg: number | null; saves: number | null }>;
};

type VenueTeamForm = { matches: number; xgFor: number | null; xgAgainst: number | null; goalsFor: number; goalsAgainst: number };
type TeamForm = { matches: number; home: VenueTeamForm; away: VenueTeamForm; saves: number; recoveries: number };

function buildTeamForms(matches: TeamFormMatch[], teamIds: bigint[]) {
  const allHomeXg = matches.map((match) => match.teamStats.find((row) => row.teamId === match.homeTeamId)?.xg ?? null).filter((value): value is number => value !== null);
  const allAwayXg = matches.map((match) => match.teamStats.find((row) => row.teamId === match.awayTeamId)?.xg ?? null).filter((value): value is number => value !== null);
  const homeXgBaseline = allHomeXg.length > 0 ? mean(allHomeXg) : 1.4;
  const awayXgBaseline = allAwayXg.length > 0 ? mean(allAwayXg) : 1.1;
  const homeGoalsBaseline = meanOr(matches.map((match) => match.homeScore).filter((value): value is number => value !== null), 1.4);
  const awayGoalsBaseline = meanOr(matches.map((match) => match.awayScore).filter((value): value is number => value !== null), 1.1);
  const result = new Map<string, TeamForm>();
  for (const teamId of teamIds) {
    const rows = matches.filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId).slice(0, 10);
    const observations = rows.map((match) => {
      const isHome = match.homeTeamId === teamId;
      const own = match.teamStats.find((row) => row.teamId === teamId);
      const opponent = match.teamStats.find((row) => row.teamId !== teamId);
      return {
        isHome,
        xgFor: own?.xg ?? null,
        xgAgainst: opponent?.xg ?? null,
        goalsFor: (isHome ? match.homeScore : match.awayScore) ?? 0,
        goalsAgainst: (isHome ? match.awayScore : match.homeScore) ?? 0,
        saves: own?.saves ?? 3
      };
    });
    const venueForm = (isHome: boolean): VenueTeamForm => {
      const venue = observations.filter((row) => row.isHome === isHome);
      const xgFor = venue.map((row) => row.xgFor).filter((value): value is number => value !== null);
      const xgAgainst = venue.map((row) => row.xgAgainst).filter((value): value is number => value !== null);
      const forBaseline = isHome ? homeXgBaseline : awayXgBaseline;
      const againstBaseline = isHome ? awayXgBaseline : homeXgBaseline;
      const goalsForBaseline = isHome ? homeGoalsBaseline : awayGoalsBaseline;
      const goalsAgainstBaseline = isHome ? awayGoalsBaseline : homeGoalsBaseline;
      return {
        matches: venue.length,
        xgFor: xgFor.length > 0 ? shrunkMean(xgFor, forBaseline) : null,
        xgAgainst: xgAgainst.length > 0 ? shrunkMean(xgAgainst, againstBaseline) : null,
        goalsFor: shrunkMean(venue.map((row) => row.goalsFor), goalsForBaseline),
        goalsAgainst: shrunkMean(venue.map((row) => row.goalsAgainst), goalsAgainstBaseline)
      };
    };
    result.set(String(teamId), {
      matches: observations.length,
      home: venueForm(true),
      away: venueForm(false),
      saves: observations.length > 0 ? mean(observations.map((row) => row.saves)) : 3,
      recoveries: 45
    });
  }
  return result;
}

function sourceSummary(breakdown: Array<{ teamProjection: { source: string }; rates: { source: string } }>) {
  return {
    teamProjectionSources: [...new Set(breakdown.map((item) => item.teamProjection.source))],
    playerRateSources: [...new Set(breakdown.map((item) => item.rates.source))]
  };
}

function buildTeamEventTotals(rows: Array<{ matchId: bigint; teamId: bigint | null; saves: number | null; recoveries: number | null }>) {
  const byTeamMatch = new Map<string, { teamId: string; saves: number; recoveries: number }>();
  for (const row of rows) {
    if (!row.teamId) continue;
    const key = `${row.teamId}:${row.matchId}`;
    const current = byTeamMatch.get(key) ?? { teamId: String(row.teamId), saves: 0, recoveries: 0 };
    current.saves += row.saves ?? 0;
    current.recoveries += row.recoveries ?? 0;
    byTeamMatch.set(key, current);
  }
  const teams = new Map<string, Array<{ saves: number; recoveries: number }>>();
  for (const row of byTeamMatch.values()) teams.set(row.teamId, [...(teams.get(row.teamId) ?? []), row]);
  return new Map([...teams].map(([teamId, matches]) => [teamId, {
    saves: mean(matches.slice(0, 10).map((row) => row.saves)),
    recoveries: mean(matches.slice(0, 10).map((row) => row.recoveries))
  }]));
}

function modelPosition(position: string | null): FantasyPosition {
  const normalized = normalizeFantasyPosition(position);
  return normalized === "GK" || normalized === "DEF" || normalized === "MID" || normalized === "FWD" ? normalized : "MID";
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanOr(values: number[], fallback: number) {
  return values.length > 0 ? mean(values) : fallback;
}

function shrunkMean(values: number[], prior: number, priorMatches = 6) {
  return (values.reduce((sum, value) => sum + value, 0) + prior * priorMatches) / (values.length + priorMatches);
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
