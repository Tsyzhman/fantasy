import assert from "node:assert/strict";
import test from "node:test";

import { compareMacheteLeagues } from "./display";

test("Machete leagues put the requested priority competitions first", () => {
  const leagues = [
    { name: "MLS", country: "United States", providerLeagueId: "130" },
    { name: "Europa League", country: "International", providerLeagueId: "73" },
    { name: "Premier League", country: "Russia", providerLeagueId: "63" },
    { name: "Premier League", country: "England", providerLeagueId: "47" },
    { name: "World Cup 2026", country: "International", providerLeagueId: "77" },
    { name: "Eredivisie", country: "Netherlands", providerLeagueId: "57" }
  ];

  assert.deepEqual(leagues.sort(compareMacheteLeagues).map((league) => league.providerLeagueId), [
    "47",
    "63",
    "57",
    "73",
    "77",
    "130"
  ]);
});
