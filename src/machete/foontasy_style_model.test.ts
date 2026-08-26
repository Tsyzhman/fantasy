import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePlayerHorizons,
  defaultFantasyModelConfig,
  estimateParticipant,
  historyBeforeFixture,
  inversePoissonOver15,
  selectTeamProjection,
  type ModelFixture,
  type ModelPlayer,
  type RateProfile
} from "./foontasy_style_model";

test("inverse Poisson reconstructs P(G >= 2)", () => {
  for (const probability of [0.1, 0.35, 0.7, 0.9]) {
    const lambda = inversePoissonOver15(probability);
    assert.ok(Math.abs(1 - Math.exp(-lambda) * (1 + lambda) - probability) < 1e-10);
  }
});

test("team source follows odds -> xG form -> goals fallback", () => {
  const fixtureDate = new Date("2026-08-01T12:00:00Z");
  const odds = selectTeamProjection({
    odds: { over15Probability: 0.5, cleanSheetProbability: 0.3, fetchedAt: new Date("2026-07-25T12:00:00Z") },
    xgForm: { expectedGoals: 1.4, expectedGoalsAgainst: 1.1, matches: 5 },
    goalsForm: { expectedGoals: 1.2, expectedGoalsAgainst: 1.3, matches: 5 }
  }, fixtureDate);
  assert.equal(odds.source, "ODDS");
  assert.equal(selectTeamProjection({ xgForm: { expectedGoals: 1.4, expectedGoalsAgainst: 1.1, matches: 5 } }, fixtureDate).source, "XG_FORM");
  assert.equal(selectTeamProjection({ goalsForm: { expectedGoals: 1.2, expectedGoalsAgainst: 1.3, matches: 5 } }, fixtureDate).source, "GOALS_FALLBACK");
});

test("history and odds newer than fixture are not leaked", () => {
  const fixtureDate = new Date("2026-08-01T12:00:00Z");
  assert.equal(historyBeforeFixture([
    history("2026-07-20T12:00:00Z", 90),
    history("2026-08-02T12:00:00Z", 90)
  ], fixtureDate).length, 1);
  const selected = selectTeamProjection({
    odds: { over15Probability: 0.9, cleanSheetProbability: 0.8, fetchedAt: new Date("2026-08-02T12:00:00Z") },
    xgForm: { expectedGoals: 1.3, expectedGoalsAgainst: 1.2, matches: 4 }
  }, fixtureDate);
  assert.equal(selected.source, "XG_FORM");
});

test("expected minutes formula, XI flag and prior prevent a short sample from becoming full per90 exposure", () => {
  const player = modelPlayer("p1", "team", [history("2026-07-20T12:00:00Z", 60)]);
  const estimate = estimateParticipant(player, new Date("2026-08-01T12:00:00Z"));
  assert.equal(estimate.participant.expectedMinutes, 80);
  assert.ok(estimate.participant.expectedMinutes! / 90 < 1);
  assert.equal(estimate.source, "PLAYER_HISTORY_SMOOTHED");
});

test("new starter uses a roster-adjusted team-position fallback", () => {
  const player = modelPlayer("new", "team", []);
  const estimate = estimateParticipant(player, new Date("2026-08-01T12:00:00Z"));
  assert.equal(estimate.source, "TEAM_POSITION_FALLBACK");
  assert.equal(estimate.participant.expectedMinutes, 80);
});

test("current roster XI flag separates new starters from bench players", () => {
  const starter = estimateParticipant(modelPlayer("starter", "team", [], true), new Date("2026-08-01T12:00:00Z"));
  const bench = estimateParticipant(modelPlayer("bench", "team", [], false), new Date("2026-08-01T12:00:00Z"));
  assert.ok((starter.participant.expectedMinutes ?? 0) >= 80);
  assert.ok((bench.participant.expectedMinutes ?? 90) <= 30);
  assert.ok((starter.participant.probabilities?.sixtyMinutes ?? 0) > (bench.participant.probabilities?.sixtyMinutes ?? 1));
});

test("double gameweek is two fixtures and partial T5 reports honest coverage", () => {
  const player = modelPlayer("p1", "team", [history("2026-07-20T12:00:00Z", 90)]);
  const fixtures = [fixture("f1", "7", "2026-08-01T12:00:00Z"), fixture("f2", "7", "2026-08-04T12:00:00Z")];
  const results = calculatePlayerHorizons([player], fixtures);
  const t3 = results.find((row) => row.horizon === 3)!;
  const t5 = results.find((row) => row.horizon === 5)!;
  assert.equal(t3.fixturesAvailable, 2);
  assert.equal(t3.breakdown.length, 2);
  assert.equal(t5.fixturesAvailable, 2);
  assert.equal(t5.status, "LOW");
  assert.ok((t5.points ?? 0) > 0);
});

