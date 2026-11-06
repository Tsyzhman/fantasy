/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
import test from "node:test";
import assert from "node:assert/strict";
import {isSourceTeamInScope,resolveSourcePlayer,resolveSourceTeam,hasUpcomingSorareLineup} from "./sorareinside-identity";
import { REVIEWED_SORARE_BIRTH_DATE_CONFLICTS } from "../providers/sorareinside/reviewed-player-ids";
const source={id:"s",name:"José Silva",slug:"jose-silva",birthDate:"2000-01-01",position:"Midfielder",index:2};
const roster=[{id:1n,name:"Jose Silva",birthDate:new Date("2000-01-01")}];
test("initial exact club-roster match becomes an ID match even after display-name changes",()=> {
  assert.equal(resolveSourcePlayer(source,roster).player?.id,1n);
  assert.equal(resolveSourcePlayer({...source,name:"Changed",slug:"changed"},roster,1n).reason,"PROVIDER_ID");
});
test("an ID missing from the active club never falls back to a same-name player",()=> {
  assert.equal(resolveSourcePlayer(source,roster,99n).reason,"ID_NOT_IN_ACTIVE_ROSTER");
});
test("ambiguous names and conflicting birthdays are blocked",()=> {
  assert.equal(resolveSourcePlayer(source,[...roster,{...roster[0],id:2n}]).reason,"AMBIGUOUS");
  assert.equal(resolveSourcePlayer({...source,birthDate:"2001-01-01"},roster).reason,"BIRTH_DATE_CONFLICT");
  assert.equal(resolveSourcePlayer({...source,name:"Silva",slug:"silva",birthDate:null},roster).player,null);
});
test("manual birth-date reviews require the saved player, exact club and both observed dates", () => {
  for (const [id, review] of Object.entries(REVIEWED_SORARE_BIRTH_DATE_CONFLICTS)) {
    const provider = { ...source, id, birthDate: review.sourceBirthDate };
    const candidate = { ...roster[0], id: review.playerId, birthDate: new Date(review.canonicalBirthDate) };
    assert.equal(resolveSourcePlayer(provider, [candidate], review.playerId, review.teamId).reason, "MANUAL_VERIFIED_ID");
    assert.equal(resolveSourcePlayer(provider, [candidate], undefined, review.teamId).reason, "BIRTH_DATE_CONFLICT");
    assert.equal(resolveSourcePlayer(provider, [candidate], review.playerId, 999n).reason, "BIRTH_DATE_CONFLICT");
    assert.equal(resolveSourcePlayer({ ...provider, birthDate: "1990-01-01" }, [candidate], review.playerId, review.teamId).reason, "BIRTH_DATE_CONFLICT");
    assert.equal(resolveSourcePlayer(provider, [{ ...candidate, birthDate: new Date("1990-01-01") }], review.playerId, review.teamId).reason, "BIRTH_DATE_CONFLICT");
    assert.equal(resolveSourcePlayer(provider, [], review.playerId, review.teamId).reason, "ID_NOT_IN_ACTIVE_ROSTER");
  }
});
test("birthday supports abbreviated names but cannot map an unrelated same-birthday player",()=> {
  assert.equal(resolveSourcePlayer({...source,name:"Silva",slug:"silva"},roster).reason,"BIRTH_DATE_AND_NAME_IN_TEAM");
  assert.equal(resolveSourcePlayer({...source,name:"Another Person",slug:"another-person"},roster).player,null);
});
test("reviewed UUID does not confuse two players with the same birthday",()=> {
  const p={...source,id:"f8ce190b-e498-4367-8685-3603fab2643e",birthDate:"2001-11-23",name:"T. Anjorin",slug:"faustino-anjorin"};
  const players=[{id:983199n,name:"Tino Anjorin",birthDate:null},{id:1072828n,name:"Gökdeniz Bayrakdar",birthDate:new Date("2001-11-23")}];
  assert.equal(resolveSourcePlayer(p,players).player?.id,983199n);
  assert.equal(resolveSourcePlayer(p,players.slice(1)).player,null);
});
test("verified Alejandro/Alex Pozo UUID still requires the correct date and active club membership",()=> {
  const p={...source,id:"4340cca6-8053-4f3d-9990-0f5e5926240d",name:"Alejandro Pozo",slug:"alejandro-pozo-pozo",birthDate:"1999-02-22"};
  const players=[{id:785855n,name:"Alex Pozo",birthDate:null}];
  assert.equal(resolveSourcePlayer(p,players).reason,"REVIEWED_UUID");
  assert.equal(resolveSourcePlayer({...p,birthDate:"1999-02-23"},players).player,null);
  assert.equal(resolveSourcePlayer(p,[]).reason,"ID_NOT_IN_ACTIVE_ROSTER");
});
test("reviewed team aliases distinguish Celta from its reserve team",()=> {
  const teams=[{id:1n,name:"Celta Vigo",country:"ESP"}];
  const src={id:"s",name:"RC Celta",slug:"celta",country:"es",national:false};
  assert.equal(resolveSourceTeam(src,teams)?.id,1n);
  assert.equal(resolveSourceTeam({...src,name:"Real Club Celta de Vigo II"},teams),null);
});

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#source */
test("club scope uses only current catalog IDs and exact identity rules",()=> {
  const teams=[{id:1n,name:"Celta Vigo",country:"ESP"}];
  assert.equal(isSourceTeamInScope({id:"known"},teams,1n),true);
  assert.equal(isSourceTeamInScope({id:"removed",name:"RC Celta",country:"es"},teams,99n),false);
  assert.equal(isSourceTeamInScope({name:"Santos FC Sao Paulo"},teams),false);
  assert.equal(isSourceTeamInScope({name:"RC Celta",country:"es"},teams),true);
  assert.equal(isSourceTeamInScope({name:"Real Club Celta de Vigo II",country:"es"},teams),false);
  assert.equal(isSourceTeamInScope({name:"RC Celta",country:"es",national:true},teams),false);
});

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#source */
test("a potentially relevant sparse club is kept for strict parsing without guessing country",()=> {
  const teams=[{id:1n,name:"Celta Vigo",country:"ESP"}];
  assert.equal(isSourceTeamInScope({name:"RC Celta"},teams),true);
  assert.equal(isSourceTeamInScope({name:"Celta Vigo"},teams),true);
  assert.equal(isSourceTeamInScope({name:"Unrelated club"},teams),false);
  assert.equal(resolveSourceTeam({id:"new",name:"RC Celta",slug:"celta",country:null,national:false},teams),null);
});

