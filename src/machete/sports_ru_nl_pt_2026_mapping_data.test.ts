import assert from "node:assert/strict";
import test from "node:test";

import {
  sportsRuNetherlandsPortugal2026ExcludedPlayers,
  sportsRuNetherlandsPortugal2026Mappings,
  sportsRuNetherlandsPortugal2026SeedPlayers,
  sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers,
  sportsRuSyntheticPlayerId
} from "../../scripts/sports-ru-nl-pt-2026-27-data";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("Netherlands and Portugal verified mapping plan is complete and unambiguous", () => {
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.length, 225);
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.filter(([leagueId]) => leagueId === "57").length, 99);
  assert.equal(sportsRuNetherlandsPortugal2026Mappings.filter(([leagueId]) => leagueId === "61").length, 126);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026Mappings.map(([leagueId, providerId]) => `${leagueId}/${providerId}`)).size, 225);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026Mappings.map(([, , playerId]) => playerId)).size, 225);
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
  assert.equal(sportsRuNetherlandsPortugal2026SeedPlayers.length, 52);
  assert.equal(new Set(sportsRuNetherlandsPortugal2026SeedPlayers.map(([playerId]) => playerId)).size, 52);
  assert.deepEqual(
    sportsRuNetherlandsPortugal2026Mappings.find(([, providerId]) => providerId === "68274"),
    ["57", "68274", "1888960", "Feyenoord"]
  );
});

test("Sports.ru academy players use deterministic collision-safe core ids", () => {
  const ids = sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers.map(([playerId]) => playerId);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.every((playerId) => BigInt(playerId) < BigInt(Number.MAX_SAFE_INTEGER)), true);
  for (const [playerId, , , , providerPlayerId] of sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers) {
    assert.equal(playerId, sportsRuSyntheticPlayerId(providerPlayerId));
  }
});

test("all Sports.ru academy seed players are mapped and transferred-out players are not", () => {
  const mappedProviderIds = new Set<string>(sportsRuNetherlandsPortugal2026Mappings.map(([, providerPlayerId]) => providerPlayerId));

  for (const [, , , , providerPlayerId] of sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers) {
    assert.equal(mappedProviderIds.has(providerPlayerId), true);
  }
  for (const [, providerPlayerId] of sportsRuNetherlandsPortugal2026ExcludedPlayers) {
    assert.equal(mappedProviderIds.has(providerPlayerId), false);
  }
});

test("Rafik El Arguioui remains locked to Cambuur while Sports.ru is stale", () => {
  const mapping = sportsRuNetherlandsPortugal2026Mappings.find(([, providerPlayerId]) => providerPlayerId === "68229");

  assert.deepEqual(mapping, ["57", "68229", "1344244", "Cambuur", "TEAM_OVERRIDE"]);
});

test("Ro-Zangelo Daal remains explicitly mapped to the AZ first-team identity", () => {
  const mapping = sportsRuNetherlandsPortugal2026Mappings.find(([, providerPlayerId]) => providerPlayerId === "67823");

  assert.deepEqual(mapping, ["57", "67823", "1352213", "AZ Alkmaar"]);
});

test("Gustavo Sa is not required after Sports.ru removed his transferred-out price", () => {
  const mappedProviderIds = new Set<string>(sportsRuNetherlandsPortugal2026Mappings.map(([, providerPlayerId]) => providerPlayerId));

  assert.equal(mappedProviderIds.has("68833"), false);
});
