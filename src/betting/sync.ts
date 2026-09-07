/** @spec spec://modules/betting/FEAT-001-virtual-league#runtime */
import { bettingLeagues, bettingLeagueIds } from "./leagues";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fixtureNameScore } from "@/machete/fixture-odds-sync";
import { BOTS, recommend, type ModelInput, type Selection, type HistoryRow } from "./domain";
import { eventSelections, listFeed } from "./provider";
import { dbJson, initializeAccounts, placeBet, settleTicket } from "./service";
import { CUP_LEAGUES, EUROPEAN_LEAGUE_ROUNDS, DOMESTIC_LEAGUES, hasRegulationScore, historicalScore } from "./competition";

// Provider competition identities; cup patterns precede domestic leagues.
export function leagueForSport(name: string): number|null {
  if(/женщ|молод|до \d|итоги|виртуал|кибер|альтернатив|резерв|лучший|кто выше/i.test(name))return null;
  if(/греция.*суперлига\s*2|германия.*бундеслига\s*3|чемпионат мира.*отбор|шотландия.*кубок лиги/i.test(name))return null;
  const rules: [number,RegExp][] = [
    [10216,/лига конференций/i],[74,/суперкубок уефа/i],[42,/лига чемпионов/i],[73,/лига европы/i],
    [77,/чемпионат мира(?!.*клуб)/i],[44,/кубок америки/i],[50,/чемпионат европы|евро\s?20/i],
    [133,/англия.*кубок лиги/i],[132,/англия.*кубок/i],[134,/кубок франции/i],[137,/кубок шотландии/i],
    [139,/суперкубок испании/i],[138,/кубок испании/i],[141,/кубок италии/i],[149,/кубок бельгии/i],
    [186,/кубок португалии/i],[193,/кубок россии/i],[209,/кубок германии/i],[235,/кубок нидерландов|кубок голландии/i],
    [48,/англия.*чемпионшип/i],[108,/англия.*(лига 1|первая лига)/i],[47,/англия.*премьер/i],
    [140,/испания.*(сегунда|второй дивизион)/i],[87,/испания.*(примера|ла лига)/i],
    [146,/германия.*(2-я бундеслига|бундеслига 2|вторая бундеслига)/i],[54,/германия.*бундеслига/i],
    [86,/италия.*серия [bб]/i],[55,/италия.*серия [aа]/i],[110,/франция.*лига 2/i],[53,/франция.*лига 1/i],
    [111,/нидерланды.*(первый дивизион|1-й дивизион|эрстедивизи)/i],[57,/нидерланды.*(премьер|эредивизи|высш)/i],
    [185,/португалия.*(2-я лига|2-й дивизион|лига 2|сегунда)/i],[61,/португалия.*(премьер|примейра|лига португал)/i],
    [63,/россия.*премьер/i],[71,/турция.*суперлиг/i],[40,/бельгия.*(про-лига|премьер|высш|первый дивизион [aа])/i],
    [38,/австрия.*бундеслига/i],[46,/дания.*суперлиг/i],[59,/норвегия.*(элит|суперлига|высш)/i],[64,/шотландия.*премьер/i],
    [67,/швеция.*(аллсвенск|премьер|высш)/i],[69,/швейцария.*суперлиг/i],[135,/греция.*суперлиг/i],
    [196,/польша.*(экстраклас|суперлига)/i],[338,/кипр.*(первый дивизион|1-й дивизион|высш)/i]
  ];
  return rules.find(([,pattern])=>pattern.test(name))?.[0] ?? null;
}

