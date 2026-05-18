import assert from "node:assert/strict";
import test from "node:test";

import { filterMacheteTeamsForSync, staleFotMobTeamWhere } from "./sync-teams";
import type { FotMobTeam } from "./types";

test("World Cup team sync ignores teams without players", () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    const teams = filterMacheteTeamsForSync({
      providerLeagueId: "77",
      season: "2026",
      teams: [team("101", "Argentina", 1), team("102", "Winner Group A", 0), team("103", "TBD", 0)]
    });

    assert.deepEqual(
      teams.map((item) => item.name),
      ["Argentina"]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Ignoring 2 World Cup teams without players/);
  } finally {
    console.warn = originalWarn;
  }
});

test("normal league team sync keeps teams without players", () => {
  const teams = filterMacheteTeamsForSync({
    providerLeagueId: "47",
    season: "2025/26",
    teams: [team("201", "Arsenal", 0)]
  });

  assert.deepEqual(
    teams.map((item) => item.name),
    ["Arsenal"]
  );
});

test("stale team cleanup includes null provider ids", () => {
  assert.deepEqual(staleFotMobTeamWhere("league-1", ["101", "102"]), {
    leagueId: "league-1",
    provider: "FOTMOB",
    OR: [
      {
        providerTeamId: {
          notIn: ["101", "102"]
        }
      },
      {
        providerTeamId: null
      }
    ]
  });
});

function team(id: string, name: string, playerCount: number): FotMobTeam {
  return {
    id,
    leagueId: "77",
    name,
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `${id}-${index}`,
      teamId: id,
      name: `${name} player ${index}`
    }))
  };
}
