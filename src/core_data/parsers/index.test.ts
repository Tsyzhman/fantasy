import assert from "node:assert/strict";
import test from "node:test";

import { parse_payload } from ".";

test("shared parser normalizes match payload without embedding raw shot payloads", () => {
  const payload = {
    id: 101,
    leagueId: 55,
    home: { id: 10, name: "Home FC", score: 2 },
    away: { id: 20, name: "Away FC", score: 1 },
    status: { finished: true, started: true, utcTime: "2026-05-01T18:00:00.000Z" },
    content: {
      shotmap: {
        shots: [
          {
            id: "shot-1",
            matchId: 101,
            teamId: 10,
            playerId: 1001,
            playerName: "Finisher",
            x: 88,
            y: 50,
            expectedGoals: 0.42,
            eventType: "Goal"
          }
        ]
      }
    },
    playerStats: [
      {
        playerId: 1001,
        teamId: 10,
        playerName: "Finisher",
        minutes: 90,
        goals: 1,
        assists: 0,
        shotsOnTarget: 1
      }
    ]
  };

  const parsed = parse_payload(payload);

  assert.equal(parsed.match.id, 101n);
  assert.equal(parsed.match.finished, true);
  assert.equal(parsed.teams.length, 2);
  assert.equal(parsed.players.length, 1);
  assert.equal(parsed.playerStats.length, 1);
  assert.equal(parsed.teamStats.length, 2);
  assert.equal(parsed.shots.length, 1);
  assert.equal("raw" in parsed.shots[0], false);
  assert.equal("raw_shots" in (parsed.teamStats[0].statsPayload as Record<string, unknown>), false);
});

test("shared parser reads nested lineup player stats for fantasy scoring", () => {
  const payload = {
    id: 202,
    leagueId: 47,
    home: { id: 10, name: "Home FC", score: 1 },
    away: { id: 20, name: "Away FC", score: 0 },
    status: { finished: true, started: true, utcTime: "2026-05-02T18:00:00.000Z" },
    content: {
      lineup: {
        lineup: [
          {
            teamId: 10,
            players: [
              {
                id: 1002,
                name: "Nested Defender",
                position: "Defender",
                stats: [
                  { title: "Minutes played", value: 90 },
                  { title: "Expected goals (xG)", value: "0.12" },
                  { title: "Expected assists (xA)", value: "0.05" },
                  { title: "Shots on target", value: 1 },
                  { title: "Tackles won", value: 3 },
                  { title: "Interceptions", value: 2 },
                  { title: "Clearances", value: 4 },
                  { title: "FotMob rating", value: "7.3" }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  const parsed = parse_payload(payload);
  const stat = parsed.playerStats[0];

  assert.equal(parsed.players[0].id, 1002n);
  assert.equal(stat.teamId, 10n);
  assert.equal(stat.minutes, 90);
  assert.equal(stat.xg, 0.12);
  assert.equal(stat.xa, 0.05);
  assert.equal(stat.shotsOnTarget, 1);
  assert.equal(stat.tacklesWon, 3);
  assert.equal(stat.interceptions, 2);
  assert.equal(stat.clearances, 4);
  assert.equal(stat.rating, 7.3);
});
