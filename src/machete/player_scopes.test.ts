import assert from "node:assert/strict";
import test from "node:test";

import { playerLeagueScopes } from "./player_scopes";

const current = league("2026/2027", true);
const ready = league("2025/2026", false);

test("all-league player scope uses only forecast-ready seasons", () => {
  assert.deepEqual(
    playerLeagueScopes({
      selectedLeagueId: "all",
      selectedSeason: "",
      readyLeagueScopes: [ready],
      leagueSeasonOptions: [current, ready]
    }),
    [{ leagueId: 47n, season: "2025/2026" }]
  );
  assert.deepEqual(
    playerLeagueScopes({
      selectedLeagueId: "all",
      selectedSeason: "",
      readyLeagueScopes: [],
      leagueSeasonOptions: [current, ready]
    }),
    []
  );
});

test("an explicitly selected unready season remains inspectable", () => {
  assert.deepEqual(
    playerLeagueScopes({
      selectedLeagueId: "47",
      selectedSeason: "2026/2027",
      readyLeagueScopes: [ready],
      leagueSeasonOptions: [current, ready]
    }),
    [{ leagueId: 47n, season: "2026/2027" }]
  );
});

function league(season: string, isCurrent: boolean) {
  return {
    leagueId: 47n,
    season,
    name: "Premier League",
    displayName: "Premier League",
    country: "England",
    providerLeagueId: "47",
    isCurrent,
    updatedAt: new Date("2026-07-17T00:00:00.000Z")
  };
}
