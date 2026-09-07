/** @spec spec://modules/betting/FEAT-001-virtual-league#ui */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOTS } from "./domain";
import { matchAdvice, type AdviceMarket } from "./match-advice";
const now = Date.parse("2026-09-07T12:00:00Z");
const market = (key: string, ev: number): AdviceMarket => ({ key, eventId: 1, factorId: 921, parameter: "", label: key, group: "Match", odds: 2, rule: { kind: "result", side: "0" }, manual: false, enabled: true, recommendations: BOTS.map(b => ({ name: b.name, version: "test", decision: b.name === "Mia" ? "BET" : "SKIP", reason: b.name === "Mia" ? "Есть преимущество" : "Недостаточно истории", probability: .6, ev })) });
const event = { kickoff: new Date(now + 3600000).toISOString(), fetchedAt: new Date(now).toISOString(), markets: [market("low", .1), market("best", .2)] };
test("five match-specific cards select each algorithm's best available market or explain skip", () => {
  const cards = matchAdvice(event, now);
  assert.deepEqual(cards.map(c => c.name), BOTS.map(b => b.name));
  assert.equal(cards[0].market?.key, "best");
  assert.ok(cards.slice(1).every(c => !c.market && c.reason === "Недостаточно истории"));
  assert.equal(matchAdvice({ ...event, markets: [market("different-match", .3)] }, now)[0].market?.key, "different-match");
});
test("closed, stale, missing and unsupported markets never produce an actionable tip", () => {
  for (const input of [{ ...event, closed: true }, { ...event, fetchedAt: null }, { ...event, fetchedAt: new Date(now - 300001).toISOString() }, { ...event, markets: [] }, { ...event, markets: event.markets.map(m => ({ ...m, enabled: false })) }, { ...event, markets: event.markets.map(m => ({ ...m, manual: true })) }]) {
    const cards = matchAdvice(input, now);
    assert.equal(cards.length, 5);
    assert.ok(cards.every(c => c.market === null && c.reason));
  }
});
