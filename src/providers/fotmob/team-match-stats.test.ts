import assert from "node:assert/strict";
import test from "node:test";

import { extract_team_match_stats, parse_stat_value } from "./team-match-stats";

test("normal FotMob all-period team stats return one row per team", () => {
  const rows = extract_team_match_stats({
    general: {
      matchId: 123,
      homeTeam: { id: 1, name: "Home FC", score: 2 },
      awayTeam: { id: 2, name: "Away FC", score: 1 }
    },
    content: {
      stats: {
        Periods: {
          All: {
            stats: [
              {
                title: "Top stats",
                stats: [
                  { title: "Expected goals (xG)", stats: ["1.42", "0.81"] },
                  { title: "Ball possession", stats: ["57%", "43%"] },
                  { title: "Total shots", stats: [12, 7] },
                  { title: "Touches in opposition box", stats: [23, 11] }
                ]
              }
            ]
          }
        }
      }
    }
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => ({
      match_id: row.match_id,
      team_id: row.team_id,
      opponent_team_id: row.opponent_team_id,
      is_home: row.is_home
    })),
    [
      { match_id: 123, team_id: 1, opponent_team_id: 2, is_home: true },
      { match_id: 123, team_id: 2, opponent_team_id: 1, is_home: false }
    ]
  );
  assert.equal(rows[0].goals, 2);
  assert.equal(rows[0].xg, 1.42);
  assert.equal(rows[0].possession, 57);
  assert.equal(rows[0].shots, 12);
  assert.equal(rows[0].touches_in_opp_box, 23);
  assert.equal(rows[1].xg, 0.81);
  assert.equal(rows[1].possession, 43);
  assert.equal(rows[1].shots, 7);
});

test("stat values are parsed safely", () => {
  assert.equal(parse_stat_value(null), null);
  assert.equal(parse_stat_value(12), 12);
  assert.equal(parse_stat_value("57%"), 57);
  assert.equal(parse_stat_value("1.42"), 1.42);
  assert.equal(parse_stat_value("12"), 12);
  assert.equal(parse_stat_value("432/501"), "432/501");
  assert.equal(parse_stat_value("not available"), "not available");
});

test("shotmap fallback computes xG and shot counts when ready-made stats are missing", () => {
  const rows = extract_team_match_stats({
    matchId: 987,
    home: { teamId: 10, name: "Home" },
    away: { teamId: 20, name: "Away" },
    content: {
      shotmap: {
        shots: [
          { teamId: 10, expectedGoals: 0.4, expectedGoalsOnTarget: 0.7, eventType: "Goal", isOnTarget: true },
          { teamId: 10, expectedGoals: 0.2, eventType: "AttemptSaved" },
          { teamId: 10, expectedGoals: 0.1, eventType: "Blocked", isBlocked: true },
          { teamId: 20, expectedGoals: 0.3, expectedGoalsOnTarget: 0.1, eventType: "Miss" }
        ]
      }
    }
  });

  assert.equal(rows[0].shots, 3);
  assert.equal(rows[0].xg, 0.7);
  assert.equal(rows[0].xgot, 0.7);
  assert.equal(rows[0].shots_on_target, 2);
  assert.equal(rows[0].goals, 1);
  assert.equal(rows[0].blocked_shots, 1);
  assert.equal(rows[0].raw_shots.length, 3);
  assert.equal(rows[1].shots, 1);
  assert.equal(rows[1].xg, 0.3);
  assert.equal(rows[1].xgot, 0.1);
  assert.equal(rows[1].shots_on_target, 0);
});

test("ready-made stats are preferred over shotmap aggregation", () => {
  const rows = extract_team_match_stats({
    general: {
      homeTeam: { id: 1 },
      awayTeam: { id: 2 }
    },
    content: {
      stats: {
        Periods: {
          All: {
            stats: [{ title: "Expected goals", stats: ["2.25", "0.50"] }, { title: "Shots", stats: [9, 4] }]
          }
        }
      },
      shotmap: {
        shots: [
          { teamId: 1, expectedGoals: 0.1, eventType: "Goal" },
          { teamId: 2, expectedGoals: 0.2, eventType: "Goal" }
        ]
      }
    }
  });

  assert.equal(rows[0].xg, 2.25);
  assert.equal(rows[0].shots, 9);
  assert.equal(rows[1].xg, 0.5);
  assert.equal(rows[1].shots, 4);
  assert.equal(rows[0].raw_shots.length, 1);
});

test("xA is null when unavailable and summed from player stats when present", () => {
  const unavailable = extract_team_match_stats({
    header: { teams: [{ id: 1 }, { id: 2 }] }
  });
  assert.equal(unavailable[0].xa, null);
  assert.equal(unavailable[1].xa, null);

  const rows = extract_team_match_stats({
    header: { teams: [{ id: 1 }, { id: 2 }] },
    content: {
      lineups: {
        homeTeam: {
          id: 1,
          players: [{ id: 101, stats: { xA: 0.2 } }, { id: 102, expectedAssists: "0.35" }]
        },
        awayTeam: {
          id: 2,
          players: [{ id: 201, stats: [{ title: "Expected assists (xA)", value: "0.10" }] }]
        }
      }
    }
  });

  assert.equal(rows[0].xa, 0.55);
  assert.equal(rows[1].xa, 0.1);
});

test("missing optional stats and shotmap do not crash", () => {
  const rows = extract_team_match_stats({
    general: {
      homeTeam: { id: 100 },
      awayTeam: { id: 200 }
    }
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].shots, null);
  assert.equal(rows[0].xg, null);
  assert.deepEqual(rows[0].raw_stats, {});
  assert.deepEqual(rows[0].raw_shots, []);
});

test("unknown stat labels remain in raw_stats", () => {
  const rows = extract_team_match_stats({
    general: {
      homeTeam: { id: 7 },
      awayTeam: { id: 8 }
    },
    content: {
      stats: {
        Periods: {
          All: {
            stats: [{ title: "Pressure regains", stats: [14, 9] }]
          }
        }
      }
    }
  });

  assert.equal(rows[0].raw_stats["Pressure regains"], 14);
  assert.equal(rows[1].raw_stats["Pressure regains"], 9);
});
