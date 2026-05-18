import assert from "node:assert/strict";
import test from "node:test";

import { extractLeagueTeamsFromLeaguePayload, is_placeholder_team } from "./client";

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

test("real fixtures with home/away returns teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    matches: [
      {
        home: { id: "101", name: "Argentina", shortName: "ARG" },
        away: { teamId: "102", teamName: "Brazil" },
        team: { id: "999", name: "Bracket Decoration" },
        opponent: { id: "998", name: "Generic Opponent" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "101", name: "Argentina", shortName: "ARG" },
    { id: "102", name: "Brazil", shortName: undefined }
  ]);
});

test("real fixtures with homeTeam/awayTeam returns teams", () => {
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

test("placeholder fixtures are ignored", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    fixtures: [
      {
        home: { id: "401", name: "TBD" },
        away: { teamId: "402", teamName: "Winner Group A" }
      },
      {
        homeTeam: { teamId: "403", teamName: "1A" },
        awayTeam: { id: "404", name: "Победитель Группа B" }
      },
      {
        home: { id: "405", name: "W49" },
        away: { id: "406", name: "To be decided" }
      }
    ]
  });

  assert.deepEqual(teams, []);
});

test("mixed real and placeholder fixtures return only real teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    rounds: [
      {
        match: {
          homeTeam: { teamId: 501, teamName: "Japan" },
          awayTeam: { teamId: 502, teamName: "Runner-up Group B" }
        }
      },
      {
        match: {
          homeTeam: { teamId: 503, teamName: "Germany" },
          awayTeam: { teamId: 504, teamName: "Unknown" }
        }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "501", name: "Japan", shortName: undefined },
    { id: "503", name: "Germany", shortName: undefined }
  ]);
});

test("empty payload returns empty array", () => {
  assert.deepEqual(extractLeagueTeamsFromLeaguePayload({}), []);
});

test("duplicate teams are deduplicated and numeric ids are preferred", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    fixtures: [
      {
        home: { name: "USA" },
        away: { id: "302", name: "Uruguay" }
      },
      {
        homeTeam: { teamId: "301", teamName: "USA" },
        awayTeam: { id: "302", name: "Uruguay" }
      },
      {
        home: { id: "not-a-fotmob-id", name: "South Korea" },
        away: { teamId: "303", teamName: "South Korea" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "301", name: "USA", shortName: undefined },
    { id: "302", name: "Uruguay", shortName: undefined },
    { id: "303", name: "South Korea", shortName: undefined }
  ]);
});

test("World Cup fallback warns when more than 48 teams remain after filtering", () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    const matches = Array.from({ length: 25 }, (_, index) => ({
      home: { id: String(1000 + index * 2), name: `Team ${index * 2 + 1}` },
      away: { id: String(1001 + index * 2), name: `Team ${index * 2 + 2}` }
    }));

    const teams = extractLeagueTeamsFromLeaguePayload({ matches }, { leagueId: "77", season: "2026" });

    assert.equal(teams.length, 50);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /World Cup fallback extracted 50 teams/);
  } finally {
    console.warn = originalWarn;
  }
});

test("placeholder team detection covers known playoff labels", () => {
  for (const name of ["TBD", "TBA", "Winner Group A", "Runner-up Group B", "1A", "B2", "W49", "L50", "To be decided", "Unknown", "Placeholder", "Победитель", "Группа A"]) {
    assert.equal(is_placeholder_team(name), true, name);
  }

  assert.equal(is_placeholder_team("Argentina"), false);
});
