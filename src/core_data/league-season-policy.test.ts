import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTUMN_SPRING_START_SEASON,
  SPRING_AUTUMN_START_SEASON,
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

  assert.deepEqual(seasonsForInitialBackfill(configs[0], referenceDate), [AUTUMN_SPRING_START_SEASON, "2024/2025", "2025/2026"]);
  assert.deepEqual(seasonsForInitialBackfill(configs[1], referenceDate), [SPRING_AUTUMN_START_SEASON, "2024", "2025", "2026"]);
  assert.deepEqual(seasonsForInitialBackfill(configs[2], referenceDate), ["2026"]);
  assert.deepEqual(scopes.map((scope) => [scope.league_id, scope.season]), [
    [47, "2023/2024"],
    [47, "2024/2025"],
    [47, "2025/2026"],
    [130, "2023"],
    [130, "2024"],
    [130, "2025"],
    [130, "2026"],
    [77, "2026"]
  ]);
  assert.equal(["dry", "run"].join("_") in scopes[0], false);
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
