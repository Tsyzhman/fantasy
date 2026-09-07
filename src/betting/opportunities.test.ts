/** @spec spec://modules/betting/FEAT-001-virtual-league#opportunities */
import assert from "node:assert/strict";
import test from "node:test";
import { BOTS, type ModelInput } from "./domain";
import type { AdviceMarket } from "./match-advice";
import { currentOpportunity, matchOpportunities, marketOpportunities, opportunitySnapshot, OPPORTUNITY_VERSION } from "./opportunities";
import { eventListQuery } from "./event-list";

const now = Date.parse("2026-09-07T12:00:00Z");
const market = (key: string, ev: number): AdviceMarket => ({ key, eventId: 1, factorId: 921, parameter: "", label: key, group: "Матч", odds: 2, rule: { kind: "result", side: "0" }, manual: false, enabled: true,
  recommendations: BOTS.map(b => ({ name: b.name, version: "test", decision: "BET", reason: "Выше порога", probability: .6, ev })) });
const event = { kickoff: new Date(now+3600000).toISOString(), fetchedAt: new Date(now).toISOString(), markets: [market("low", .1),market("best", .2)] };

test("multiple outcomes are ranked once each, with all supporting algorithms and deterministic ties", () => {
  const rows = marketOpportunities([...event.markets, market("best", .9), market("aaa", .2)]);
  assert.deepEqual(rows.map(r=>r.market.key),["aaa","best","low"]);
  assert.equal(rows[1].bestEv,.2);
  assert.equal(rows[1].supporters.length,5);
  assert.equal(event.markets[0].key,"low","Input order is not mutated");
});
test("unsupported, disabled, manual, nonfinite and non-BET outcomes are excluded", () => {
  const m=market("x",.2);
  for(const bad of [{...m,enabled:false},{...m,manual:true},{...m,rule:null},market("x",NaN),market("x",Infinity),market("x",-.2),{...m,recommendations:m.recommendations.map(r=>({...r,decision:"SKIP" as const}))}]) assert.equal(marketOpportunities([bad]).length,0);
});
test("freshness boundaries apply to the entire opportunity block", () => {
  assert.equal(matchOpportunities(event,now+300000).length,2);
  for(const t of [0,now-1,now+300001,now+3600000]) assert.equal(matchOpportunities(event,t).length,0);
  assert.equal(matchOpportunities({...event,closed:true},now).length,0);
  assert.equal(matchOpportunities({...event,fetchedAt:null},now).length,0);
});
test("summary cannot outlive its quote, kickoff or algorithm version", () => {
  const opportunity={version:OPPORTUNITY_VERSION,fetchedAt:event.fetchedAt,kickoff:event.kickoff,count:2,bestEv:.2};
  assert.equal(currentOpportunity({...event,opportunity},now)?.count,2);
  for(const patch of [{version:"old"},{fetchedAt:new Date(now-1).toISOString()},{kickoff:new Date(now+7200000).toISOString()},{count:-1},{bestEv:NaN}]) assert.equal(currentOpportunity({...event,opportunity:{...opportunity,...patch}},now),null);
  assert.equal(currentOpportunity({...event,opportunity},now+300001),null);
});
test("snapshot is bounded, rebuilt for changed odds, and does not retain markets", () => {
  const history=Array.from({length:20},(_,i)=>({at:new Date(now-(i+1)*86400000).toISOString(),home:i%2===0,goals:2,conceded:1,xg:2,xga:1}));
  const model:ModelInput={home:history,away:history,leagueHome:1.5,leagueAway:1.2,kickoff:event.kickoff};
  const first=opportunitySnapshot([market("one",0)],model,event.fetchedAt,event.kickoff);
  const changed=opportunitySnapshot([{...market("one",0),odds:6}],model,event.fetchedAt,event.kickoff);
  assert.ok(changed.count>0);
  assert.notEqual(changed.bestEv,first.bestEv);
  assert.ok(JSON.stringify(changed).length<300);
  assert.equal("markets" in changed,false);
  assert.equal(opportunitySnapshot([{...market("one",0),enabled:false}],model,event.fetchedAt,event.kickoff).count,0);
});
test("SQL ranks all filtered events before pagination, uses freshness and parameterized input", () => {
  const attack="%' OR true --";
  const query=eventListQuery("47",attack,30,"value",new Date(now));
  assert.match(query.text,/ORDER BY .*bestEv[\s\S]*kickoff ASC, id ASC LIMIT 30 OFFSET/);
  assert.match(query.text,/fetched_at BETWEEN/);
  assert.match(query.text,/NULLS LAST/);
  assert.ok(query.values.includes(`%${attack}%`));
  assert.ok(!query.text.includes(attack));
  assert.ok(query.values.includes(47n));
  assert.ok(query.values.includes(OPPORTUNITY_VERSION));
  assert.doesNotMatch(eventListQuery(null,"",0,"time",new Date(now)).text,/double precision DESC/);
});
