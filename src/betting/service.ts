/** @spec spec://modules/betting/FEAT-001-virtual-league#ledger */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BOTS, recommend, payoutMultiplier, type ModelInput, type Recommendation, type Selection } from "./domain";

export class BettingError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const jsonValue = (v: unknown) => JSON.parse(JSON.stringify(v, (_k,x) => typeof x === "bigint" ? Number(x) : x));
export const dbJson = (v: unknown) => jsonValue(v) as Prisma.InputJsonValue;

export async function initializeAccounts(db: PrismaClient = prisma) {
  await db.$transaction(async tx => {
    await tx.$executeRaw`WITH inserted AS (
      INSERT INTO betting_accounts(id,user_id,name)
      SELECT 'user:'||id,id,COALESCE(NULLIF(name,''),'Участник '||right(id,5)) FROM "User" WHERE "isActive"=true
      ON CONFLICT(user_id) DO NOTHING RETURNING id)
      INSERT INTO betting_ledger(id,account_id,delta,kind) SELECT 'initial:'||id,id,10000000,'INITIAL' FROM inserted`;
    for (const bot of BOTS) await tx.$executeRaw`WITH inserted AS (
      INSERT INTO betting_accounts(id,bot_name,name) VALUES(${`bot:${bot.name}`},${bot.name},${bot.name})
      ON CONFLICT(bot_name) DO NOTHING RETURNING id)
      INSERT INTO betting_ledger(id,account_id,delta,kind) SELECT 'initial:'||id,id,10000000,'INITIAL' FROM inserted`;
  });
}

export async function dashboard(userId: string, league: string | null, search: string, offset: number) {
  await initializeAccounts();
  const where: Prisma.BettingEventWhereInput = { kickoff: { gt: new Date() }, closed: false,
    ...(league ? { leagueId: BigInt(league) } : {}), ...(search ? { OR:[{home:{contains:search,mode:"insensitive"}},{away:{contains:search,mode:"insensitive"}}] } : {}) };
  const [account, events, total, leagues, standings, history, decisions, sync] = await Promise.all([
    prisma.bettingAccount.findUniqueOrThrow({where:{userId}}),
    prisma.bettingEvent.findMany({where,orderBy:[{kickoff:"asc"},{id:"asc"}],take:30,skip:offset, select:{id:true,leagueId:true,home:true,away:true,kickoff:true,fetchedAt:true,matchId:true}}),
    prisma.bettingEvent.count({where}),
    prisma.$queryRaw<{id:bigint;name:string;events:bigint}[]>`SELECT l.id,l.name,count(e.id) AS events FROM leagues l LEFT JOIN betting_events e ON e.league_id=l.id AND e.kickoff>now() AND NOT e.closed GROUP BY l.id,l.name ORDER BY l.name`,
    prisma.$queryRaw`SELECT a.id,a.name,a.bot_name,a.balance,
      COALESCE(sum(b.stake) FILTER(WHERE b.status='PENDING'),0)::bigint AS locked,
      COALESCE(sum(b.stake) FILTER(WHERE b.status NOT IN ('PENDING','VOID')),0)::bigint AS turnover,
      COALESCE(sum(b.payout-b.stake) FILTER(WHERE b.status NOT IN ('PENDING','VOID')),0)::bigint AS profit,
      count(b.id)::int AS bets, count(b.id) FILTER(WHERE b.status='WON')::int AS wins
      FROM betting_accounts a LEFT JOIN betting_bets b ON b.account_id=a.id
      LEFT JOIN "User" u ON u.id=a.user_id WHERE a.bot_name IS NOT NULL OR u."isActive"=true
      GROUP BY a.id ORDER BY a.balance+COALESCE(sum(b.stake) FILTER(WHERE b.status='PENDING'),0) DESC,a.created_at LIMIT 200`,
    prisma.$queryRaw`SELECT b.*,e.home,e.away,e.kickoff FROM betting_bets b JOIN betting_events e ON e.id=b.event_id WHERE b.account_id=${`user:${userId}`} ORDER BY b.created_at DESC LIMIT 100`,
    prisma.$queryRaw`SELECT d.*,a.name,e.home,e.away FROM betting_decisions d JOIN betting_accounts a ON a.id=d.account_id JOIN betting_events e ON e.id=d.event_id WHERE a.bot_name IS NOT NULL OR a.user_id=${userId} ORDER BY d.decided_at DESC LIMIT 50`,
    prisma.bettingSyncState.findUnique({where:{id:"main"}})
  ]);
  return jsonValue({account,events,total,leagues,standings,history,decisions,sync,bots:BOTS,now:new Date()});
}

