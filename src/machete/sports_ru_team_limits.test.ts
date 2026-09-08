import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sportsRuMaxPlayersPerTeamByLeagueId,
  sportsRuMaxPlayersPerTeamForLeague
} from "./sports_ru_team_limits";
import { fantasyRulesForLeague } from "./squad_planner";

test("Sports.ru club limits are explicit for every supported competition", () => {
  assert.deepEqual(sportsRuMaxPlayersPerTeamByLeagueId, {
    "42": 3,
    "47": 3,
    "48": 2,
    "53": 3,
    "54": 3,
    "55": 3,
    "57": 2,
    "61": 2,
    "63": 3,
    "71": 2,
    "73": 2,
    "77": 2,
    "87": 3
  });
  assert.equal(sportsRuMaxPlayersPerTeamForLeague(87n), 3, "LaLiga");
  assert.equal(sportsRuMaxPlayersPerTeamForLeague(63n), 3, "RPL");
  assert.equal(sportsRuMaxPlayersPerTeamForLeague(999n), 2, "unknown competition fallback");
});

test("all Sports.ru contest writers and Squad fallback share the ID-based limit", () => {
  for (const relativePath of [
    "./sports_ru_fantasy_sync.ts",
    "./fantasy_price_sheet_import.ts",
    "./squad_planner.ts"
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /sportsRuMaxPlayersPerTeamForLeague/);
    assert.doesNotMatch(source, /function inferredMaxPlayersPerTeam|function isTopFiveLeague/);
  }
  const syncSource = readFileSync(new URL("./sports_ru_fantasy_sync.ts", import.meta.url), "utf8");
  assert.doesNotMatch(syncSource, /parsed\.contest\.maxPlayersPerTeam\s*\?\?/);
});

test("Squad fallback allows three same-club players in UCL, LaLiga and RPL", () => {
  for (const [leagueId, name, country] of [[42n, "Champions League", "INT"], [87n, "LaLiga", "ESP"], [63n, "Premier League", "RUS"]] as const) {
    const rules = fantasyRulesForLeague({
      leagueId,
      season: "2026/2027",
      name,
      displayName: name,
      country,
      providerLeagueId: String(leagueId),
      isCurrent: true,
      updatedAt: new Date("2026-08-24T00:00:00.000Z")
    }, null);
    assert.equal(rules.maxPlayersPerTeam, 3);
  }
});

test("migration corrects persisted LaLiga and RPL contest limits", () => {
  const migration = readFileSync(
    new URL("../../prisma/migrations/000035_sports_ru_team_limits/migration.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /\(63::BIGINT, 3\)/);
  assert.match(migration, /\(87::BIGINT, 3\)/);
  assert.match(migration, /"provider" = 'SPORTS_RU'/);
});
