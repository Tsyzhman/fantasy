/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#source */
import test from "node:test";
import assert from "node:assert/strict";
import { nearestTeamGames, parseLineup, parseGames, SorareInsideClient, sourceId, type SourceGame, type SourceTeam } from "./client";
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const team=(n:number):SourceTeam=>({id:id(n),name:`Team ${n}`,slug:`team-${n}`,country:"gb-eng",national:false});
const now=new Date("2026-09-11T12:00:00Z");
const game=(n:number,kickoff:string,lineup:string|null=id(n+100)):SourceGame=>({id:id(n),kickoff,status:"scheduled",home:team(1),away:team(n+10),homeLineup:lineup,awayLineup:null});

test("nearest fixture is selected across windows before checking prediction availability",()=> {
  const earlier=game(2,"2026-09-12T12:00:00.000Z",null);const later=game(3,"2026-09-16T12:00:00.000Z");
  const selected=nearestTeamGames([later,earlier],now).get(id(1))!;
  assert.equal(selected.game.id,earlier.id);assert.equal(selected.lineupId,null);
});
test("past, playing, postponed and cancelled games never supply next XI",()=> {
  const future=game(6,"2026-09-14T12:00:00.000Z");
  const games=[game(1,"2026-09-10T12:00:00.000Z"),...['playing','cancelled','postponed'].map((status,i)=>({...game(i+2,"2026-09-12T12:00:00.000Z"),status})),future];
  assert.equal(nearestTeamGames(games,now).get(id(1))!.game.id,future.id);
});
test("identical duplicates collapse; conflicting and simultaneous games fail closed",()=> {
  const g=game(3,"2026-09-12T12:00:00.000Z");
  assert.equal(nearestTeamGames([g,g],now).size,2);
  assert.throws(()=>nearestTeamGames([g,{...g,homeLineup:null}],now),/conflicting/);
  assert.throws(()=>nearestTeamGames([g,{...g,id:id(7)}],now),/simultaneous/);
});
test("only eleven starters belonging to selected fixture are accepted, alternatives ignored",()=> {
  const g=game(3,"2026-09-12T12:00:00.000Z");const selected=nearestTeamGames([g],now).get(id(1))!;
  const players=Array.from({length:11},(_,i)=>({id:`Player:${id(i+200)}`,display_name:`Player ${i}`,slug:`player-${i}`,birth_date:"2000-01-01",position:i===0?"Goalkeeper":"Defender",lineup_position_index:i}));
  const data={id:g.homeLineup,game_id:g.id,team:{id:id(1)},is_published:true,updated_at:now.toISOString(),formation:"4-4-2",lineup_players:{starting_players:[...players].reverse(),alternate_players:[{id:"invalid"}]}};
  assert.equal(parseLineup(data,selected).players[0].index,0);
  assert.throws(()=>parseLineup({...data,game_id:id(999)},selected),/fixture/);
  assert.throws(()=>parseLineup({...data,is_published:false},selected),/unpublished/);
  assert.throws(()=>parseLineup({...data,lineup_players:{starting_players:players.slice(0,10)}},selected),/11/);
  assert.throws(()=>parseLineup({...data,lineup_players:{starting_players:[players[0],...players.slice(0,10)]}},selected),/11/);
});
test("invalid payloads and malformed IDs cannot create requests or clear flags",()=> {
  assert.throws(()=>parseGames({error:"Forbidden"}));
  assert.throws(()=>sourceId("../../other"));
  assert.equal(sourceId(`Player:${id(7)}`),id(7));
});
test("HTTP errors do not leak response secrets and sessions reuse cookies",async()=> {
  let logins=0;let gets=0;
  const client=new SorareInsideClient({email:"test",password:"secret"},async(url,init)=> {
    if(String(url).endsWith('/auth/login')) {logins++;return new Response('{}',{headers:{'set-cookie':'token=test; HttpOnly'}});}
    assert.equal(new Headers(init?.headers).get('cookie'),'token=test');gets++;
    return new Response('{"password":"secret"}',{status:gets===2?503:200});
  });
  await client.get('/gameweeks');await assert.rejects(client.get('/gameweeks'),/^Error: SorareInside HTTP 503$/);assert.equal(logins,1);
});

const apiTeam = (n: number) => ({ id: `Club:${id(n)}`, name: `Team ${n}`, slug: `team-${n}`, country: { code: "gb-eng" } });
const apiGame = (n: number, kickoff: string) => ({
  id: `Game:${id(n)}`, date: kickoff, statusTyped: "scheduled", homeTeam: apiTeam(1), awayTeam: apiTeam(2),
  homeTeamLineup: { id: id(n + 100), is_published: true }, awayTeamLineup: null
});
const apiRegions = (games: unknown[]) => [{ competitions: [{ games }] }];
function scheduleClient(scheduled: unknown[], windows: unknown[] = [apiGame(3, "2026-09-13T12:00:00Z")]) {
  return new SorareInsideClient({ email: "test", password: "secret" }, async (url) => {
    const path = new URL(String(url));
    const body = path.pathname === "/auth/login" ? {} : path.pathname === "/gameweeks"
      ? [{ slug: "current", startDate: "2026-09-10T12:00:00Z", endDate: "2026-09-15T12:00:00Z" }]
      : apiRegions(path.searchParams.has("scheduledLineups") ? scheduled : windows);
    return new Response(JSON.stringify(body), { headers: { "set-cookie": "token=test; HttpOnly" } });
  });
}

test("scheduled lineup clubs without country reuse exact UUID metadata from complete windows", async () => {
  const sparse = { ...apiGame(4, "2026-09-12T12:00:00Z"), homeTeam: { ...apiTeam(1), country: undefined }, awayTeam: { ...apiTeam(2), country: undefined } };
  const games = await scheduleClient([sparse]).schedule(now);
  const selected = nearestTeamGames(games, now).get(id(1))!;
  assert.equal(selected.game.id, id(4));
  assert.equal(selected.team.country, "gb-eng");
  assert.equal(selected.lineupId, id(104));
});

test("sparse scheduled clubs cannot borrow country by name, conflicting identity or malformed country", async () => {
  for (const homeTeam of [
    { ...apiTeam(99), country: undefined },
    { ...apiTeam(1), slug: "another-club", country: undefined },
    { ...apiTeam(1), name: "Another club", country: undefined },
    { ...apiTeam(1), country: [] }
  ]) {
    await assert.rejects(scheduleClient([{ ...apiGame(4, "2026-09-12T12:00:00Z"), homeTeam }]).schedule(now));
  }
});

test("missing country in full windows and conflicting UUID metadata still abort complete schedule", async () => {
  const first = apiGame(3, "2026-09-13T12:00:00Z");
  await assert.rejects(scheduleClient([], [{ ...first, homeTeam: { ...apiTeam(1), country: undefined } }]).schedule(now));
  const conflicting = { ...apiGame(5, "2026-09-14T12:00:00Z"), homeTeam: { ...apiTeam(1), country: { code: "fr" } } };
  await assert.rejects(scheduleClient([], [first, conflicting]).schedule(now), /conflicting/);
});
