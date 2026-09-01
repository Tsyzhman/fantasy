export type FantasyFixtureCalendarMode = "attack" | "defense";
export type FantasyFixtureCalendarHorizon = 5 | 6 | 7 | 8 | 9 | 10;

export type FantasyFixtureCalendarTeam = { id: string; name: string; shortName: string };
export type FantasyFixtureCalendarMatch = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffAt: string | null;
  finished: boolean;
  homeAttack: number | null;
  homeDefense: number | null;
  awayAttack: number | null;
  awayDefense: number | null;
  homeUnmappedName?: string;
  awayUnmappedName?: string;
};
export type FantasyFixtureCalendarRound = {
  id: string;
  label: string;
  startsAt: string | null;
  fixtures: FantasyFixtureCalendarMatch[];
};
export type FantasyFixtureCalendar = {
  version: 1;
  teams: FantasyFixtureCalendarTeam[];
  rounds: FantasyFixtureCalendarRound[];
};

export type FantasyFixtureCalendarCell = {
  fixtureId: string;
  opponentName: string;
  opponentShortName: string;
  side: "home" | "away";
  kickoffAt: string | null;
  finished: boolean;
  difficulty: number | null;
};
export type FantasyFixtureCalendarRow = {
  team: FantasyFixtureCalendarTeam;
  cells: FantasyFixtureCalendarCell[][];
  averageDifficulty: number | null;
  ratedFixtures: number;
  fixtureCount: number;
};

/** Shared with the player-table FDR: a larger strength signal is an easier fixture. */
export function fixtureDifficultyFromSignal(signal: number | null | undefined): number | null {
  if (signal === null || signal === undefined || !Number.isFinite(signal)) return null;
  if (signal >= 1.18) return 1;
  if (signal >= 1.06) return 2;
  if (signal >= 0.94) return 3;
  if (signal >= 0.82) return 4;
  return 5;
}

export function fantasyFixtureCalendarHorizon(value: number): FantasyFixtureCalendarHorizon {
  return value === 6 || value === 7 || value === 8 || value === 9 || value === 10 ? value : 5;
}

/** No player data, caches or server imports: changing the view only ranks a few dozen teams. */
export function rankFantasyFixtureCalendar(
  calendar: FantasyFixtureCalendar,
  mode: FantasyFixtureCalendarMode,
  horizon: FantasyFixtureCalendarHorizon
): { rounds: FantasyFixtureCalendarRound[]; rows: FantasyFixtureCalendarRow[] } {
  const rounds = calendar.rounds.slice(0, horizon);
  const rows = calendar.teams.map((team): FantasyFixtureCalendarRow => ({
    team, cells: rounds.map(() => []), averageDifficulty: null, ratedFixtures: 0, fixtureCount: 0
  }));
  const rowsByTeam = new Map(rows.map((row) => [row.team.id, row]));
  for (const [roundIndex, round] of rounds.entries()) {
    for (const fixture of round.fixtures) {
      for (const side of ["home", "away"] as const) {
        const teamId = side === "home" ? fixture.homeTeamId : fixture.awayTeamId;
        const opponentId = side === "home" ? fixture.awayTeamId : fixture.homeTeamId;
        const row = teamId ? rowsByTeam.get(teamId) : null;
        if (!row) continue;
        const opponent = opponentId ? rowsByTeam.get(opponentId)?.team : null;
        const fallbackName = (side === "home" ? fixture.awayUnmappedName : fixture.homeUnmappedName) ?? "—";
        const difficulty = side === "home"
          ? (mode === "attack" ? fixture.homeAttack : fixture.homeDefense)
          : (mode === "attack" ? fixture.awayAttack : fixture.awayDefense);
        row.cells[roundIndex].push({
          fixtureId: fixture.id,
          opponentName: opponent?.name ?? fallbackName,
          opponentShortName: opponent?.shortName ?? fallbackName,
          side, kickoffAt: fixture.kickoffAt, finished: fixture.finished, difficulty
        });
        row.fixtureCount += 1;
        if (difficulty !== null) {
          row.ratedFixtures += 1;
          row.averageDifficulty = (row.averageDifficulty ?? 0) + difficulty;
        }
      }
    }
  }
  for (const row of rows) {
    if (row.averageDifficulty !== null) row.averageDifficulty /= row.ratedFixtures;
  }
  rows.sort((left, right) => {
    if (left.averageDifficulty === null && right.averageDifficulty !== null) return 1;
    if (left.averageDifficulty !== null && right.averageDifficulty === null) return -1;
    return (left.averageDifficulty ?? 0) - (right.averageDifficulty ?? 0)
      || left.team.name.localeCompare(right.team.name, "en")
      || left.team.id.localeCompare(right.team.id, "en");
  });
  return { rounds, rows };
}

/** Older snapshots have no calendar. Never turn missing/corrupt metadata into green fixtures. */
export function parseFantasyFixtureCalendar(value: unknown): FantasyFixtureCalendar | null {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.teams) || !Array.isArray(value.rounds)) return null;
  if (value.teams.length > 100 || value.rounds.length > 10) return null;
  const teamIds = new Set<string>();
  for (const team of value.teams) {
    if (!isObject(team) || !nonemptyString(team.id) || !nonemptyString(team.name) || !nonemptyString(team.shortName)) return null;
    if (teamIds.has(team.id)) return null;
    teamIds.add(team.id);
  }
  const roundIds = new Set<string>();
  const fixtureIds = new Set<string>();
  for (const round of value.rounds) {
    if (!isObject(round) || !nonemptyString(round.id) || !nonemptyString(round.label) || !dateOrNull(round.startsAt)) return null;
    if (roundIds.has(round.id) || !Array.isArray(round.fixtures) || round.fixtures.length > 250) return null;
    roundIds.add(round.id);
    for (const fixture of round.fixtures) {
      if (!isObject(fixture) || !nonemptyString(fixture.id) || fixtureIds.has(fixture.id)) return null;
      fixtureIds.add(fixture.id);
      if (!dateOrNull(fixture.kickoffAt) || typeof fixture.finished !== "boolean") return null;
      for (const key of ["homeTeamId", "awayTeamId"] as const) {
        const id = fixture[key];
        if (id !== null && (typeof id !== "string" || !teamIds.has(id))) return null;
      }
      for (const key of ["homeAttack", "homeDefense", "awayAttack", "awayDefense"] as const) {
        const rating = fixture[key];
        if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)) return null;
      }
      for (const key of ["homeUnmappedName", "awayUnmappedName"] as const) {
        if (fixture[key] !== undefined && !nonemptyString(fixture[key])) return null;
      }
    }
  }
  return value as unknown as FantasyFixtureCalendar;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dateOrNull(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}
