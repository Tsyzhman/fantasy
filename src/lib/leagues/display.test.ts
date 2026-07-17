import assert from "node:assert/strict";
import test from "node:test";

import { compareMacheteLeagues, isFantasySquadLeague } from "./display";

test("Machete leagues put the requested priority competitions first", () => {
  const leagues = [
    { name: "MLS", country: "United States", providerLeagueId: "130" },
    { name: "Europa League", country: "International", providerLeagueId: "73" },
    { name: "Premier League", country: "Russia", providerLeagueId: "63" },
    { name: "Premier League", country: "England", providerLeagueId: "47" },
    { name: "Liga Portugal", country: "Portugal", providerLeagueId: "61" },
    { name: "World Cup 2026", country: "International", providerLeagueId: "77" },
    { name: "Eredivisie", country: "Netherlands", providerLeagueId: "57" }
  ];

  assert.deepEqual(leagues.sort(compareMacheteLeagues).map((league) => league.providerLeagueId), [
    "47",
    "63",
    "57",
    "73",
    "61",
    "130",
    "77"
  ]);
});

test("fantasy squad leagues use the explicit product competition allowlist", () => {
  assert.equal(isFantasySquadLeague({ providerLeagueId: "47" }), true);
  assert.equal(isFantasySquadLeague({ providerLeagueId: "61" }), true);
  assert.equal(isFantasySquadLeague({ providerLeagueId: "77" }), false);
  assert.equal(isFantasySquadLeague({ providerLeagueId: "130" }), false);
});
