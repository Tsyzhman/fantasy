import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveScoringModel } from "@/lib/scoring";
import { aggregateRecentMachetePlayerStats, parseRecentMatchWindow, recentTeamFixtureIds } from "./recent-match-stats";

const model: ActiveScoringModel = {
  modelSource: "MACHETE",
  customFormula: null,
  customFormulaGk: null,
  customFormulaDef: null,
  customFormulaMid: null,
  customFormulaFwd: null,
  customFormulaEnabled: false,
  scoringFormulaGk: null,
  scoringFormulaDef: null,
  scoringFormulaMid: null,
  scoringFormulaFwd: null,
  scoringFormulaEnabled: false,
  alternativeFormulaGk: null,
  alternativeFormulaDef: null,
  alternativeFormulaMid: null,
  alternativeFormulaFwd: null,
  alternativeFormulaEnabled: false,
  rules: []
};

test("recent team fixture ids use latest played matches only", () => {
  const fixtures = [
    fixture("old", "FINISHED", "2026-01-01"),
    fixture("scheduled", "SCHEDULED", "2026-01-20"),
    fixture("middle", "FINISHED", "2026-01-10"),
    fixture("latest", "FINISHED", "2026-01-15"),
    fixture("aggregate", "SEASON_AGGREGATE", null)
  ];

  assert.deepEqual([...recentTeamFixtureIds(fixtures, 2)], ["latest", "middle"]);
});

test("recent player stats aggregate only selected team fixtures", () => {
  const fixtureIds = new Set(["latest", "middle"]);
  const stats = [
    stat("old", 90, 3, 0),
    stat("middle", 70, 1, 1),
    stat("latest", 20, 0, 0)
  ];

  const result = aggregateRecentMachetePlayerStats(stats, "FWD", model, fixtureIds);

  assert.equal(result.matchesPlayed, 2);
  assert.equal(result.minutesPlayed, 90);
  assert.equal(result.goals, 1);
  assert.equal(result.assists, 1);
  assert.equal(result.shotsOnTarget, 1);
});

test("recent match window parser clamps positive integers", () => {
  assert.equal(parseRecentMatchWindow("7"), 7);
  assert.equal(parseRecentMatchWindow("200"), 50);
  assert.equal(parseRecentMatchWindow("0"), null);
  assert.equal(parseRecentMatchWindow("nope"), null);
});

function fixture(id: string, status: string | null, kickoffAt: string | null) {
  return {
    id,
    status,
    kickoffAt: kickoffAt ? new Date(`${kickoffAt}T12:00:00.000Z`) : null
  };
}

function stat(fixtureId: string, minutes: number, goals: number, assists: number) {
  return {
    fixtureId,
    fixture: fixture(fixtureId, "FINISHED", "2026-01-01"),
    minutes,
    rating: 7,
    goals,
    assists,
    shotsOnTarget: goals,
    keyPasses: assists,
    tackles: 0,
    interceptions: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0
  };
}