export async function loadModel(matchId: bigint): Promise<ModelInput|null> {
  const target=await prisma.coreMatch.findUnique({where:{id:matchId},select:{homeTeamId:true,awayTeamId:true,leagueId:true,matchDate:true}});
  if(!target?.homeTeamId || !target.awayTeamId || !target.matchDate || !target.leagueId)return null;
  const european=[42n,73n].includes(target.leagueId);
  const since=new Date(target.matchDate.getTime()-730*86400000);
  const history=async(team:bigint):Promise<HistoryRow[]>=>{
    const where:Prisma.CoreMatchWhereInput={finished:true,cancelled:false,matchDate:{lt:target.matchDate!,gte:since},OR:[{homeTeamId:team},{awayTeamId:team}]};
    const fetchRows=async(scope:Prisma.CoreMatchWhereInput,limit:number):Promise<HistoryRow[]>=>{
      const rows=await prisma.coreMatch.findMany({where:{...where,...scope},orderBy:[{matchDate:"desc"},{id:"desc"}],take:limit*2,select:{id:true,leagueId:true,homeTeamId:true,awayTeamId:true,homeScore:true,awayScore:true,matchDate:true,teamStats:{select:{teamId:true,goals:true,xg:true}}}});
      return rows.flatMap(r=>{const score=historicalScore(r);if(!score)return [];const home=r.homeTeamId===team;return [{at:r.matchDate!.toISOString(),competitionId:Number(r.leagueId),home,goals:home?score.home:score.away,conceded:home?score.away:score.home,xg:r.teamStats.find(s=>s.teamId===team)?.xg??null,xga:r.teamStats.find(s=>s.teamId===(home?r.awayTeamId:r.homeTeamId))?.xg??null}];}).slice(0,limit);
    };
    return european ? (await Promise.all([fetchRows({leagueId:{in:DOMESTIC_LEAGUES}},20),fetchRows({leagueId:target.leagueId,round:{in:EUROPEAN_LEAGUE_ROUNDS}},8)])).flat().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)) : fetchRows({},20);
  };
  const [home,away,baseRows]=await Promise.all([history(target.homeTeamId),history(target.awayTeamId),prisma.coreMatch.findMany({where:{leagueId:target.leagueId,finished:true,cancelled:false,matchDate:{lt:target.matchDate,gte:since},homeScore:{not:null},awayScore:{not:null},...(european?{round:{in:EUROPEAN_LEAGUE_ROUNDS}}:{})},orderBy:[{matchDate:"desc"},{id:"desc"}],take:600,select:{homeScore:true,awayScore:true}})]);
  if(baseRows.length<30)return null;
  return {home,away,leagueHome:baseRows.reduce((n,r)=>n+r.homeScore!,0)/baseRows.length,leagueAway:baseRows.reduce((n,r)=>n+r.awayScore!,0)/baseRows.length,kickoff:target.matchDate.toISOString(),...(european?{europeanCompetitionId:Number(target.leagueId)}:{})};
}

/** Refresh on opening a match and immediately before accepting a human ticket. */
export async function refreshEvent(id:string) {
  const current=await prisma.bettingEvent.findUnique({where:{id}});
  if(!current || current.kickoff<=new Date())return;
  const requestedAt=new Date();
  const {feed,selections}=await eventSelections(Number(id));
  const target=current.matchId?await prisma.coreMatch.findUnique({where:{id:current.matchId},select:{round:true}}):null;
  if(!target || !hasRegulationScore(Number(current.leagueId),target.round))for(const s of selections)s.manual=true;
  const root=feed.events.find(e=>String(e.id)===id);
  const model=current.matchId?await loadModel(current.matchId):null;
  // Late network responses must not overwrite a newer quote snapshot.
  await prisma.bettingEvent.updateMany({where:{id,OR:[{fetchedAt:null},{fetchedAt:{lte:requestedAt}}]},data:{markets:dbJson(selections),model:model?dbJson(model):Prisma.DbNull,fetchedAt:requestedAt,updatedAt:new Date(),closed:!root || root.place!=="line" || root.startTime*1000<=Date.now(),...(root ? {kickoff:new Date(root.startTime*1000)}:{})}});
}

