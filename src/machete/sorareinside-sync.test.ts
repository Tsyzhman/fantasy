/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#source */
import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { IncompleteSorareInsideLineupError, SorareInsideClient } from "../providers/sorareinside/client";
import { runSorareInsideSync } from "./sorareinside-sync";

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;

test("sync supplies current club scope before parsing and never fetches a foreign XI",async()=> {
  const kickoff=new Date(Date.now()+2*86400000).toISOString();
  const team=(n:number,name:string,country:string|null)=>({id:`Club:${id(n)}`,name,slug:`club-${n}`,country:country?{code:country}:null});
  const needed={id:`Game:${id(10)}`,date:kickoff,statusTyped:"scheduled",homeTeam:team(1,"Milan","it"),awayTeam:team(2,"Other club","it"),
    homeTeamLineup:{id:id(100),is_published:true},awayTeamLineup:{id:"invalid-foreign-lineup",is_published:true}};
  const foreign={...needed,id:`Game:${id(20)}`,date:"2026-11-18T22:30:00Z",homeTeam:team(80,"Santos FC Sao Paulo",null),
    awayTeam:team(81,"Coritiba FBC",null),homeTeamLineup:{id:id(200),is_published:true}};
  const requests:string[]=[];
  const client=new SorareInsideClient({email:"test",password:"secret"},async url=> {
    const path=new URL(String(url));requests.push(path.pathname+path.search);
    const body=path.pathname==="/auth/login"?{}:path.pathname==="/gameweeks"?
      [{slug:"current",startDate:new Date(Date.now()-86400000).toISOString(),endDate:new Date(Date.now()+3*86400000).toISOString()}]:
      path.pathname.startsWith("/lineups/")?{id:id(100),game_id:id(10),team:{id:id(1)},is_published:true,updated_at:new Date().toISOString(),formation:"4-4-2",
        lineup_players:{starting_players:Array.from({length:11},(_,i)=>({id:`Player:${id(300+i)}`,display_name:`Player ${i}`,slug:`player-${i}`,
          birth_date:"2000-01-01",position:i===0?"Goalkeeper":"Defender",lineup_position_index:i}))}}:
      [{competitions:[{games:path.searchParams.has("scheduledLineups")?[foreign]:[needed]}]}];
    return new Response(JSON.stringify(body),{headers:{"set-cookie":"session=test; HttpOnly"}});
  });
  const db={
    $transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:async()=>[{locked:true}]}),
    fantasyPlayerPrice:{groupBy:async()=>[{leagueId:73n,season:"2026/2027"}],findMany:async()=>[]},
    leagueSeason:{findMany:async()=>[{leagueId:73n,season:"2026/2027",league:{name:"Europa League"},teams:[
      {team:{id:8564n,name:"Milan",country:"ITA"},players:[]}
    ]}]},
    providerEntityMap:{findMany:async()=>[]}
  } as unknown as PrismaClient;
  const report=await runSorareInsideSync(db,client);
  assert.deepEqual(report.teams.map(t=>({team:t.team,status:t.status})),[{team:"Milan",status:"PLAYERS_UNMAPPED"}]);
  assert.deepEqual(requests.filter(p=>p.startsWith("/lineups/")),[`/lineups/${id(100)}`]);
});

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
test("only an absent or incomplete forecast falls back, and a later prediction is never used", async () => {
  const kickoff = new Date(Date.now() + 86400000).toISOString();
  const home = { id: id(1), name: "Milan", slug: "milan", country: "it", national: false };
  const away = { id: id(2), name: "Other club", slug: "other", country: "it", national: false };
  const actual = Array.from({ length: 11 }, (_, i) => ({
    playerId: BigInt(i + 1), player: { name: `Player ${i + 1}` },
    position: i === 0 ? "Goalkeeper" : "Midfielder", shirtNumber: i + 1
  }));
  for (const mode of ["missing", "incomplete", "transport"] as const) {
    let queries = 0;
    const lineupRequests: Array<string | null> = [];
    const club = { id: 8564n, name: "Milan", country: "ITA" };
    const client = {
      schedule: async () => [
        { id: id(10), kickoff, status: "scheduled", home, away, homeLineup: mode === "missing" ? null : id(100), awayLineup: null },
        { id: id(11), kickoff: new Date(Date.now() + 2 * 86400000).toISOString(), status: "scheduled", home, away, homeLineup: id(101), awayLineup: null }
      ],
      lineup: async ({ lineupId }: { lineupId: string | null }) => {
        lineupRequests.push(lineupId);
        if (mode === "incomplete") throw new IncompleteSorareInsideLineupError();
        throw new Error("SorareInside HTTP 503");
      }
    } as unknown as SorareInsideClient;
    const db = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback({ $queryRaw: async () => [{ locked: true }] }),
      fantasyPlayerPrice: { groupBy: async () => [{ leagueId: 55n, season: "2026/2027" }], findMany: async () => [] },
      leagueSeason: { findMany: async () => [{
        leagueId: 55n, season: "2026/2027", league: { name: "Serie A" }, teams: [{
          metadata: null, team: club, players: actual.map(({ playerId, position }) => ({
            player: { id: playerId }, position, active: true, isStarter: false
          }))
        }]
      }] },
      providerEntityMap: { findMany: async () => [] },
      coreMatch: { findFirst: async () => {
        queries += 1;
        return { id: 200n, matchDate: new Date(Date.now() - 86400000), homeTeamId: club.id, playerStats: actual };
      } }
    } as unknown as PrismaClient;
    const result = await runSorareInsideSync(db, client);
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.teams[0].status, mode === "missing" ? "NO_PREDICTION_FOR_NEAREST_MATCH" : "SOURCE_ERROR");
    assert.deepEqual(lineupRequests, mode === "missing" ? [] : [id(100)]);
    assert.equal(queries, mode === "transport" ? 0 : 1);
    assert.equal(result.teams[0].lastPlayed?.status, mode === "transport" ? undefined : "READY");
    assert.deepEqual(result.lastPlayedTotals, mode === "transport" ? {} : { READY: 1 });
  }
});
