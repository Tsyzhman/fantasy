// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import type { FantasyRoundProjection } from "./squad_logic";
import { roundForecastPoints } from "./squad_logic";
import type { ComponentProjectionIndex, PlannerRoundFixtures } from "./squad-projection";
import { fixturePlayerProjectionKey } from "./squad-projection";
import { squadResearchForecasts, type SquadResearchRound } from "./squad-research-columns";
import { researchFixturePoints, researchFixtureInputFromProjection, type ResearchForecastHistory } from "./squad-research-forecast";
import { sportsRuResearchRidge } from "./squad-research-ridge";
import type { PlannerFixture } from "./squad-team-strength";

export function researchForecastableRounds(schedule: PlannerRoundFixtures, asOf: Date) {
  return schedule.rounds.map((round) => researchRoundCalendarComplete(round, schedule, asOf));
}

function researchRoundCalendarComplete(round: FantasyRoundProjection, schedule: PlannerRoundFixtures, asOf: Date) {
  if (!round.id.startsWith("sports-ru:tour:") || !round.startsAt || !(Date.parse(round.startsAt) > +asOf)) return false;
  const sides = new Map<string, { home?: PlannerFixture; away?: PlannerFixture }>();
  for (const fixtures of schedule.fixturesByTeamRound.get(round.id)?.values() ?? []) {
    for (const fixture of fixtures) {
      if (fixture.finished || !fixture.opponentTeamId || !fixture.kickoffAt || !(+fixture.kickoffAt > +asOf)) return false;
      const entry = sides.get(fixture.id) ?? {};
      const side = fixture.side === "H" ? "home" : "away";
      if (entry[side]) return false;
      entry[side] = fixture;
      sides.set(fixture.id, entry);
    }
  }
  return sides.size > 0 && sides.size === round.fixtureCount &&
    [...sides.values()].every(({ home, away }) => home && away &&
      home.teamId !== away.teamId && home.teamId === away.opponentTeamId && away.teamId === home.opponentTeamId);
}

export function scoreSquadResearchRound(
  forecastable: boolean,
  fixtures: readonly PlannerFixture[],
  playerId: string,
  position: string,
  index: ComponentProjectionIndex,
  history?: ResearchForecastHistory,
  recent?: readonly number[]
): SquadResearchRound | null {
  if (!forecastable) return null;
  const total: SquadResearchRound = squadResearchForecasts.map(() => 0);
  for (const fixture of fixtures) {
    const projection = index.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId));
    const input = researchFixtureInputFromProjection(position, projection, history, recent);
    if (!input) return null;
    for (const [i, { id }] of squadResearchForecasts.entries()) {
      const value = researchFixturePoints(id, input, sportsRuResearchRidge);
      const prior = total[i];
      total[i] = value === null || prior === null ? null : prior + value;
    }
  }
  return total.map((points) => points === null ? null : roundForecastPoints(points));
}
