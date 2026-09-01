import {
  fixtureDifficultyFromSignal,
  type FantasyFixtureCalendar,
  type FantasyFixtureCalendarMatch,
  type FantasyFixtureCalendarTeam
} from "./squad-fixture-calendar";
import type { PlannerRoundFixtures } from "./squad_planner";

/** Serialize each fixture once per league, not once for every player or even both teams. */
export function buildFantasyFixtureCalendar(source: PlannerRoundFixtures): FantasyFixtureCalendar {
  const teams = new Map<string, FantasyFixtureCalendarTeam>();
  function addTeam(id: string, name: string, shortName?: string) {
    if (teams.has(id)) return;
    const fullName = source.teamFullNameById?.get(id) ?? name;
    teams.set(id, { id, name: fullName, shortName: source.teamShortNameById.get(id) ?? shortName ?? fullName });
  }
  for (const [id, name] of source.teamFullNameById ?? []) addTeam(id, name);
  const rounds = source.rounds.slice(0, 10).map((round) => ({
    id: round.id, label: round.label, startsAt: round.startsAt, fixtures: [] as FantasyFixtureCalendarMatch[]
  }));
  const roundFixtures = new Map(rounds.map((round) => [round.id, new Map<string, FantasyFixtureCalendarMatch>()]));
  for (const [roundId, byTeam] of source.fixturesByTeamRound) {
    const matches = roundFixtures.get(roundId);
    if (!matches) continue;
    for (const [teamId, fixtures] of byTeam) {
      for (const fixture of fixtures) {
        addTeam(teamId, fixture.teamFullName ?? fixture.teamName ?? teamId, fixture.teamName);
        if (fixture.opponentTeamId) addTeam(fixture.opponentTeamId, fixture.opponentFullName, fixture.opponentName);
        let match = matches.get(fixture.id);
        if (!match) {
          match = {
            id: fixture.id, homeTeamId: null, awayTeamId: null,
            kickoffAt: fixture.kickoffAt?.toISOString() ?? null, finished: fixture.finished === true,
            homeAttack: null, homeDefense: null, awayAttack: null, awayDefense: null
          };
          matches.set(fixture.id, match);
        }
        if (fixture.side === "H") {
          match.homeTeamId = teamId;
          match.awayTeamId = fixture.opponentTeamId;
          match.homeAttack = fixtureDifficultyFromSignal(fixture.attackMultiplier);
          match.homeDefense = fixtureDifficultyFromSignal(fixture.defenseMultiplier);
          if (!fixture.opponentTeamId) match.awayUnmappedName = fixture.opponentFullName || fixture.opponentName;
        } else {
          match.awayTeamId = teamId;
          match.homeTeamId = fixture.opponentTeamId;
          match.awayAttack = fixtureDifficultyFromSignal(fixture.attackMultiplier);
          match.awayDefense = fixtureDifficultyFromSignal(fixture.defenseMultiplier);
          if (!fixture.opponentTeamId) match.homeUnmappedName = fixture.opponentFullName || fixture.opponentName;
        }
      }
    }
  }
  for (const round of rounds) {
    round.fixtures = [...roundFixtures.get(round.id)!.values()].sort((left, right) =>
      (left.kickoffAt ?? "9999").localeCompare(right.kickoffAt ?? "9999") || left.id.localeCompare(right.id)
    );
  }
  return { version: 1, teams: [...teams.values()], rounds };
}