async function catalogSync() {
  const [feed,matches]=await Promise.all([listFeed(),prisma.coreMatch.findMany({where:{finished:false,cancelled:false,matchDate:{gt:new Date(),lt:new Date(Date.now()+45*86400000)}},select:{id:true,leagueId:true,matchDate:true,homeTeam:{select:{name:true}},awayTeam:{select:{name:true}}}})]);
  await prisma.coreLeague.createMany({ data: bettingLeagues.map(l => ({ id: BigInt(l.id), name: l.name })), skipDuplicates: true });
  const allowed=new Set(bettingLeagueIds.map(Number)), sports=new Map(feed.sports.map(s=>[s.id,s]));
  const rootEvents=feed.events.filter(e=>e.level===1 && e.kind===1 && e.team1 && e.team2 && e.place==="line" && e.startTime*1000>Date.now() && e.startTime*1000<Date.now()+45*86400000);
  const ids:string[]=[]; const records:{id:string;match_id:string|null;league_id:number;home:string;away:string;kickoff:string}[]=[]; let unmatched=0;
  for(const event of rootEvents) {
    const sport=sports.get(event.sportId); if(!sport || sport.parentId!==1)continue;
    const league=leagueForSport(sport.name); if(!league || !allowed.has(league))continue;
    const candidates=matches.filter(m=>Number(m.leagueId)===league && Math.abs(m.matchDate!.getTime()-event.startTime*1000)<=15*60000)
      .map(m=>({m,score:fixtureNameScore(m,{homeTeamName:event.team1!,awayTeamName:event.team2!})})).filter(c=>c.score>=.60).sort((a,b)=>b.score-a.score);
    const match=candidates.length && (candidates.length===1 || candidates[0].score-candidates[1].score>=.12)?candidates[0].m:null;
    if(!match)unmatched++;
    const id=String(event.id);ids.push(id);
    records.push({id,match_id:match?String(match.id):null,league_id:league,home:event.team1!,away:event.team2!,kickoff:new Date(event.startTime*1000).toISOString()});
  }
  if(records.length)await prisma.$executeRaw`INSERT INTO betting_events(id,match_id,league_id,home,away,kickoff)
    SELECT id,match_id::bigint,league_id,home,away,kickoff::timestamptz FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
    AS r(id text,match_id text,league_id bigint,home text,away text,kickoff text)
    ON CONFLICT(id) DO UPDATE SET match_id=excluded.match_id,home=excluded.home,away=excluded.away,kickoff=excluded.kickoff,closed=false,updated_at=now()`;
  // A successful complete catalogue may close vanished markets, never settle them.
  await prisma.bettingEvent.updateMany({where:{id:{notIn:ids},closed:false},data:{closed:true}});
  return {events:ids.length,unmatched,supportedLeagues:allowed.size};
}

export async function settleFinished() {
  const events=await prisma.bettingBet.findMany({where:{status:"PENDING",OR:[
    {event:{match:{cancelled:true}}},
    {selection:{path:["manual"],equals:false},event:{OR:[{leagueId:{notIn:CUP_LEAGUES.map(BigInt)}},{leagueId:{in:[42n,73n]},match:{round:{in:EUROPEAN_LEAGUE_ROUNDS}}}],match:{finished:true,homeScore:{not:null},awayScore:{not:null}}}}
  ]},distinct:["eventId"],orderBy:{createdAt:"asc"},select:{eventId:true},take:500});
  let settled=0;
  for(const {eventId} of events) {
    const event=await prisma.bettingEvent.findUnique({where:{id:eventId}});if(!event?.matchId)continue;
    const match=await prisma.coreMatch.findUnique({where:{id:event.matchId},select:{finished:true,cancelled:true,homeScore:true,awayScore:true,status:true,matchDate:true,round:true}});
    if(!match || (!match.finished && !match.cancelled))continue;
    const bets=await prisma.bettingBet.findMany({where:{eventId,status:"PENDING"}});
    const cup=!hasRegulationScore(Number(event.leagueId),match.round);
    for(const bet of bets) {
      if(match.cancelled){await settleTicket(bet.id,"VOID",`FotMob ${event.matchId}: cancelled`);settled++;continue;}
      const s=bet.selection as unknown as Selection;
      // Cup FT scores can include extra time; do not infer the 90-minute score.
      if(cup || !s.rule || s.manual || match.homeScore===null || match.awayScore===null || /extra|penalt|aet|доп|пенальти/i.test(match.status??""))continue;
      await settleTicket(bet.id,{home:match.homeScore,away:match.awayScore},`FotMob ${event.matchId}: ${match.homeScore}:${match.awayScore}; status=${match.status}`);settled++;
    }
  }
  return settled;
}

