import assert from "node:assert/strict";
import test from "node:test";

import {
  sportsRuNetherlandsPortugal2026ExcludedPlayers,
  sportsRuNetherlandsPortugal2026Mappings,
  sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers,
  sportsRuSyntheticPlayerId
} from "./sports-ru-nl-pt-2026-27-data";

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
