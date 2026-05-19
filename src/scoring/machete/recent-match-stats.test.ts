import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveScoringModel } from "@/lib/scoring";
import { fixtureSyncSeasons, parseMacheteMatchWindow, previousSeasonLabel } from "./match-window";
import { aggregateRecentMachetePlayerStats, recentTeamFixtureIds, teamFixtureIdsForWindow } from "./recent-match-stats";

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

test("match window parser supports presets and custom match counts", () => {
  assert.deepEqual(parseMacheteMatchWindow({ mode: "last10" }), { kind: "last", matches: 10 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "7" }), { kind: "last", matches: 7 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "200" }), { kind: "last", matches: 50 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "previous" }), { kind: "season", offset: -1 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "all" }), { kind: "all" });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "nope" }), { kind: "last", matches: 5 });
});

test("team fixture ids support current, previous, and all season windows", () => {
  const fixtures = [
    fixture("previous", "FINISHED", "2024-09-01"),
    fixture("current", "FINISHED", "2025-09-01"),
    fixture("future", "SCHEDULED", "2025-10-01")
  ];

  assert.deepEqual([...teamFixtureIdsForWindow(fixtures, { kind: "season", offset: 0 }, "2025/26")], ["current"]);
  assert.deepEqual([...teamFixtureIdsForWindow(fixtures, { kind: "season", offset: -1 }, "2025/26")], ["previous"]);
  assert.deepEqual([...teamFixtureIdsForWindow(fixtures, { kind: "all" }, "2025/26")], ["previous", "current"]);
});

test("previous season labels support domestic seasons and World Cup tournaments", () => {
  assert.equal(previousSeasonLabel("2025/26", "48"), "2024/25");
  assert.equal(previousSeasonLabel("2025/2026", "48"), "2024/2025");
  assert.equal(previousSeasonLabel("2025/26", "77"), "2022");
  assert.deepEqual(fixtureSyncSeasons("2025/26", "48"), ["2025/26", "2024/25"]);
  assert.deepEqual(fixtureSyncSeasons("2025/26", "77"), ["2025/26", "2022"]);
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
