import type { CsvColumn } from "@/lib/csv";
import { compactPlayerDisplayName } from "@/lib/players/display-name";

export type LeagueStartingXiTeam = {
  id: bigint;
  name: string;
  players: Array<{
    name: string;
    position: string | null;
    shirtNumber: number | null;
    isStarter?: boolean;
    startProbability?: number | null;
    expectedMinutes?: number | null;
    predictedFp?: number | null;
  }>;
};

type StartingXiExportRow = Record<string, string>;

const positionOrder = new Map([
  ["GK", 0], ["G", 0], ["GOALKEEPER", 0],
  ["DEF", 1], ["D", 1], ["DEFENDER", 1],
  ["MID", 2], ["M", 2], ["MIDFIELDER", 2],
  ["FWD", 3], ["FW", 3], ["F", 3], ["FORWARD", 3]
]);

export function buildLeagueStartingXiTable(teams: LeagueStartingXiTeam[]) {
  const orderedTeams = teams
    .map((team) => ({ ...team, players: probableStartingPlayers(team.players).sort(comparePlayers) }))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  const keys = orderedTeams.map((_, index) => `team_${index}`);
  const rowCount = Math.max(0, ...orderedTeams.map((team) => team.players.length));
  const rows: StartingXiExportRow[] = Array.from({ length: rowCount }, (_, rowIndex) =>
    Object.fromEntries(
      orderedTeams.map((team, teamIndex) => [keys[teamIndex], compactPlayerDisplayName(team.players[rowIndex]?.name ?? "")])
    )
  );
  const columns: CsvColumn<StartingXiExportRow>[] = orderedTeams.map((team, index) => ({
    header: team.name,
    value: (row) => row[keys[index]] ?? ""
  }));

  return { rows, columns };
}

export function probableStartingPlayers<T extends LeagueStartingXiTeam["players"][number]>(players: T[]) {
  return [...players]
    .sort((left, right) =>
      Number(right.isStarter) - Number(left.isStarter) ||
      (right.startProbability ?? 0) - (left.startProbability ?? 0) ||
      (right.expectedMinutes ?? 0) - (left.expectedMinutes ?? 0) ||
      (right.predictedFp ?? 0) - (left.predictedFp ?? 0) ||
      left.name.localeCompare(right.name, "en", { sensitivity: "base" })
    )
    .slice(0, 11);
}

function comparePlayers(left: LeagueStartingXiTeam["players"][number], right: LeagueStartingXiTeam["players"][number]) {
  const positionDifference = playerPositionRank(left.position) - playerPositionRank(right.position);
  if (positionDifference !== 0) return positionDifference;
  const shirtDifference = (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) - (right.shirtNumber ?? Number.MAX_SAFE_INTEGER);
  if (shirtDifference !== 0) return shirtDifference;
  return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
}

function playerPositionRank(position: string | null) {
  return positionOrder.get(position?.trim().toUpperCase() ?? "") ?? 4;
}
