import assert from "node:assert/strict";
import test from "node:test";

import { classify_shot_zone, extract_match_shots, normalize_fotmob_pitch_coordinates } from "./shots";

test("extracts one normalized row per FotMob content shotmap shot", () => {
  const shots = extract_match_shots({
    id: 9001,
    home: { id: 10, name: "Home FC" },
    away: { id: 20, name: "Away FC" },
    content: {
      shotmap: {
        shots: [
          {
            teamId: 10,
            teamName: "Home FC",
            playerId: 99,
            playerName: "Finisher",
            minute: 12,
            x: 88.5,
            y: 29.5,
            expectedGoals: "0.32",
            expectedGoalsOnTarget: 0.71,
            eventType: "Goal",
            isOnTarget: true
          }
        ]
      }
    }
  });

  assert.equal(shots.length, 1);
  assert.deepEqual(
    {
      match_id: shots[0].match_id,
      team_id: shots[0].team_id,
      opponent_team_id: shots[0].opponent_team_id,
      player_id: shots[0].player_id,
      x: shots[0].x,
      y: shots[0].y,
      xg: shots[0].xg,
      xgot: shots[0].xgot,
      is_goal: shots[0].is_goal,
      is_on_target: shots[0].is_on_target
    },
    {
      match_id: 9001,
      team_id: 10,
      opponent_team_id: 20,
      player_id: 99,
      x: 88.5,
      y: 29.5,
      xg: 0.32,
      xgot: 0.71,
      is_goal: true,
      is_on_target: true
    }
  );
  assert.equal(shots[0].normalized_x?.toFixed(3), "84.286");
  assert.equal(shots[0].normalized_y?.toFixed(3), "43.382");
  assert.equal(shots[0].raw.playerName, "Finisher");
});

test("normalizes FotMob 105 by 68 pitch coordinates to percentages", () => {
  const [x, y] = normalize_fotmob_pitch_coordinates(102.5, 34);

  assert.equal(x?.toFixed(3), "97.619");
  assert.equal(y?.toFixed(3), "50.000");
});

test("missing shotmap returns an empty array", () => {
  assert.deepEqual(extract_match_shots({ id: 1, home: { id: 10 }, away: { id: 20 } }), []);
});

test("opponent team detection works for home and away shots", () => {
  const shots = extract_match_shots({
    id: 1,
    homeTeam: { teamId: 10, teamName: "Home FC" },
    awayTeam: { teamId: 20, teamName: "Away FC" },
    shotmap: {
      shots: [
        { teamId: 10, playerId: 1, x: 90, y: 50 },
        { teamId: 20, playerId: 2, x: 85, y: 44 }
      ]
    }
  });

  assert.equal(shots[0].opponent_team_id, 20);
  assert.equal(shots[0].opponent_team_name, "Away FC");
  assert.equal(shots[1].opponent_team_id, 10);
  assert.equal(shots[1].opponent_team_name, "Home FC");
});

test("goal and on-target detection uses event fields defensively", () => {
  const [shot] = extract_match_shots({
    id: 1,
    home: { id: 10 },
    away: { id: 20 },
    shots: [{ teamId: 10, playerId: 1, coordinateX: 91, coordinateY: 51, result: "Goal" }]
  });

  assert.equal(shot.is_goal, true);
  assert.equal(shot.is_on_target, true);
});

test("shot situation keeps FotMob situation separate from match period", () => {
  const shots = extract_match_shots({
    id: 1,
    home: { id: 10 },
    away: { id: 20 },
    shots: [
      { teamId: 10, playerId: 1, coordinateX: 91, coordinateY: 51, situation: "FromCorner", period: "FirstHalf" },
      { teamId: 10, playerId: 2, coordinateX: 88, coordinateY: 35, period: "SecondHalf" }
    ]
  });

  assert.equal(shots[0].situation, "FromCorner");
  assert.equal(shots[1].situation, null);
});

test("left center right zone classification works", () => {
  assert.equal(classify_shot_zone(90, 20), "left");
  assert.equal(classify_shot_zone(90, 50), "center");
  assert.equal(classify_shot_zone(90, 80), "right");
});
