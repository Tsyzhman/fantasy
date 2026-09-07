/** @spec spec://modules/betting/FEAT-001-virtual-league#ledger */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { initializeAccounts,placeBet,settleTicket,dbJson } from "./service";
import { factorRule,type Selection } from "./domain";
import { settleFinished } from "./sync";

test("wallet integration: init, price fixation, concurrent spend, retry and settlement",async()=>{
  assert.match(process.env.DATABASE_URL??"",/\/fantasy_betting_test_/ ,"Run only against the isolated betting test database");
  const suffix=randomUUID(),users=[`bettest-a-${suffix}`,`bettest-b-${suffix}`,`bettest-c-${suffix}`];
  const eventId=`test-${suffix}`;
  const s:Selection={key:"test:921:",eventId:1,factorId:921,parameter:"",label:"Chelsea победит",group:"Матч",odds:2.5,rule:factorRule(921,""),manual:false,enabled:true};
  await prisma.coreLeague.upsert({where:{id:-999n},create:{id:-999n,name:"Betting test"},update:{}});
  for(const id of users)await prisma.user.create({data:{id,email:`${id}@test.invalid`,name:"Test"}});
  await Promise.all([initializeAccounts(),initializeAccounts()]);
  try {
    for(const userId of users){const a=await prisma.bettingAccount.findUniqueOrThrow({where:{userId}});assert.equal(a.balance,10000000n);assert.equal(await prisma.bettingLedger.count({where:{accountId:a.id,kind:"INITIAL"}}),1);}
    await prisma.bettingEvent.create({data:{id:eventId,leagueId:-999n,home:"Chelsea",away:"Arsenal",kickoff:new Date(Date.now()+3600000),fetchedAt:new Date(),markets:dbJson([s])}});
    const a={accountId:`user:${users[0]}`,eventId,key:s.key,odds:2.5,coins:1000,requestKey:randomUUID()};
    await assert.rejects(placeBet(a), /Лига недоступна/);
    assert.equal(await prisma.bettingBet.count({ where: { eventId } }), 0);
    await prisma.coreLeague.upsert({ where: { id: 47n }, create: { id: 47n, name: "Premier League" }, update: {} });
    await prisma.bettingEvent.update({ where: { id: eventId }, data: { leagueId: 47n } });
    const [first,retry]=await Promise.all([placeBet(a),placeBet(a)]);assert.equal(first.id,retry.id);
    await prisma.bettingEvent.update({where:{id:eventId},data:{markets:dbJson([{...s,odds:2.6}])}});
    await assert.rejects(placeBet({...a,requestKey:randomUUID()}),/изменился/);
    const second=await placeBet({...a,accountId:`user:${users[1]}`,odds:2.6,requestKey:randomUUID()});
    assert.equal(first.odds,25000);assert.equal(second.odds,26000);
    await Promise.all([settleTicket(first.id,{home:2,away:0},"test source"),settleTicket(first.id,{home:2,away:0},"test source")]);
    await settleTicket(second.id,{home:2,away:0},"test source");
    assert.equal((await prisma.bettingAccount.findUniqueOrThrow({where:{userId:users[0]}})).balance,10150000n);
    assert.equal((await prisma.bettingAccount.findUniqueOrThrow({where:{userId:users[1]}})).balance,10160000n);
    assert.equal(await prisma.bettingLedger.count({where:{betId:first.id}}),2);
    const c={...a,accountId:`user:${users[2]}`,odds:2.6,coins:60000};
    const concurrent=await Promise.allSettled([placeBet({...c,requestKey:randomUUID()}),placeBet({...c,requestKey:randomUUID()})]);
    assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
    assert.equal((await prisma.bettingAccount.findUniqueOrThrow({where:{userId:users[2]}})).balance,4000000n);
    await prisma.bettingEvent.update({where:{id:eventId},data:{fetchedAt:new Date(Date.now()-310000)}});
    await assert.rejects(placeBet({...a,odds:2.6,requestKey:randomUUID()}),/устарела/);
    await prisma.bettingEvent.update({where:{id:eventId},data:{fetchedAt:new Date(),kickoff:new Date(Date.now()-1000)}});
    await assert.rejects(placeBet({...a,odds:2.6,requestKey:randomUUID()}),/закрыт/);
    assert.equal((await placeBet(a)).id,first.id,"Retry of accepted price remains valid after line changes and kickoff");
    await assert.rejects(placeBet({...a,coins:2000}),/другой ставки/);
    const mismatches=await prisma.$queryRaw<{id:string}[]>`SELECT a.id FROM betting_accounts a LEFT JOIN betting_ledger l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(sum(l.delta),0)`;
    assert.equal(mismatches.length,0);
    const matchId=-BigInt(Date.now());
    await prisma.coreMatch.create({data:{id:matchId,leagueId:-999n,finished:true,homeScore:2,awayScore:0,matchDate:new Date(Date.now()-7200000)}});
    await prisma.bettingEvent.update({where:{id:eventId},data:{matchId}});
    assert.equal(await settleFinished(),1,"Worker settles the remaining ticket from the final source score");
    assert.equal(await settleFinished(),0,"Repeated worker cycle is idempotent");
    assert.equal((await prisma.bettingAccount.findUniqueOrThrow({where:{userId:users[2]}})).balance,19600000n);
    await prisma.bettingEvent.update({where:{id:eventId},data:{matchId:null}});
    await prisma.coreMatch.delete({where:{id:matchId}});
  } finally {
    const accountIds=users.map(id=>`user:${id}`);
    await prisma.bettingLedger.deleteMany({where:{accountId:{in:accountIds}}});
    await prisma.bettingDecision.deleteMany({where:{accountId:{in:accountIds}}});
    await prisma.bettingBet.deleteMany({where:{accountId:{in:accountIds}}});
    await prisma.bettingEvent.deleteMany({where:{id:eventId}});
    await prisma.bettingAccount.deleteMany({where:{id:{in:accountIds}}});
    await prisma.user.deleteMany({where:{id:{in:users}}});
    await prisma.coreLeague.deleteMany({where:{id:-999n}});
    await prisma.$disconnect();
  }
});