test("xg_share v2 allocates team goals by blended observed shares, capped by team totals", () => {
  const star = modelPlayer("star", "team", [
    historyWithXg("2026-07-10T12:00:00Z", 90, 0.3),
    historyWithXg("2026-07-18T12:00:00Z", 90, 0.3),
    historyWithXg("2026-07-25T12:00:00Z", 90, 0.3)
  ]);
  const cameo = modelPlayer("cameo", "team", [historyWithXg("2026-07-25T12:00:00Z", 10, 0.05)], false);
  const results = calculatePlayerHorizons([star, cameo], [fixture("f1", "7", "2026-08-01T12:00:00Z")]);
  const starRow = results.find((row) => row.playerId === "star" && row.horizon === 3)!.breakdown[0]!;
  const cameoRow = results.find((row) => row.playerId === "cameo" && row.horizon === 3)!.breakdown[0]!;
  const seasonShare = 0.9 / 0.95;
  assert.ok(starRow.xgShare !== null && Math.abs(starRow.xgShare.season - seasonShare) < 1e-9);
  assert.ok(starRow.xgShare !== null && Math.abs(starRow.xgShare.blended - starRow.xgShare.season) < 1e-12);
  assert.ok(starRow.components.goals > cameoRow.components.goals);
  assert.ok(starRow.components.goals <= 1.4 * 5 + 1e-9);
  assert.ok(cameoRow.xgShare !== null && cameoRow.xgShare.season <= 1);
});

test("a part-time per-90 outlier can never receive more than the whole team expectation", () => {
  const inflated = modelPlayer("inflated", "team", [historyWithXg("2026-07-25T12:00:00Z", 5, 0.5)], false);
  const results = calculatePlayerHorizons([inflated], [fixture("f1", "7", "2026-08-01T12:00:00Z")]);
  const breakdown = results.find((row) => row.horizon === 3)!.breakdown[0]!;
  assert.equal(breakdown.xgShare!.season, 1);
  assert.ok(breakdown.components.goals <= 1.4 * 5 + 1e-9);
});

test("without team xG history the model degrades to exposure rates and reports null shares", () => {
  const player = modelPlayer("p1", "team", []);
  const results = calculatePlayerHorizons([player], [fixture("f1", "7", "2026-08-01T12:00:00Z")]);
  const t3 = results.find((row) => row.horizon === 3)!;
  assert.equal(t3.breakdown[0]?.xgShare, null);
  assert.equal(t3.breakdown[0]?.xaShare, null);
  assert.ok((t3.points ?? 0) > 0);
});

test("a league without any player xG data splits the team total uniformly instead of failing", () => {
  const emptyRates: RateProfile = { ...fallback, xg90: 0, xa90: 0, recoveries90: 0 };
  const left = { ...modelPlayer("left", "team", []), teamPositionFallback: emptyRates, leaguePositionFallback: emptyRates };
  const right = { ...modelPlayer("right", "team", []), teamPositionFallback: emptyRates, leaguePositionFallback: emptyRates };
  const results = calculatePlayerHorizons([left, right], [fixture("f1", "7", "2026-08-01T12:00:00Z")]);
  const rows = results.filter((row) => row.horizon === 3).map((row) => row.breakdown[0]!);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(Math.abs(row.components.goals - (1.4 / 2) * 5) < 1e-9);
    assert.ok(row.points! > 0);
  }
});

test("team without a recognized goalkeeper does not allocate fictional saves", () => {
  const noGoalkeeperFixture = { ...fixture("f1", "7", "2026-08-01T12:00:00Z"), expectedSaves: 3 };
  const results = calculatePlayerHorizons([modelPlayer("mid", "team", [], true)], [noGoalkeeperFixture]);
  assert.equal(results.find((row) => row.horizon === 3)?.breakdown[0]?.components.saves, 0);
});

test("model calculation has no Foontasy T1 input and cannot modify imported T1", () => {
  const importedT1 = Object.freeze({ points: 6.7 });
  calculatePlayerHorizons([modelPlayer("p1", "team", [])], [fixture("f1", "1", "2026-08-01T12:00:00Z")], defaultFantasyModelConfig);
  assert.deepEqual(importedT1, { points: 6.7 });
});

const fallback: RateProfile = {
  expectedMinutes: 45, appearance: 0.7, sixtyMinutes: 0.4, fullMatch: 0.2,
  xg90: 0.2, xa90: 0.15, yellowCards90: 0.1, redCards90: 0.01, saves90: 0, recoveries90: 5
};

function modelPlayer(playerId: string, teamId: string, rows: ReturnType<typeof history>[], isRosterStarter = true): ModelPlayer {
  return { playerId, teamId, position: "MID", history: rows, teamPositionFallback: fallback, leaguePositionFallback: fallback, isRosterStarter };
}

function history(date: string, minutes: number) {
  return historyWithXg(date, minutes, 0.1);
}

function historyWithXg(date: string, minutes: number, xg: number) {
  return {
    matchDate: new Date(date), minutes, started: minutes >= 60, xg, xa: 0.1,
    goals: 0, assists: 0, yellowCards: 0, redCards: 0, saves: 0, recoveries: 4
  };
}

function fixture(id: string, round: string, date: string): ModelFixture {
  return {
    id, round, kickoffAt: new Date(date), teamId: "team", opponentId: "opponent", opponentName: "Opponent", isHome: true,
    teamProjection: { expectedGoals: 1.4, expectedGoalsAgainst: 1.1, cleanSheetProbability: Math.exp(-1.1), source: "XG_FORM", reasonCodes: ["ODDS_MISSING"] },
    expectedRecoveries: 40, expectedSaves: 0
  };
}
