/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { autoMapSportsRuFantasyPlayers, buildSportsRuCatalogCandidates, isSafeAutomaticSportsRuCandidate, resolveSportsRuSeasonTeam } from "./sports_ru_player_mapping";
const now = new Date("2026-10-09T12:00:00Z");
const birthday = new Date("2006-06-08T00:00:00Z");
const player = {id:1630291n,name:"Aimar Govea",birthDate:birthday};
const team = {teamId:10003n,team:{name:"Swansea City"}};
const price = {id:"price",playerName:"Аймар Говеа",normalizedName:"aimar govea",fotmobPlayerName:"David Aimar Govea Merlin",
  providerStatPlayerId:"david_aimar_govea_merlin",providerBirthDate:birthday,lastSeenAt:now,teamName:"Суонси",position:"MID",price:5};

test("a current academy identity remains available without an active shared roster", async () => {
 const stored={...price,lastSeenAt:new Date(),leagueId:48n,season:"2026/2027",contestId:"contest",playerId:null,teamId:null};
 const writes:unknown[]=[];
 const prisma={fantasyPlayerPrice:{findMany:async(args:{where:{playerId?:{not:null}}})=>args.where.playerId?.not===null?[]:[stored],
   update:async(args:unknown)=>{writes.push(args);return stored;}},
  teamPlayerSeason:{findMany:async()=>[]},providerEntityMap:{findMany:async()=>[],upsert:async(args:unknown)=>writes.push(args)},
  corePlayer:{findMany:async(args:{where:{birthDate?:unknown}})=>args.where.birthDate?[player]:[]},
  leagueSeasonTeam:{findMany:async()=>[team]},userFantasySquad:{findMany:async()=>[]}} as unknown as PrismaClient;
 const result=await autoMapSportsRuFantasyPlayers(prisma,{leagueId:48n,season:"2026/2027",contestId:"contest",onlyUnmapped:true});
 assert.equal(result.matched,1);assert.equal(result.unmatched,0);
 assert.ok(writes.some(x=>JSON.stringify(x,(_k,v)=>typeof v==="bigint"?String(v):v).includes("AUTO_CANONICAL_BIRTH_DATE")));
});
test("catalog matching rejects contradictory or missing birthdays, weak names and stale evidence", () => {
 assert.equal(buildSportsRuCatalogCandidates(price,[player],team,now).length,1);
 for(const wrong of [{...player,birthDate:null},{...player,birthDate:new Date("2007-06-08Z")},{...player,name:"David Martin"}])
  assert.deepEqual(buildSportsRuCatalogCandidates(price,[wrong],team,now),[]);
 for(const wrong of [{...price,lastSeenAt:new Date("2026-10-01Z")},{...price,providerStatPlayerId:null},{...price,providerBirthDate:null},
  {...price,fotmobPlayerName:"Aimar"}]) assert.deepEqual(buildSportsRuCatalogCandidates(wrong,[player],team,now),[]);
 assert.deepEqual(buildSportsRuCatalogCandidates(price,[player],null,now),[]);
});
test("duplicate canonical identities cannot become a catalog match", () => {
 const candidates=buildSportsRuCatalogCandidates(price,[player,{...player,id:999n}],team,now);
 assert.equal(candidates.length,0);assert.equal(isSafeAutomaticSportsRuCandidate(candidates[0],candidates[1]),false);
});
test("reviewed Europa club aliases distinguish OFI, Omonia and the two Unions", () => {
 const teams=[{teamId:7753n,team:{name:"OFI Crete"}},{teamId:8044n,team:{name:"Omonia Nicosia"}},
  {teamId:7978n,team:{name:"Union St.Gilloise"}},{teamId:8149n,team:{name:"Union Berlin"}}];
 assert.equal(resolveSportsRuSeasonTeam("ОФИ",teams)?.teamId,7753n);
 assert.equal(resolveSportsRuSeasonTeam("Омония",teams)?.teamId,8044n);
 assert.equal(resolveSportsRuSeasonTeam("Юнион",teams)?.teamId,7978n);
 assert.equal(resolveSportsRuSeasonTeam("Унион Берлин",teams)?.teamId,8149n);
 assert.equal(resolveSportsRuSeasonTeam("Union",teams),null);
});
