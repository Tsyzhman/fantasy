import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregatePenaltyPotentialRows,
  calculatePenaltyPotentialRow,
  extractPenaltyPotentialMetric,
  findUnderratedPenaltyCandidates,
  penaltyPotentialPosition
} from "./penalty-potential-index";

test("calculates the baseline penalty potential formula with position multiplier", () => {
  const row = calculatePenaltyPotentialRow(
    {
      player: "Baseline Forward",
      team: "Penalty FC",
      position: "Forward",
      minutes: 900,
      touchesInBox: 46,
      foulsWon: 18.7,
      penaltiesWon: 1,
      penaltiesWonAvailable: true
    },
    { minMinutes: 0 }
  );

  assert.ok(row);
  assert.equal(Number(row.touchesInBox90.toFixed(2)), 4.6);
  assert.equal(Number(row.foulsWon90.toFixed(2)), 1.87);
  assert.equal(row.positionMultiplier, 1.15);
  assert.equal(Number(row.penaltyPotentialIndex.toFixed(2)), 1.15);
  assert.equal(row.tier, "good");
});

test("uses requested position multipliers including winger as midfielder", () => {
  assert.deepEqual(penaltyPotentialPosition("Forward"), { category: "Forward", multiplier: 1.15 });
  assert.deepEqual(penaltyPotentialPosition("Right Winger"), { category: "Midfielder", multiplier: 0.85 });
  assert.deepEqual(penaltyPotentialPosition("Midfielder"), { category: "Midfielder", multiplier: 0.85 });
  assert.deepEqual(penaltyPotentialPosition("Defender"), { category: "Defender", multiplier: 0.6 });
  assert.deepEqual(penaltyPotentialPosition(null), { category: "Unknown", multiplier: 0.85 });
});

test("filters invalid or low-minute rows and treats null metrics as zero", () => {
  assert.equal(
    calculatePenaltyPotentialRow(
      {
        player: "No Minutes",
        team: "Penalty FC",
        minutes: 0,
        touchesInBox: 10,
        foulsWon: 5
      },
      { minMinutes: 0 }
    ),
    null
  );

  assert.equal(
    calculatePenaltyPotentialRow(
      {
        player: "Low Minutes",
        team: "Penalty FC",
        minutes: 599,
        touchesInBox: 10,
        foulsWon: 5
      }
    ),
    null
  );

  const row = calculatePenaltyPotentialRow(
    {
      player: "Null Metrics",
      team: "Penalty FC",
      minutes: 900,
      touchesInBox: null,
      foulsWon: null
    },
    { minMinutes: 0 }
  );

  assert.ok(row);
  assert.equal(row.touchesInBox, 0);
  assert.equal(row.foulsWon, 0);
  assert.equal(row.penaltyPotentialIndex, 0);
});

test("extracts FotMob metric labels from nested player stats payloads", () => {
  const payload = {
    stats: [
      {
        title: "Attack",
        stats: {
          "Touches in opposition box": { key: "touches_opp_box", stat: { value: 7, type: "integer" } },
          "Fouls won": { key: "fouls_won", stat: { value: 3, type: "integer" } },
          "Penalties awarded": { key: "penalties_awarded", stat: { value: 1, type: "integer" } }
        }
      }
    ]
  };

  assert.deepEqual(extractPenaltyPotentialMetric(payload, "touchesInBox"), {
    value: 7,
    matchedLabel: "Touches in opposition box"
  });
  assert.deepEqual(extractPenaltyPotentialMetric(payload, "foulsWon"), {
    value: 3,
    matchedLabel: "Fouls won"
  });
  assert.deepEqual(extractPenaltyPotentialMetric(payload, "penaltiesWon"), {
    value: 1,
    matchedLabel: "Penalties awarded"
  });
});

test("aggregates match rows by player-team-league-season and finds value candidates", () => {
  const result = aggregatePenaltyPotentialRows(
    [
      {
        playerId: 10,
        player: "Box Magnet",
        teamId: 1,
        team: "Penalty FC",
        leagueId: 47,
        league: "Premier League",
        season: "2025/2026",
        position: "Forward",
        minutes: 90,
        statsPayload: {
          stats: {
            "Touches in box": { stat: { value: 6 } },
            "Fouls won": { stat: { value: 2 } },
            "Penalties won": { stat: { value: 0 } }
          }
        }
      },
      {
        playerId: 10,
        player: "Box Magnet",
        teamId: 1,
        team: "Penalty FC",
        leagueId: 47,
        league: "Premier League",
        season: "2025/2026",
        position: "Forward",
        minutes: 90,
        touchesInBox: 6,
        foulsWon: 2,
        penaltiesWon: 0
      },
      {
        playerId: 20,
        player: "Tiny Sample",
        teamId: 1,
        team: "Penalty FC",
        leagueId: 47,
        league: "Premier League",
        season: "2025/2026",
        position: "Forward",
        minutes: 0,
        touchesInBox: 100,
        foulsWon: 100
      }
    ],
    { minMinutes: 90 }
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].player, "Box Magnet");
  assert.equal(result.rows[0].minutes, 180);
  assert.equal(result.rows[0].touchesInBox, 12);
  assert.equal(result.rows[0].foulsWon, 4);
  assert.equal(result.rows[0].penaltiesWon, 0);
  assert.equal(result.diagnostics.skippedForMinutes, 1);
  assert.equal(result.diagnostics.penaltiesWonAvailable, true);
  assert.equal(findUnderratedPenaltyCandidates(result.rows).length, 1);
});
