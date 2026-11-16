// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerFixtureProjection } from "./deterministic_fantasy_projection";
import type { PlannerRoundFixtures, ComponentProjectionIndex } from "./squad-projection";
import type { PlannerFixture } from "./squad-team-strength";
import { researchForecastableRounds, scoreSquadResearchRound } from "./squad-research-projection";
import { researchFixtureInput, researchFixtureInputFromProjection, researchFixturePoints } from "./squad-research-forecast";
import { fixturePlayerProjectionKey, fixtureTeamProjectionKey } from "./squad-projection";
import { squadResearchForecasts } from "./squad-research-columns";
import { SquadFivePlusHistory, type FivePlusHistoryRow } from "./squad-research-five-plus-history";
import { fivePlusFixtureFeatures } from "./squad-research-five-plus-features";
import { scoreSquadFivePlusRound } from "./squad-research-five-plus";

const kickoffAt = new Date("2026-11-20T18:00:00Z");
const asOf = new Date("2026-11-20T17:00:00Z");
const roundId = "sports-ru:tour:11:2509";
const home: PlannerFixture = {
  id: "match-1", roundId, teamId: "one", opponentTeamId: "two", opponentName: "Two", opponentFullName: "Two",
  side: "H", kickoffAt, projectedXg: 1.5, projectedXga: 1.1, attackMultiplier: null, defenseMultiplier: null
};
const away: PlannerFixture = { ...home, teamId: "two", opponentTeamId: "one", side: "A" };

function schedule(sides: PlannerFixture[], fixtureCount = 1): PlannerRoundFixtures {
  return {
    rounds: [{ id: roundId, label: "11", startsAt: kickoffAt.toISOString(), fixtureCount }],
    fixturesByTeamRound: new Map([[roundId, new Map(sides.map((fixture) => [fixture.teamId, [fixture]]))]]),
    teamShortNameById: new Map()
  };
}

const projection: PlayerFixtureProjection = {
  playerId: "player",
  position: "MID",
  expectedMinutes: 73,
  probabilities: { appearance: 0.91, sixtyMinutes: 0.75, fullMatch: 0.53 },
  allocationWeights: { goals: 0.2, assists: 0.3, recoveries: 3, saves: 0 },
  expectedEvents: { goals: 0.251, assists: 0.105, recoveries: 2.4, saves: 0, yellowCards: 0.1, redCards: 0, goalsConceded: 0, cleanSheets: 0.18 },
  components: { appearance: 0.91, sixtyMinutes: 0.75, fullMatch: 0.53, goals: 0, assists: 0, cleanSheet: 0, saves: 0, recoveries: 0, goalsConceded: 0, yellowCards: 0, redCards: 0, total: 0 }
};

test("research forecasts require the complete provider calendar and a round that has not started", () => {
  assert.deepEqual(researchForecastableRounds(schedule([home, away]), asOf), [true]);
  assert.deepEqual(researchForecastableRounds(schedule([home]), asOf), [false]);
  assert.deepEqual(researchForecastableRounds(schedule([home, away], 2), asOf), [false]);
  assert.deepEqual(researchForecastableRounds(schedule([home, { ...away, finished: true }]), asOf), [false]);
  assert.deepEqual(researchForecastableRounds(schedule([home, away]), kickoffAt), [false]);
});

test("the five research scores add both fixtures and distinguish blank and missing", () => {
  const next = { ...home, id: "match-2" };
  const index: ComponentProjectionIndex = {
    byFixturePlayer: new Map([[fixturePlayerProjectionKey(home.id, projection.playerId), projection]]),
    formulaMetricsByFixturePlayer: new Map(),
    errorsByFixtureTeam: new Map()
  };
  const player = projection.playerId;
  assert.deepEqual(scoreSquadResearchRound(true, [], player, "MID", index), [0, 0, 0, 0, 0]);
  assert.equal(scoreSquadResearchRound(false, [], player, "MID", index), null);
  assert.equal(scoreSquadResearchRound(true, [home, next], player, "MID", index), null);
  index.byFixturePlayer.set(fixturePlayerProjectionKey(next.id, player), projection);
  const values = scoreSquadResearchRound(true, [home, next], player, "MID", index)!;
  assert.equal(values.length, 5);
  assert.ok(values.every((value) => typeof value === "number" && value > 0));
  const input = researchFixtureInputFromProjection("MID", projection, undefined, undefined)!;
  const single = researchFixturePoints("rules", input)!;
  assert.equal(values[squadResearchForecasts.findIndex(({ id }) => id === "rules")], Math.round(single * 2 * 100) / 100);
});

