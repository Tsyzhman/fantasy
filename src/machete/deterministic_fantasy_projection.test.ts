import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectionInputError,
  expectedPoissonGroups,
  projectFixtureTeams,
  projectTeamPlayers,
  type ProbableParticipantInput,
  type ProjectedTeamTotals
} from "./deterministic_fantasy_projection";

test("team projection uses multiplicative venue strengths and Poisson clean sheets", () => {
  const result = projectFixtureTeams({
    leagueExpectedGoals: { home: 1.5, away: 1.1 },
    expectedAssistsPerGoal: 0.8,
    home: { teamId: "home", attackStrength: 1.2, defenseStrength: 0.75, expectedRecoveries: 30, expectedSaves: 2 },
    away: { teamId: "away", attackStrength: 0.9, defenseStrength: 1.1, expectedRecoveries: 28, expectedSaves: 4 }
  });

  assert.equal(result.home.expectedGoals, 1.5 * 1.2 * 1.1);
  assert.equal(result.away.expectedGoals, 1.1 * 0.9 * 0.75);
  assert.equal(result.home.expectedAssists, result.home.expectedGoals * 0.8);
  assert.equal(result.home.cleanSheetProbability, Math.exp(-result.away.expectedGoals));
  assert.equal(result.away.cleanSheetProbability, Math.exp(-result.home.expectedGoals));
});

test("minutes-weighted participant shares conserve every forecast team total", () => {
  const team = projectedTeam();
  const result = projectTeamPlayers(team, participants());

  for (const value of Object.values(result.massBalance)) {
    assert.equal(value.allocated, value.expected);
    assert.equal(value.residual, 0);
  }

  const defender = result.players.find((player) => player.playerId === "def")!;
  const midfielder = result.players.find((player) => player.playerId === "mid")!;
  // xG exposure is 0.1 * 90/90 versus 0.4 * 45/90.
  assert.equal(midfielder.expectedEvents.goals / defender.expectedEvents.goals, 2);
  assert.equal(result.players.find((player) => player.playerId === "gk")!.expectedEvents.saves, team.expectedSaves);
  assert.equal(result.players.find((player) => player.playerId === "gk")!.expectedEvents.recoveries, 0);
});

test("Sports.ru components use P(appearance), P60, P90 and P60 clean-sheet eligibility", () => {
  const result = projectTeamPlayers(projectedTeam(), participants());
  const midfielder = result.players.find((player) => player.playerId === "mid")!;
  const defender = result.players.find((player) => player.playerId === "def")!;
  const forward = result.players.find((player) => player.playerId === "fwd")!;

  assert.equal(midfielder.components.appearance, 0.8);
  assert.equal(midfielder.components.sixtyMinutes, 0.5);
  assert.equal(midfielder.components.fullMatch, 0.2);
  assert.equal(midfielder.expectedEvents.cleanSheets, 0.4 * 0.5);
  assert.equal(midfielder.components.cleanSheet, 0.4 * 0.5);
  assert.equal(defender.components.fullMatch, 0);
  assert.equal(defender.components.cleanSheet, 0.4 * defender.probabilities.sixtyMinutes * 4);
  assert.equal(forward.components.cleanSheet, 0);
  assert.equal(forward.components.goals, forward.expectedEvents.goals * 4);
});

test("threshold components use expected official scoring groups without rounding", () => {
  const team = { ...projectedTeam(), expectedSaves: 1 };
  const result = projectTeamPlayers(team, participants());
  const goalkeeper = result.players.find((player) => player.playerId === "gk")!;

  assert.equal(goalkeeper.components.saves, expectedPoissonGroups(1, 3));
  assert.ok(goalkeeper.components.saves > 0);
  assert.ok(goalkeeper.components.saves < 1 / 3);
  assert.equal(
    goalkeeper.components.total,
    Object.entries(goalkeeper.components)
      .filter(([key]) => key !== "total")
      .reduce((sum, [, value]) => sum + value, 0)
  );
});

