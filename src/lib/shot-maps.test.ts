import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShotMapComparisonFromShots,
  latestTeamMatchIds,
  selectPlayerShotsForTeamMatches,
  selectTeamConcededShotsForMatches,
  type ShotMapShot
} from "./shot-maps";

test("player last team matches uses latest team matches, not player appearances", () => {
  const fixtures = Array.from({ length: 7 }, (_, index) => fixture(`m${index + 1}`, `2026-01-0${index + 1}`));
  const shots = fixtures.map((item, index) => shot({ id: `s${index + 1}`, fixture_id: item.id, team_id: "team-a", player_id: "p1" }));

  assert.deepEqual(latestTeamMatchIds(fixtures, "team-a", 5), ["m7", "m6", "m5", "m4", "m3"]);
  assert.deepEqual(selectPlayerShotsForTeamMatches(shots, fixtures, "p1", "team-a", 5).map((item) => item.fixture_id), ["m7", "m6", "m5", "m4", "m3"]);
});

test("team conceded shots returns shots by opponents", () => {
  const fixtures = [fixture("latest", "2026-01-08"), fixture("old", "2026-01-01")];
  const shots = [
    shot({ id: "for", fixture_id: "latest", team_id: "team-a", opponent_team_id: "team-b" }),
    shot({ id: "against", fixture_id: "latest", team_id: "team-b", opponent_team_id: "team-a" }),
    shot({ id: "fallback", fixture_id: "latest", team_id: "team-c", opponent_team_id: null })
  ];

  assert.deepEqual(selectTeamConcededShotsForMatches(shots, fixtures, "team-a", 1).map((item) => item.id), ["against", "fallback"]);
});

test("overlay comparison keeps attacking and conceded layers separate", () => {
  const attacking = [
    shot({ id: "a1", team_id: "team-a", xg: 0.2, is_goal: true, normalized_y: 20 }),
    shot({ id: "a2", team_id: "team-a", xg: 0.1, normalized_y: 50 })
  ];
  const conceded = [shot({ id: "c1", team_id: "team-c", opponent_team_id: "team-b", xg: 0.3, normalized_y: 80 })];

  const comparison = buildShotMapComparisonFromShots("team-a", "team-b", attacking, conceded);

  assert.equal(comparison.attacking_shots.length, 2);
  assert.equal(comparison.defending_conceded_shots.length, 1);
  assert.equal(comparison.summary.attacking_shots_count, 2);
  assert.equal(comparison.summary.attacking_goals, 1);
  assert.equal(comparison.summary.attacking_xg, 0.3);
  assert.equal(comparison.summary.zones.attacking.left_shots, 1);
  assert.equal(comparison.summary.zones.attacking.center_shots, 1);
  assert.equal(comparison.summary.zones.conceded.right_shots, 1);
});

function fixture(id: string, kickoffAt: string) {
  return {
    id,
    status: "FINISHED",
    kickoffAt: new Date(`${kickoffAt}T12:00:00.000Z`),
    homeTeamId: "team-a",
    awayTeamId: "team-b"
  };
}

function shot(overrides: Partial<ShotMapShot>): ShotMapShot {
  return {
    id: "shot",
    fixture_id: "fixture",
    match_id: "match",
    team_id: "team-a",
    opponent_team_id: "team-b",
    player_id: "player",
    provider_team_id: null,
    provider_opponent_team_id: null,
    provider_player_id: null,
    player_name: null,
    player_position: null,
    is_home: null,
    minute: null,
    added_time: null,
    x: 90,
    y: 50,
    normalized_x: 90,
    normalized_y: 50,
    event_type: null,
    shot_type: null,
    body_part: null,
    situation: null,
    is_goal: false,
    is_on_target: null,
    is_blocked: null,
    is_big_chance: null,
    xg: null,
    xgot: null,
    team_name: null,
    opponent_team_name: null,
    match_date: null,
    match_label: null,
    ...overrides
  };
}