test("archived components and live fixture components produce the same model input", () => {
  const { expectedEvents: e, probabilities: p } = projection;
  const archived = researchFixtureInput("MID", 73, 0.91, {
    sixtyMinutesProbability: p.sixtyMinutes, fullMatchProbability: p.fullMatch,
    expectedGoals: e.goals, expectedAssists: e.assists, expectedCleanSheets: e.cleanSheets,
    expectedGoalsConceded: e.goalsConceded, expectedSaves: e.saves, expectedRecoveries: e.recoveries,
    expectedYellowCards: e.yellowCards, expectedRedCards: e.redCards
  }, undefined, [2, 0, 6]);
  assert.deepEqual(archived, researchFixtureInputFromProjection("MID", projection, undefined, [2, 0, 6]));
  assert.equal(researchFixtureInput("MID", null, 0, {}, undefined, []), null);
});

test("5+ history respects availability for player stats, team stats and odds", () => {
  const recent: FivePlusHistoryRow = {
    match: "before", kickoff: "2026-11-17T16:00:00", created: "2026-11-17T16:00:00",
    home: home.teamId, away: away.teamId,
    teams: [
      [home.teamId, "2026-11-20T17:01:00", [9], [2], "2026-11-18T16:00:00"],
      [away.teamId, "2026-11-18T16:00:00", [2], [9], "2026-11-20T17:01:00"]
    ],
    players: [[projection.playerId, home.teamId, "2026-11-20T17:01:00", 90, true, false, [9]]]
  };
  const future: FivePlusHistoryRow = {
    ...recent, match: "future", kickoff: "2026-11-21T16:00:00", created: "2026-11-18T00:00:00",
    players: []
  };
  const history = new SquadFivePlusHistory([recent, future, {
    odds: home.id, snapshot: ["2026-11-19T17:00:00Z", 0.6, 0.3, 0.5, 0.2]
  }]);
  const context = fivePlusFixtureFeatures({ ...home, matchId: home.id }, +asOf, history);
  assert.equal(context.team[2], 1);
  assert.equal(context.team[15], null);
  assert.equal(context.team[63], 2);
  assert.deepEqual(context.team.slice(-4), [0.6, 0.3, 0.5, 0.2]);
  assert.deepEqual(history.market(home.id, +asOf, false), [0.3, 0.6, 0.2, 0.5]);
  assert.deepEqual(history.market(home.id, +new Date("2026-11-19T16:59:59Z"), true), [null, null, null, null]);
  assert.equal(context.player(projection.playerId)[0], 0);
  assert.equal(history.player(home.teamId, projection.playerId, +asOf + 120_000, +kickoffAt)[0], 1);
  assert.throws(() => new SquadFivePlusHistory([recent, recent]), /Duplicate match/);
});

test("5+ publishes five bounded probabilities for singles, zero for a blank and unavailable for doubles", () => {
  const id = projection.playerId;
  const index: ComponentProjectionIndex = {
    byFixturePlayer: new Map([[fixturePlayerProjectionKey(home.id, id), projection]]),
    formulaMetricsByFixturePlayer: new Map(), errorsByFixtureTeam: new Map()
  };
  const history = new SquadFivePlusHistory([]);
  const features = new Map([[fixtureTeamProjectionKey(home.id, home.teamId), fivePlusFixtureFeatures(home, +asOf, history)]]);
  const score = (forecastable: boolean, fixtures: PlannerFixture[], playerId = id) =>
    scoreSquadFivePlusRound(forecastable, fixtures, playerId, "MID", index, features, { age: 23, price: 8, starter: true });
  const values = score(true, [home]);
  assert.equal(values?.length, 5);
  assert.ok(values.every((value) => typeof value === "number" && value > 0 && value < 100));
  assert.deepEqual(score(true, []), [0, 0, 0, 0, 0]);
  assert.equal(score(false, [home]), null);
  assert.equal(score(true, [home, { ...home, id: "double" }]), null);
  assert.equal(score(true, [home], "missing"), null);
});
