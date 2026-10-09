/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { applySportsRuRosterOverrides, loadFplRosterPriceContext } from "./squad_planner";

test("an agreeing FPL price/map exposes inactive players and provider clubs without shared roster writes", async () => {
  const league = { leagueId: 47n, season: "2026/2027", name: "Premier League", country: "England" };
  const base = { leagueId: 47n, season: league.season, position: "MID", positionLabel: "MID",
    sourceKind: "FPL_BOOTSTRAP_STATIC", sourceRowIndex: 0, selectedByPercent: 0, lastSeenAt: new Date(),
    normalizedName: "player", teamName: "Arsenal", fotmobPlayerName: null, price: 5 };
  const prices = [1n, 2n, 3n].map((id) => ({ ...base, id: `price-${id}`, playerId: id,
    providerPlayerId: `fpl-${id}`, teamId: 9825n, playerName: `Player ${id}`,
    player: { id, name: `Player ${id}`, country: "England" }, team: { id: 9825n, name: "Arsenal" } }));
  let requestedMapScope: unknown;
  const db = {
    fantasyPlayerPrice: { findMany: async () => prices },
    providerEntityMap: { findMany: async (args: unknown) => {
      requestedMapScope = args;
      return [{ providerEntityId: "fpl-1", internalEntityId: "1" }, { providerEntityId: "fpl-2", internalEntityId: "999" }];
    } }
  } as unknown as PrismaClient;
  const context = await loadFplRosterPriceContext(db, league, "fpl-contest");
  assert.deepEqual(context.rosterOverrides.map((row) => String(row.playerId)), ["1"]);
  assert.deepEqual(context.priceMaps, [{ providerEntityId: "price-1", internalEntityId: "1" }]);
  assert.deepEqual((requestedMapScope as { where: unknown }).where, {
    provider: "FPL", providerSeason: league.season, contestId: "fpl-contest", providerEntityType: "PLAYER",
    providerEntityId: { in: ["fpl-1", "fpl-2", "fpl-3"] }, internalEntityType: "PLAYER",
    internalEntityId: { not: null }, status: "MATCHED"
  });
  const effective = applySportsRuRosterOverrides([], context.rosterOverrides);
  assert.equal(effective[0].playerId, 1n);
  assert.equal(effective[0].teamId, 9825n);
  assert.equal(effective[0].position, "MID");
  assert.equal(effective[0].isStarter, false);
  assert.equal((await loadFplRosterPriceContext(db, league, "fpl-contest", [2n])).rosterOverrides.length, 0);
});