export async function eventDetail(id: string) {
  const event = await prisma.bettingEvent.findUnique({where:{id}});
  if(!event) throw new BettingError("Событие не найдено",404);
  return jsonValue({...event, markets:(event.markets as unknown as Selection[]).map(s => ({...s,recommendations:recommend(s,event.model as unknown as ModelInput|null)}))});
}

type PlaceInput = { accountId: string; eventId: string; key: string; odds: number; coins: number; requestKey: string; bot?: boolean };
export async function placeBet(input: PlaceInput, db: PrismaClient = prisma) {
  if(!Number.isSafeInteger(input.coins) || input.coins<1 || input.coins>100000 || !Number.isFinite(input.odds) || input.odds<=1 || input.odds>1000) throw new BettingError("Неверная сумма или коэффициент",400);
  const stake=BigInt(input.coins)*100n;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM betting_accounts WHERE id=${input.accountId} FOR UPDATE`;
    const duplicate = await tx.bettingBet.findUnique({where:{accountId_requestKey:{accountId:input.accountId,requestKey:input.requestKey}}});
    if(duplicate) {
      if(duplicate.eventId!==input.eventId || duplicate.selectionKey!==input.key || duplicate.stake!==stake || duplicate.odds!==Math.round(input.odds*10000)) throw new BettingError("Ключ запроса уже использован для другой ставки");
      return duplicate;
    }
    const account=await tx.bettingAccount.findUnique({where:{id:input.accountId}});
    if(!account)throw new BettingError("Счёт не найден",404);
    if(account.balance<stake)throw new BettingError("Недостаточно монет");
    // Share-lock quote while committing the ticket; sync uses the same event row.
    await tx.$queryRaw`SELECT id FROM betting_events WHERE id=${input.eventId} FOR SHARE`;
    const event=await tx.bettingEvent.findUnique({where:{id:input.eventId}});
    const now=new Date();
    if(!event || event.closed || event.kickoff<=now)throw new BettingError("Приём ставок на событие закрыт");
    if(!event.fetchedAt || now.getTime()-event.fetchedAt.getTime()>300000)throw new BettingError("Линия устарела. Дождитесь обновления");
    if(event.matchId) {
      const match=await tx.coreMatch.findUnique({where:{id:event.matchId},select:{started:true,finished:true,cancelled:true,matchDate:true}});
      if(!match || match.started || match.finished || match.cancelled || (match.matchDate && match.matchDate<=now))throw new BettingError("Матч уже начался или снят");
    }
    const selection=(event.markets as unknown as Selection[]).find(s=>s.key===input.key);
    if(!selection?.enabled)throw new BettingError("Этот исход сейчас недоступен");
    const odds=Math.round(selection.odds*10000);
    if(odds!==Math.round(input.odds*10000))throw new BettingError(`Коэффициент изменился: ${selection.odds}. Обновите купон и подтвердите новую цену`);
    const recommendations=recommend(selection,event.model as unknown as ModelInput|null);
    if(input.bot) {
      if(!account.botName || !recommendations.some(r=>r.name===account.botName && r.decision==="BET"))throw new BettingError("Алгоритм пропускает исход");
      if(stake>100000n)throw new BettingError("Лимит ставки алгоритма — 1 000 монет");
      const locked=await tx.bettingBet.aggregate({where:{accountId:account.id,status:"PENDING"},_sum:{stake:true}});
      if((locked._sum.stake??0n)+stake>1000000n)throw new BettingError("Лимит открытого риска — 10 000 монет");
      if(await tx.bettingBet.findFirst({where:{accountId:account.id,eventId:event.id}}))throw new BettingError("Алгоритм уже поставил на этот матч");
    } else if(account.botName)throw new BettingError("Счёт алгоритма недоступен",403);
    const bet=await tx.bettingBet.create({data:{id:randomUUID(),accountId:account.id,eventId:event.id,requestKey:input.requestKey,selectionKey:selection.key,selection:dbJson(selection),odds,stake,recommendations:dbJson(recommendations)}});
    await tx.bettingAccount.update({where:{id:account.id},data:{balance:{decrement:stake}}});
    await tx.bettingLedger.create({data:{id:`stake:${bet.id}`,accountId:account.id,betId:bet.id,delta:-stake,kind:"STAKE"}});
    await tx.bettingDecision.upsert({where:{accountId_eventId:{accountId:account.id,eventId:event.id}},create:{id:randomUUID(),accountId:account.id,eventId:event.id,decision:"BET",reason:selection.label,details:dbJson(recommendations)},update:{decision:"BET",reason:selection.label,details:dbJson(recommendations),decidedAt:now}});
    return bet;
  },{timeout:15000});
}

/** @spec spec://modules/betting/FEAT-001-virtual-league#settlement */
export async function settleTicket(id: string, result: { home: number; away: number } | "WON" | "LOST" | "VOID" | "HALF_WON" | "HALF_LOST", source: string, actor="SYSTEM", db: PrismaClient=prisma) {
  return db.$transaction(async tx=>{
    const initial=await tx.bettingBet.findUniqueOrThrow({where:{id}});
    await tx.$queryRaw`SELECT id FROM betting_accounts WHERE id=${initial.accountId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM betting_bets WHERE id=${id} FOR UPDATE`;
    const bet=await tx.bettingBet.findUniqueOrThrow({where:{id}});
    if(bet.status!=="PENDING")return bet;
    const selection=bet.selection as unknown as Selection;
    const odds=bet.odds/10000;
    let multiplier: number;
    if(typeof result==="object") {
      if(!selection.rule || selection.manual)throw new BettingError("Требуется ручной расчёт");
      multiplier=payoutMultiplier(selection.rule,result.home,result.away,odds);
    } else multiplier=result==="WON" ? odds : result==="VOID" ? 1 : result==="HALF_WON" ? (odds+1)/2 : result==="HALF_LOST" ? .5 : 0;
    const payout=(bet.stake*BigInt(Math.round(multiplier*20000))+10000n)/20000n;
    const status=multiplier===0 ? "LOST" : multiplier===1 ? "VOID" : multiplier===odds ? "WON" : multiplier>1 ? "HALF_WON" : "HALF_LOST";
    await tx.bettingAccount.update({where:{id:bet.accountId},data:{balance:{increment:payout}}});
    await tx.bettingLedger.create({data:{id:`settle:${bet.id}`,accountId:bet.accountId,betId:bet.id,delta:payout,kind:status}});
    return tx.bettingBet.update({where:{id},data:{payout,status,settledAt:new Date(),settlementSource:source,settledBy:actor}});
  });
}
export async function skipEvent(userId: string,eventId:string) {
  const event=await prisma.bettingEvent.findUnique({where:{id:eventId}});
  if(!event || event.kickoff<=new Date())throw new BettingError("Событие закрыто");
  const accountId=`user:${userId}`;
  if(await prisma.bettingBet.findFirst({where:{accountId,eventId}}))throw new BettingError("На этот матч уже есть ставка");
  return prisma.bettingDecision.upsert({where:{accountId_eventId:{accountId,eventId}},create:{id:randomUUID(),accountId,eventId,decision:"SKIP",reason:"Решение пользователя"},update:{decision:"SKIP",reason:"Решение пользователя",decidedAt:new Date()}});
}
export async function manualSettlement(eventId:string,key:string,result:"WON"|"LOST"|"VOID"|"HALF_WON"|"HALF_LOST",source:string,actor:string) {
  const event=await prisma.bettingEvent.findUnique({where:{id:eventId}});
  if(!event || event.kickoff>new Date())throw new BettingError("Нельзя рассчитать будущее событие");
  const pending=await prisma.bettingBet.findMany({where:{eventId,selectionKey:key,status:"PENDING"},select:{id:true}});
  for(const bet of pending)await settleTicket(bet.id,result,source,actor);
  return {settled:pending.length};
}
export async function adminPending() {
  return jsonValue(await prisma.$queryRaw`SELECT b.event_id,b.selection_key,min(b.selection::text)::jsonb AS selection,e.home,e.away,e.kickoff,count(*)::int AS tickets FROM betting_bets b JOIN betting_events e ON e.id=b.event_id WHERE b.status='PENDING' AND e.kickoff<now() GROUP BY b.event_id,b.selection_key,e.home,e.away,e.kickoff ORDER BY e.kickoff LIMIT 100`);
}
export type { Recommendation };
