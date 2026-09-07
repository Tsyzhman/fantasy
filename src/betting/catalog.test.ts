/** @spec spec://modules/betting/FEAT-001-virtual-league#feed */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalog } from "./provider";
import { factorRule } from "./domain";
import { leagueForSport } from "./sync";
// Recorded public Fonbet factorsCatalog/tables, 2026-09-07. No account data.
const labels=parseCatalog(JSON.parse(readFileSync(new URL("./__fixtures__/fonbet-catalog.json",import.meta.url),"utf8")));
test("settlement whitelist agrees with the provider catalogue, including non-sequential away totals",()=>{
  for(let id=0;id<5000;id++) {
    const rule=factorRule(id,"2.5");if(!rule)continue;
    const label=labels.get(id)?.label;assert.ok(label,`Missing provider label ${id}`);
    if(rule.kind==="total"){
      assert.match(label!,rule.side.startsWith("home")?/Инд. тоталы-1/:rule.side.startsWith("away")?/Инд. тоталы-2/:/^Тотал/);
      assert.ok(label!.endsWith(rule.side.toLowerCase().endsWith("under")?"М":"Б"),`Wrong direction ${id}`);
    }
  }
  assert.equal(factorRule(1889,"3"),null);assert.equal(factorRule(1890,"3"),null);
  assert.equal(factorRule(1893,"3.5")?.side,"awayOver");assert.equal(factorRule(1894,"3.5")?.side,"awayUnder");
});
test("competition names distinguish tiers and map the actual Fonbet labels",()=>{
  for(const [name,id] of [["Греция. Суперлига 1",135],["Германия. Бундеслига 2",146],["Нидерланды. 1-й дивизион",111],["Португалия. 2-й дивизион",185],["Бельгия. Премьер-Лига",40],["Норвегия. Суперлига",59],["Швеция. Премьер-Лига",67],["Польша. Суперлига",196]] as const)assert.equal(leagueForSport(name),id);
  for(const name of ["Греция. Суперлига 2","Германия. Бундеслига 3","Шотландия. Кубок Лиги","Англия. Премьер-Лига. Итоги турнира","Португалия. До 23 лет. Молодежная лига"])assert.equal(leagueForSport(name),null,name);
});

import { hasRegulationScore, historicalScore } from "./competition";
test("European league phase can use 90-minute models and settlement; knockout ambiguity stays explicit",()=>{
  assert.equal(hasRegulationScore(42,"1"),true);
  assert.equal(hasRegulationScore(73,"8"),true);
  for(const round of [null,"final","1/8","playoff",""])assert.equal(hasRegulationScore(42,round),false);
  assert.equal(hasRegulationScore(47,null),true);
});

test("missing match score can use exact team statistics, preserving zero and rejecting incomplete or conflicting data",()=>{
  const input={homeTeamId:1n,awayTeamId:2n,homeScore:null,awayScore:null,teamStats:[{teamId:1n,goals:0},{teamId:2n,goals:2}]};
  assert.deepEqual(historicalScore(input),{home:0,away:2,source:"TEAM_STATS"});
  assert.equal(historicalScore({...input,teamStats:[{teamId:3n,goals:4},{teamId:2n,goals:2}]}),null);
  assert.equal(historicalScore({...input,homeScore:1}),null);
  assert.equal(historicalScore({...input,teamStats:[]}),null);
  assert.deepEqual(historicalScore({...input,homeScore:1,awayScore:2}),{home:1,away:2,source:"MATCH"});
});
