import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSportsRuFantasySyncScopes,
  sportsRuFantasyPriceHealthThresholds,
  sportsRuFantasySyncIntervalMilliseconds
} from "@/machete/sports_ru_fantasy_config";

test("Sports.ru fantasy sync scopes retain slash-form seasons", () => {
  assert.deepEqual(parseSportsRuFantasySyncScopes("47:2026/2027:england;87:2026/2027:spain"), [
    { leagueId: 47n, season: "2026/2027", tournamentHru: "england" },
    { leagueId: 87n, season: "2026/2027", tournamentHru: "spain" }
  ]);
});

test("Sports.ru fantasy sync rejects ambiguous scope syntax", () => {
  assert.throws(() => parseSportsRuFantasySyncScopes("47:england"), /Expected <league-id>:<season>:<tournament-hru>/);
});

test("Sports.ru fantasy sync interval and health thresholds reject unsafe configuration", () => {
  assert.equal(sportsRuFantasySyncIntervalMilliseconds("0"), 6 * 60 * 60 * 1000);
  assert.equal(sportsRuFantasySyncIntervalMilliseconds("24"), 24 * 60 * 60 * 1000);
  assert.deepEqual(
    sportsRuFantasyPriceHealthThresholds({
      SPORTS_RU_FANTASY_MAXIMUM_AGE_HOURS: "0",
      SPORTS_RU_FANTASY_MINIMUM_PLAYERS: "99.5",
      SPORTS_RU_FANTASY_MINIMUM_MAPPED_PERCENT: "101"
    }),
    { maximumAgeHours: 7, minimumPlayers: 100, minimumMappedPercent: 98 }
  );
});
