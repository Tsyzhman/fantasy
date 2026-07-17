import assert from "node:assert/strict";
import test from "node:test";

import {
  enabledLeagueIngestionConfigs,
  leagueIngestionConfig,
  scopesForInitialBackfill,
  scopesForCurrentSeasonLeagueBackfill,
  scopesForIncrementalUpdate,
  seasonForIncrementalUpdate,
  seasonsForInitialBackfill,
  type LeagueIngestionConfig
} from "./league-season-policy";

test("initial backfill seasons follow calendar policy", () => {
  const referenceDate = new Date("2026-05-19T00:00:00.000Z");
  const configs: LeagueIngestionConfig[] = [
    config(47, "Premier League", "autumn_spring"),
    config(130, "MLS", "spring_autumn"),
    { ...config(77, "World Cup", "tournament"), explicit_seasons: ["2026"], initial_start_season: "2026" }
  ];

  const scopes = scopesForInitialBackfill(configs, referenceDate);

  assert.deepEqual(seasonsForInitialBackfill(configs[0], referenceDate), ["2024/2025", "2025/2026"]);
  assert.deepEqual(seasonsForInitialBackfill(configs[1], referenceDate), ["2025", "2026"]);
  assert.deepEqual(seasonsForInitialBackfill(configs[2], referenceDate), ["2026"]);
  assert.deepEqual(scopes.map((scope) => [scope.league_id, scope.season]), [
    [47, "2024/2025"],
    [47, "2025/2026"],
    [130, "2025"],
    [130, "2026"],
    [77, "2026"]
  ]);
  assert.equal(["dry", "run"].join("_") in scopes[0], false);
});

test("UEFA club tournaments use only the current autumn-spring season", () => {
  const mayReferenceDate = new Date("2026-05-19T00:00:00.000Z");
  const augustReferenceDate = new Date("2026-08-01T00:00:00.000Z");
  const configs: LeagueIngestionConfig[] = [
    config(42, "Champions League", "tournament"),
    config(73, "Europa League", "tournament"),
    config(74, "UEFA Super Cup", "tournament"),
    config(10216, "Conference League", "tournament")
  ];

  for (const tournament of configs) {
    assert.deepEqual(seasonsForInitialBackfill(tournament, mayReferenceDate), ["2025/2026"]);
    assert.equal(seasonForIncrementalUpdate(tournament, mayReferenceDate), "2025/2026");
    assert.deepEqual(seasonsForInitialBackfill(tournament, augustReferenceDate), ["2026/2027"]);
    assert.equal(seasonForIncrementalUpdate(tournament, augustReferenceDate), "2026/2027");
  }
});

test("domestic cup tournaments use the latest two autumn-spring seasons", () => {
  const referenceDate = new Date("2026-05-19T00:00:00.000Z");
  const faCup = config(132, "FA Cup", "tournament");

  assert.deepEqual(seasonsForInitialBackfill(faCup, referenceDate), ["2024/2025", "2025/2026"]);
  assert.equal(seasonForIncrementalUpdate(faCup, referenceDate), "2025/2026");
});

test("incremental updates use current seasons instead of initial backfill seasons", () => {
  const configs: LeagueIngestionConfig[] = [
    config(47, "Premier League", "autumn_spring"),
    config(130, "MLS", "spring_autumn"),
    { ...config(77, "World Cup", "tournament"), explicit_seasons: ["2026"], initial_start_season: "2026" }
  ];
  const referenceDate = new Date("2026-05-19T00:00:00.000Z");
  const scopes = scopesForIncrementalUpdate(configs, referenceDate);

  assert.equal(seasonForIncrementalUpdate(configs[0], referenceDate), "2025/2026");
  assert.equal(seasonForIncrementalUpdate(configs[1], referenceDate), "2026");
  assert.deepEqual(scopes.map((scope) => [scope.league_id, scope.season]), [
    [47, "2025/2026"],
    [130, "2026"],
    [77, "2026"]
  ]);
  assert.equal(scopes.every((scope) => scope.include_upcoming), true);
});

test("quick current league backfill uses only Premier League current season", () => {
  const referenceDate = new Date("2026-05-19T00:00:00.000Z");
  const scopes = scopesForCurrentSeasonLeagueBackfill(47, referenceDate);

  assert.deepEqual(scopes.map((scope) => [scope.league_id, scope.season]), [[47, "2025/2026"]]);
  assert.equal(scopes[0].include_finished, true);
  assert.equal(scopes[0].include_live, false);
  assert.equal(scopes[0].include_upcoming, true);
  assert.equal(scopes[0].require_detailed_payloads, false);
});

test("quick current league backfill follows new season after summer rollover", () => {
  const referenceDate = new Date("2026-08-01T00:00:00.000Z");
  const scopes = scopesForCurrentSeasonLeagueBackfill(47, referenceDate);

  assert.deepEqual(scopes.map((scope) => [scope.league_id, scope.season]), [[47, "2026/2027"]]);
});

test("production ingestion excludes non-target leagues", () => {
  const enabledIds = new Set(enabledLeagueIngestionConfigs().map((league) => league.league_id));

  assert.equal(leagueIngestionConfig.length, 82);
  assert.equal(enabledIds.size, 44);

  for (const leagueId of [44, 47, 48, 50, 77, 86, 108, 110, 140, 146, 338]) {
    assert.equal(enabledIds.has(leagueId), true);
  }

  for (const leagueId of [109, 111, 119, 130, 163, 165, 264, 441, 536, 9806, 10195]) {
    assert.equal(enabledIds.has(leagueId), false);
  }
});

function config(league_id: number, name: string, calendar_type: LeagueIngestionConfig["calendar_type"]): LeagueIngestionConfig {
  return {
    league_id,
    name,
    calendar_type,
    initial_start_season: calendar_type === "spring_autumn" ? "2023" : "2023/2024",
    enabled: true,
    max_matches: 700,
    max_date_span_days: 450
  };
}
