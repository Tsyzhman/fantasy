import assert from "node:assert/strict";
import test from "node:test";

import {
  sportsRuNetherlandsPortugal2026Mappings,
  sportsRuNetherlandsPortugal2026SeedPlayers
} from "../../scripts/sports-ru-nl-pt-2026-27-data";

test("Netherlands and Portugal verified mapping plan is complete and unambiguous", () => {
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.length, 205);
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.filter(([leagueId]) => leagueId === "57").length, 91);
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.filter(([leagueId]) => leagueId === "61").length, 114);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026Mappings.map(([leagueId, providerId]) => `${leagueId}/${providerId}`)).size, 205);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026Mappings.map(([, , playerId]) => playerId)).size, 205);
});

test("known false automatic mappings are repaired before the remaining plan", () => {
  assert.deepEqual(
    sportsRuNetherlandsPortugal2026Mappings.slice(0, 3).map(([, providerId, playerId]) => [providerId, playerId]),
    [
      ["68907", "289254"],
      ["68765", "1625789"],
      ["68764", "1927888"]
    ]
  );
  const youngSorrisoIndex = sportsRuNetherlandsPortugal2026Mappings.findIndex(([, providerId]) => providerId === "68764");
  const olderSorrisoIndex = sportsRuNetherlandsPortugal2026Mappings.findIndex(([, providerId]) => providerId === "68831");
  assert.ok(youngSorrisoIndex < olderSorrisoIndex);
});

test("verified missing FotMob profiles have unique seed records", () => {
  assert.equal(sportsRuNetherlandsPortugal2026SeedPlayers.length, 40);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026SeedPlayers.map(([playerId]) => playerId)).size, 40);
  assert.deepEqual(
    sportsRuNetherlandsPortugal2026Mappings.find(([, providerId]) => providerId === "68274"),
    ["57", "68274", "1888960", "Feyenoord"]
  );
});
