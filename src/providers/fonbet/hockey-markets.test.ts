import test from "node:test";
import assert from "node:assert/strict";
import { noVig, reconcileMarkets, hockeyMarketKey, matchHockeyEvent, type HockeyMarket } from "./hockey-markets";
const markets: HockeyMarket[] = ["HOME", "DRAW", "AWAY"].map(selection => ({ type: "1X2", scope: "REGULATION_60", period: 0, selection, line: null, odds: 3.1, status: "AVAILABLE" }));
test("ODD-01/03: complete and compatible market only", () => {
  assert.ok(Math.abs(noVig(markets)!.reduce((s, p) => s + p.probability, 0) - 1) < 1e-6);
  assert.equal(noVig(markets.slice(1)), null);
  assert.equal(noVig(markets.map((m, i) => i ? m : { ...m, status: "SUSPENDED" })), null);
  assert.notEqual(hockeyMarketKey(markets[0]), hockeyMarketKey({ ...markets[0], scope: "INCLUDING_OT_SO" }));
});
test("ODD-04: outage and delta omission are not withdrawal", () => {
  assert.equal(reconcileMarkets(markets, [], true, false).stale, true);
  assert.ok(reconcileMarkets(markets, [], false, true).markets.every(m => m.status === "AVAILABLE"));
  assert.ok(reconcileMarkets(markets, [], true, true).markets.every(m => m.status === "WITHDRAWN"));
});
test("ODD-02: reversed sides, child events and ambiguous candidates never match", () => {
  const event = { homeId: "a", awayId: "b", seasonId: "s", startsAt: 1, parentId: null, live: false };
  const match = { ...event, id: "m" };
  assert.equal(matchHockeyEvent(event, [match]).matchId, "m");
  assert.equal(matchHockeyEvent(event, [match, { ...match, id: "m2" }]).status, "AMBIGUOUS");
  assert.equal(matchHockeyEvent({ ...event, homeId: "b", awayId: "a" }, [match]).status, "UNMATCHED");
  assert.equal(matchHockeyEvent({ ...event, parentId: "period" }, [match]).status, "UNMATCHED");
});
