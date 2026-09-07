/** @spec spec://modules/betting/FEAT-001-virtual-league#settlement */
import test from "node:test";
import assert from "node:assert/strict";
import { BOTS,factorRule,payoutMultiplier,recommend,type ModelInput,type Selection } from "./domain";
import { parseCatalog,parseSelections,type Feed } from "./provider";
const selection:Selection={key:"1:921:",eventId:1,factorId:921,parameter:"",label:"П1",group:"Матч",odds:2.5,rule:factorRule(921,""),manual:false,enabled:true};
test("fixed odds: two tickets for the same result pay their own prices",()=>{
  assert.equal(payoutMultiplier(selection.rule!,2,0,2.5),2.5);
  assert.equal(payoutMultiplier(selection.rule!,2,0,2.6),2.6);
  assert.equal(payoutMultiplier(factorRule(922,"")!,2,2,3.2),3.2);
});
test("integer totals push; quarter lines split correctly, including negative handicaps",()=>{
  const total=(line:number,side="over")=>({kind:"total" as const,side,line});
  assert.equal(payoutMultiplier(total(2),1,1,2.4),1);
  assert.equal(payoutMultiplier(total(2.25),1,1,2.4),.5);
  assert.equal(payoutMultiplier(total(1.75),1,1,2.4),1.7);
  assert.equal(payoutMultiplier(total(2.25,"under"),1,1,2.4),1.7);
  assert.equal(payoutMultiplier({kind:"handicap",side:"home",line:-.25},1,1,2.4),.5);
  assert.equal(payoutMultiplier({kind:"handicap",side:"away",line:.25},1,1,2.4),1.7);
});
test("unknown and unsupported fractional factors are not guessed",()=>{
  assert.equal(factorRule(999999,"2.5"),null);assert.equal(factorRule(930,"2.1"),null);assert.equal(factorRule(930,""),null);
  assert.ok(recommend({...selection,manual:true},null).every(r=>r.decision==="SKIP" && r.probability===null));
});
test("models require history and are deterministic, with distinct published policies",()=>{
  assert.equal(new Set(BOTS.map(b=>b.description)).size,5);
  assert.ok(recommend(selection,null).every(r=>r.decision==="SKIP"));
  const rows=Array.from({length:20},(_,i)=>({at:new Date(Date.UTC(2026,7,28-i*5)).toISOString(),home:i%2===0,goals:i<8?3:1,conceded:1,xg:1.8,xga:1.1}));
  const input:ModelInput={home:rows,away:rows.map(r=>({...r,goals:1,xg:1})),leagueHome:1.6,leagueAway:1.2,kickoff:"2026-09-01T12:00:00Z"};
  const result=recommend(selection,input);assert.deepEqual(result,recommend(selection,input));
  assert.ok(new Set(result.map(r=>r.ev)).size>=3);assert.ok(result.every(r=>r.probability!==null && r.probability>=0 && r.probability<=1));
  assert.ok(recommend(selection,{...input,home:rows.slice(0,3)}).every(r=>r.decision==="SKIP"));
});
test("full feed keeps nested markets, blocks suspended selections, and distinguishes parameter prices",()=>{
  const labels=parseCatalog({groups:[{name:"Основные",tables:[{name:"Исходы",rows:[[{name:"1"},{name:"X"},{name:"2"}],[{kind:"value",factorId:921},{kind:"value",factorId:922},{kind:"value",factorId:923}]]}]}]});
  const feed:Feed={sports:[],events:[{id:1,kind:1,level:1,sportId:2,startTime:9999999999,place:"line",team1:"Chelsea",team2:"Arsenal"},{id:2,parentId:1,kind:100201,level:2,sportId:2,startTime:9999999999,place:"line",name:"1-й тайм"}],customFactors:[{e:1,factors:[{f:921,v:2.5},{f:922,v:3,blocked:true},{f:999999,v:2}]},{e:2,factors:[{f:921,v:2.6}]}]};
  const s=parseSelections(feed,1,labels);assert.equal(s.length,4);assert.equal(s[0].odds,2.5);assert.equal(s[3].odds,2.6);assert.equal(s[3].manual,true);assert.equal(s[1].enabled,false);assert.equal(s[2].enabled,false);
  assert.equal(new Set(s.map(s=>s.key)).size,4);
});
