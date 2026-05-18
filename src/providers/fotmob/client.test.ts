import assert from "node:assert/strict";
import test from "node:test";

import { extractLeagueTeamsFromLeaguePayload } from "./client";

test("normal standings payload still works", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    table: [
      {
        data: {
          table: {
            all: [
              { id: 1, name: "Arsenal", shortName: "ARS" },
              { id: "2", name: "Chelsea" }
            ]
          }
        }
      }
    ],
    matches: [
      {
        home: { id: "99", name: "Fallback FC" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "1", name: "Arsenal", shortName: "ARS" },
    { id: "2", name: "Chelsea", shortName: undefined }
  ]);
});

test("matches with home/away returns teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    matches: [
      {
        home: { id: "101", name: "Argentina", shortName: "ARG" },
        away: { teamId: "102", teamName: "Brazil" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "101", name: "Argentina", shortName: "ARG" },
    { id: "102", name: "Brazil", shortName: undefined }
  ]);
});

test("nested fixtures with homeTeam/awayTeam returns teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    groups: [
      {
        rounds: [
          {
            fixtures: [
              {
                match: {
                  homeTeam: { teamId: 201, teamName: "Canada" },
                  awayTeam: { id: 202, name: "Mexico" }
                }
              }
            ]
          }
        ]
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "201", name: "Canada", shortName: undefined },
    { id: "202", name: "Mexico", shortName: undefined }
  ]);
});

test("empty payload returns empty array", () => {
  assert.deepEqual(extractLeagueTeamsFromLeaguePayload({}), []);
});

test("duplicate teams are deduplicated", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    fixtures: [
      {
        home: { id: "301", name: "United States" },
        away: { id: "302", name: "Uruguay" }
      },
      {
        homeTeam: { teamId: "301", teamName: "USA" },
        awayTeam: { id: "302", name: "Uruguay" }
      },
      {
        team: { id: "303", name: "South Korea" },
        opponent: { id: "304", name: "Korea Republic" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "301", name: "United States", shortName: undefined },
    { id: "302", name: "Uruguay", shortName: undefined },
    { id: "303", name: "South Korea", shortName: undefined },
    { id: "304", name: "Korea Republic", shortName: undefined }
  ]);
});
