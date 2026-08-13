import assert from "node:assert/strict";
import test from "node:test";

import { forecastCoverageStatus, startingXiCoverageStatus, summarizeRosterCoverage } from "./roster-coverage";

test("roster coverage distinguishes empty, partial, full, and oversized XIs", () => {
  assert.equal(startingXiCoverageStatus({ playersCount: 0, startersCount: 0 }), "EMPTY");
  assert.equal(startingXiCoverageStatus({ playersCount: 20, startersCount: 0 }), "NONE");
  assert.equal(startingXiCoverageStatus({ playersCount: 20, startersCount: 7 }), "PARTIAL");
  assert.equal(startingXiCoverageStatus({ playersCount: 20, startersCount: 11 }), "FULL");
  assert.equal(startingXiCoverageStatus({ playersCount: 20, startersCount: 12 }), "OVERSIZED");
});

test("forecast coverage does not mistake a roster with no forecast rows for a complete team", () => {
  assert.equal(forecastCoverageStatus({ playersCount: 0, forecastPlayers: 0 }), "NONE");
  assert.equal(forecastCoverageStatus({ playersCount: 20, forecastPlayers: 0 }), "NONE");
  assert.equal(forecastCoverageStatus({ playersCount: 20, forecastPlayers: 8 }), "PARTIAL");
  assert.equal(forecastCoverageStatus({ playersCount: 20, forecastPlayers: 20 }), "FULL");
});

test("league coverage summarizes complete XIs, rosters, forecasts, and latest flag update", () => {
  const latest = new Date("2026-08-12T12:00:00.000Z");
  const summary = summarizeRosterCoverage([
    { teamId: 1n, playersCount: 20, startersCount: 11, forecastPlayers: 20, startingXiChangedAt: new Date("2026-08-10T12:00:00.000Z") },
    { teamId: 2n, playersCount: 18, startersCount: 4, forecastPlayers: 0, startingXiChangedAt: latest },
    { teamId: 3n, playersCount: 0, startersCount: 0, forecastPlayers: 0, startingXiChangedAt: null }
  ]);

  assert.deepEqual(summary, {
    teams: 3,
    teamsWithRoster: 2,
    teamsWithoutRoster: 1,
    completeStartingXiTeams: 1,
    teamsWithStartingFlags: 2,
    teamsWithoutForecasts: 1,
    teamsWithForecasts: 1,
    latestStartingXiChangedAt: latest
  });
});