test("reviewed Europa aliases resolve uniquely without broadening name matching",()=> {
  const pairs=[
    ["be","RSC Anderlecht","Anderlecht"], ["be","Royal Union Saint-Gilloise","Union St.Gilloise"],
    ["hr","GNK Dinamo Zagreb","Dinamo Zagreb"], ["cz","AC Sparta Praha","Sparta Prague"],
    ["gr","Olympiakos CFP","Olympiacos"], ["at","SK Puntigamer Sturm Graz","Sturm Graz"],
    ["at","FC Red Bull Salzburg","Salzburg"], ["pl","KKS Lech Poznań","Lech Poznań"],
    ["no","Lillestrøm SK","Lillestrøm"], ["bg","PFC Levski Sofia","Levski Sofia"],
    ["pl","SSA Jagiellonia Białystok","Jagiellonia Białystok"], ["gr","OFI FC","OFI Crete"],
    ["si","NK Celje","NK Celje"], ["hu","Ferencvárosi TC","Ferencváros"],
    ["am","Ararat-Armenia FC","Ararat Armenia"], ["pt","SC União Torreense","Torreense"]
  ];
  const teams=pairs.map(([, , name],i)=>({id:BigInt(i+1),name,country:null}));
  for(const [i,[country,name]] of pairs.entries()) {
    const src={id:`source-${i}`,name,slug:`club-${i}`,country,national:false};
    assert.equal(resolveSourceTeam(src,teams)?.id,BigInt(i+1),name);
    assert.equal(resolveSourceTeam({...src,name:`${name} II`},teams),null,name);
    assert.equal(resolveSourceTeam({...src,country:"unverified"},teams),null,name);
    assert.equal(resolveSourceTeam(src,[...teams,{...teams[i],id:999n}]),null,name);
  }
});
/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
test("other sources respect upcoming SorareInside predictions only while fixture is future",()=> {
  const metadata={probableLineup:{source:"SORAREINSIDE",sourceKickoff:"2026-09-12T12:00:00Z"}};
  assert.equal(hasUpcomingSorareLineup(metadata,new Date("2026-09-11")),true);
  assert.equal(hasUpcomingSorareLineup(metadata,new Date("2026-09-13")),false);
  assert.equal(hasUpcomingSorareLineup({probableLineup:{source:"GAZZETTA"}}),false);
});