async function botsForEvent(id:string) {
  const event=await prisma.bettingEvent.findUniqueOrThrow({where:{id}});
  if(event.closed || !event.fetchedAt || Date.now()-event.fetchedAt.getTime()>300000 || event.kickoff<=new Date())return;
  const markets=event.markets as unknown as Selection[], model=event.model as unknown as ModelInput|null;
  const evaluated=markets.filter(s=>s.enabled && s.rule).map(s=>({s,recs:recommend(s,model)}));
  for(const bot of BOTS) {
    const accountId=`bot:${bot.name}`;
    if(await prisma.bettingBet.findFirst({where:{accountId,eventId:id},select:{id:true}}))continue;
    const best=evaluated.map(v=>({s:v.s,r:v.recs.find(r=>r.name===bot.name)!})).filter(v=>v.r.decision==="BET").sort((a,b)=>(b.r.ev??0)-(a.r.ev??0))[0];
    let reason=!model?"Нет сопоставленной истории":evaluated.length?"Нет исхода с достаточным EV":"Нет поддержанных рынков";
    if(best) {
      const account=await prisma.bettingAccount.findUniqueOrThrow({where:{id:accountId}});
      const coins=Math.min(1000,Math.floor(Number(account.balance)/100));
      if(coins>0)try{await placeBet({accountId,eventId:id,key:best.s.key,odds:best.s.odds,coins,requestKey:`bot:${id}`,bot:true});continue;}catch(e){reason=e instanceof Error?e.message:"Ошибка ставки";}
      else reason="Баланс исчерпан";
    }
    await prisma.bettingDecision.upsert({where:{accountId_eventId:{accountId,eventId:id}},create:{id:randomUUID(),accountId,eventId:id,decision:"SKIP",reason,details:dbJson(best?.r??{})},update:{decision:"SKIP",reason,details:dbJson(best?.r??{}),decidedAt:new Date()}});
  }
}

export async function runBettingCycle() {
  const owner=randomUUID();
  await prisma.bettingSyncState.upsert({where:{id:"main"},create:{id:"main"},update:{}});
  const lease=await prisma.$executeRaw`UPDATE betting_sync_state SET owner=${owner},lease_until=now()+interval '4 minutes' WHERE id='main' AND (lease_until IS NULL OR lease_until<now())`;
  if(!lease)return {busy:true};
  try {
    await initializeAccounts();
    const summary=await catalogSync();
    const settled=await settleFinished();
    // Oldest quote first prevents starving distant events; robots decide within 24 h.
    const batch=await prisma.bettingEvent.findMany({where:{closed:false,kickoff:{gt:new Date(),lt:new Date(Date.now()+86400000)}},orderBy:[{fetchedAt:{sort:"asc",nulls:"first"}},{kickoff:"asc"}],take:16,select:{id:true}});
    let refreshed=0;const errors:string[]=[];
    for(let i=0;i<batch.length;i+=2) {
      const active=await prisma.bettingSyncState.findFirst({where:{id:"main",owner,leaseUntil:{gt:new Date()}}});if(!active)throw new Error("Аренда синхронизации истекла");
      await prisma.bettingSyncState.updateMany({where:{id:"main",owner},data:{leaseUntil:new Date(Date.now()+240000)}});
      const results=await Promise.allSettled(batch.slice(i,i+2).map(async e=>{await refreshEvent(e.id);await botsForEvent(e.id);}));
      results.forEach(r=>{if(r.status==="fulfilled")refreshed++;else errors.push(String(r.reason).slice(0,200));});
    }
    await prisma.$executeRaw`DELETE FROM betting_events WHERE id IN (SELECT e.id FROM betting_events e WHERE e.kickoff<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM betting_bets b WHERE b.event_id=e.id) AND NOT EXISTS(SELECT 1 FROM betting_decisions d WHERE d.event_id=e.id) LIMIT 100)`;
    await prisma.bettingSyncState.updateMany({where:{id:"main",owner},data:{lastSuccess:new Date(),lastError:errors.length?errors.slice(0,3).join("; "):null,summary:dbJson({...summary,settled,refreshed})}});
    return {...summary,settled,refreshed};
  } catch(e) {
    await prisma.bettingSyncState.updateMany({where:{id:"main",owner},data:{lastError:(e instanceof Error?e.message:String(e)).slice(0,500)}});throw e;
  } finally {await prisma.bettingSyncState.updateMany({where:{id:"main",owner},data:{leaseUntil:null,owner:null}});}
}

type Runtime={started:boolean;timer?:ReturnType<typeof setTimeout>};
const globalState=globalThis as unknown as {bettingLeague?:Runtime};
export function startBettingLeague() {
  if(process.env.BETTING_LEAGUE_ENABLED==="false" || globalState.bettingLeague?.started)return;
  const state:Runtime={started:true};globalState.bettingLeague=state;
  const tick=async()=>{try{await runBettingCycle();}catch(e){console.error("Betting league sync failed",e instanceof Error?e.message:e);}finally{state.timer=setTimeout(()=>void tick(),60000);state.timer.unref?.();}};
  state.timer=setTimeout(()=>void tick(),10000);state.timer.unref?.();
}