test("zero-minute players may omit event rates without producing NaN", () => {
  const rows = participants();
  rows.push({
    playerId: "inactive",
    position: "MID",
    expectedMinutes: 0,
    probabilities: { appearance: 0, sixtyMinutes: 0, fullMatch: 0 },
    ratesPer90: { xg: undefined, xa: undefined, recoveries: undefined, yellowCards: undefined, redCards: undefined }
  });

  const result = projectTeamPlayers(projectedTeam(), rows);
  const inactive = result.players.find((player) => player.playerId === "inactive")!;
  assert.equal(inactive.components.total, 0);
  assert.ok(Number.isFinite(result.totalExpectedFantasyPoints));
});

test("missing relevant player data is an explicit structured error", () => {
  const rows = participants();
  rows[1] = { ...rows[1], ratesPer90: { ...rows[1].ratesPer90, recoveries: undefined } };

  assert.throws(
    () => projectTeamPlayers(projectedTeam(), rows),
    (error: unknown) => {
      assert.ok(error instanceof ProjectionInputError);
      assert.ok(error.issues.some((issue) => issue.path === "participants[1].ratesPer90.recoveries"));
      return true;
    }
  );
});

test("positive team mass with a zero allocation denominator fails closed", () => {
  const rows = participants().map((player) => ({
    ...player,
    ratesPer90: { ...player.ratesPer90, xa: 0 }
  }));

  assert.throws(
    () => projectTeamPlayers(projectedTeam(), rows),
    (error: unknown) => {
      assert.ok(error instanceof ProjectionInputError);
      assert.ok(error.issues.some((issue) => issue.path === "allocation.assists"));
      return true;
    }
  );
});

test("incoherent probability and minute inputs fail closed", () => {
  const rows = participants();
  rows[2] = {
    ...rows[2],
    expectedMinutes: 80,
    probabilities: { appearance: 0.5, sixtyMinutes: 0.7, fullMatch: 0.8 }
  };

  assert.throws(
    () => projectTeamPlayers(projectedTeam(), rows),
    (error: unknown) => {
      assert.ok(error instanceof ProjectionInputError);
      assert.ok(error.issues.length >= 3);
      return true;
    }
  );
});

function projectedTeam(): ProjectedTeamTotals {
  return {
    teamId: "team",
    expectedGoals: 2,
    expectedGoalsAgainst: 1,
    expectedAssists: 1.6,
    expectedRecoveries: 30,
    expectedSaves: 6,
    cleanSheetProbability: 0.4
  };
}

function participants(): ProbableParticipantInput[] {
  return [
    {
      playerId: "gk",
      position: "GK",
      expectedMinutes: 90,
      probabilities: { appearance: 1, sixtyMinutes: 1, fullMatch: 1 },
      ratesPer90: { xg: 0, xa: 0.01, saves: 3, yellowCards: 0.05, redCards: 0.01 }
    },
    {
      playerId: "def",
      position: "DEF",
      expectedMinutes: 90,
      probabilities: { appearance: 1, sixtyMinutes: 0.9, fullMatch: 0.7 },
      ratesPer90: { xg: 0.1, xa: 0.2, recoveries: 6, yellowCards: 0.2, redCards: 0.01 }
    },
    {
      playerId: "mid",
      position: "MID",
      expectedMinutes: 45,
      probabilities: { appearance: 0.8, sixtyMinutes: 0.5, fullMatch: 0.2 },
      ratesPer90: { xg: 0.4, xa: 0.3, recoveries: 9, yellowCards: 0.1, redCards: 0.02 }
    },
    {
      playerId: "fwd",
      position: "FWD",
      expectedMinutes: 54,
      probabilities: { appearance: 0.7, sixtyMinutes: 0.4, fullMatch: 0.1 },
      ratesPer90: { xg: 0.5, xa: 0.1, recoveries: 3, yellowCards: 0.1, redCards: 0.01 }
    }
  ];
}
