import type { PrismaClient } from "@prisma/client";

import { FANTASY_MODEL_VERSION } from "./foontasy_style_model";

export const STARTING_XI_SIZE = 11;

export type RosterCoverageRow = {
  teamId: bigint;
  playersCount: number;
  startersCount: number;
  forecastPlayers: number;
  startingXiChangedAt: Date | null;
};

export type StartingXiCoverageStatus = "EMPTY" | "NONE" | "PARTIAL" | "FULL" | "OVERSIZED";
export type ForecastCoverageStatus = "NONE" | "PARTIAL" | "FULL";
export type RosterCoverageSummary = {
  teams: number;
  teamsWithRoster: number;
  teamsWithoutRoster: number;
  completeStartingXiTeams: number;
  teamsWithStartingFlags: number;
  teamsWithoutForecasts: number;
  teamsWithForecasts: number;
  latestStartingXiChangedAt: Date | null;
};

export async function loadRosterCoverage(prisma: PrismaClient, leagueId: bigint, season: string): Promise<RosterCoverageRow[]> {
  const [teamRows, rosterRows] = await Promise.all([
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId, season, active: true },
      select: { teamId: true, startingXiChangedAt: true }
    }),
    prisma.teamPlayerSeason.findMany({
      where: { leagueId, season, active: true },
      select: { teamId: true, playerId: true, isStarter: true }
    })
  ]);
  const playerIds = [...new Set(rosterRows.map((row) => row.playerId))];
  const forecastRows = playerIds.length === 0
    ? []
    : await prisma.fantasyModelForecast.findMany({
        where: {
          leagueId,
          season,
          playerId: { in: playerIds },
          horizon: 3,
          modelVersion: FANTASY_MODEL_VERSION,
          points: { not: null },
          status: { not: "INSUFFICIENT_DATA" }
        },
        select: { playerId: true }
      });
  const forecastPlayerIds = new Set(forecastRows.map((row) => String(row.playerId)));
  const byTeam = new Map<string, { playersCount: number; startersCount: number; forecastPlayers: number }>();

  for (const row of rosterRows) {
    const key = String(row.teamId);
    const current = byTeam.get(key) ?? { playersCount: 0, startersCount: 0, forecastPlayers: 0 };
    current.playersCount += 1;
    if (row.isStarter) current.startersCount += 1;
    if (forecastPlayerIds.has(String(row.playerId))) current.forecastPlayers += 1;
    byTeam.set(key, current);
  }

  return teamRows.map((team) => ({
    teamId: team.teamId,
    ...(byTeam.get(String(team.teamId)) ?? { playersCount: 0, startersCount: 0, forecastPlayers: 0 }),
    startingXiChangedAt: team.startingXiChangedAt
  }));
}

export function startingXiCoverageStatus(row: Pick<RosterCoverageRow, "playersCount" | "startersCount">): StartingXiCoverageStatus {
  if (row.playersCount === 0) return "EMPTY";
  if (row.startersCount > STARTING_XI_SIZE) return "OVERSIZED";
  if (row.startersCount === STARTING_XI_SIZE) return "FULL";
  if (row.startersCount > 0) return "PARTIAL";
  return "NONE";
}

export function forecastCoverageStatus(row: Pick<RosterCoverageRow, "playersCount" | "forecastPlayers">): ForecastCoverageStatus {
  if (row.playersCount === 0 || row.forecastPlayers === 0) return "NONE";
  return row.forecastPlayers < row.playersCount ? "PARTIAL" : "FULL";
}

export function summarizeRosterCoverage(rows: RosterCoverageRow[]): RosterCoverageSummary {
  const teamsWithRoster = rows.filter((row) => row.playersCount > 0);
  return {
    teams: rows.length,
    teamsWithRoster: teamsWithRoster.length,
    teamsWithoutRoster: rows.length - teamsWithRoster.length,
    completeStartingXiTeams: rows.filter((row) => startingXiCoverageStatus(row) === "FULL").length,
    teamsWithStartingFlags: rows.filter((row) => row.startersCount > 0).length,
    teamsWithoutForecasts: teamsWithRoster.filter((row) => row.forecastPlayers === 0).length,
    teamsWithForecasts: teamsWithRoster.filter((row) => row.forecastPlayers > 0).length,
    latestStartingXiChangedAt: rows.reduce<Date | null>((latest, row) => {
      if (!row.startingXiChangedAt) return latest;
      return !latest || row.startingXiChangedAt.getTime() > latest.getTime() ? row.startingXiChangedAt : latest;
    }, null)
  };
}
