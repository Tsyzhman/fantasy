/** @spec spec://modules/betting/FEAT-001-virtual-league#errors */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboard,eventDetail,placeBet,skipEvent,manualSettlement,adminPending,BettingError,jsonValue,initializeAccounts } from "@/betting/service";
import { refreshEvent } from "@/betting/sync";
export const dynamic="force-dynamic";
const reply=(v:unknown,status=200)=>NextResponse.json(jsonValue(v),{status,headers:{"Cache-Control":"private, no-store"}});
const validId=(v:unknown):v is string=>typeof v==="string" && /^\d{1,16}$/.test(v);
async function handle(action:()=>Promise<Response>) {try{return await action();}catch(e){if(e instanceof BettingError)return reply({error:e.message},e.status);console.error("Betting API",e instanceof Error?e.message:e);return reply({error:"Не удалось обновить лигу. Попробуйте ещё раз"},503);}}
export async function GET(request:Request){return handle(async()=>{
  const auth=await requireApiUser(request);if(auth.response)return auth.response;
  const q=new URL(request.url).searchParams;
  if(q.get("admin")==="pending") {if(auth.user.role!=="ADMIN")return reply({error:"Только для администратора"},403);return reply(await adminPending());}
  const event=q.get("event");
  if(event) {
    if(!validId(event))return reply({error:"Некорректное событие"},400);
    const current=await prisma.bettingEvent.findUnique({where:{id:event},select:{fetchedAt:true}});
    let warning:string|null=null;
    if(!current?.fetchedAt || Date.now()-current.fetchedAt.getTime()>60000)try{await refreshEvent(event);}catch{warning="Фонбет не ответил. Показана последняя сохранённая линия";}
    return reply({...await eventDetail(event),warning});
  }
  const league=q.get("league"),offset=Number(q.get("offset")??0);
  if((league && !validId(league)) || !Number.isSafeInteger(offset) || offset<0 || offset>10000)return reply({error:"Некорректный фильтр"},400);
  return reply(await dashboard(auth.user.id,league,(q.get("search")??"").slice(0,80),offset));
});}
export async function POST(request:Request){return handle(async()=>{
  const auth=await requireApiUser(request);if(auth.response)return auth.response;
  const origin=request.headers.get("origin");
  let originHost="";try{originHost=origin?new URL(origin).host:"";}catch{/* Invalid origins are forbidden. */}
  if(!originHost || originHost!==(request.headers.get("host")??new URL(request.url).host))return reply({error:"Недопустимый источник запроса"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"Нужен JSON"},415);
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096)return reply({error:"Запрос слишком большой"},413);chunks.push(value);}}finally{await reader.cancel();}
  const text=Buffer.concat(chunks).toString("utf8");
  let b:Record<string,unknown>;try{b=JSON.parse(text);if(!b || Array.isArray(b) || typeof b!=="object")throw new Error();}catch{return reply({error:"Некорректный JSON"},400);}
  if(!validId(b.eventId))return reply({error:"Некорректное событие"},400);
  await initializeAccounts();
  if(b.action==="skip")return reply(await skipEvent(auth.user.id,b.eventId));
  if(typeof b.key!=="string" || b.key.length>160)return reply({error:"Не выбран исход"},400);
  if(b.action==="settle") {
    if(auth.user.role!=="ADMIN")return reply({error:"Только для администратора"},403);
    if(!["WON","LOST","VOID","HALF_WON","HALF_LOST"].includes(String(b.result)) || typeof b.source!=="string" || b.source.trim().length<15 || b.source.length>1000)return reply({error:"Укажите результат, источник и причину расчёта"},400);
    return reply(await manualSettlement(b.eventId,b.key,b.result as "WON"|"LOST"|"VOID"|"HALF_WON"|"HALF_LOST",b.source,auth.user.id));
  }
  if(b.action!=="bet" || typeof b.requestKey!=="string" || !/^[a-zA-Z0-9-]{16,80}$/.test(b.requestKey) || typeof b.coins!=="number" || typeof b.odds!=="number")return reply({error:"Некорректная ставка"},400);
  const existing=await prisma.bettingBet.findUnique({where:{accountId_requestKey:{accountId:`user:${auth.user.id}`,requestKey:b.requestKey}}});
  if(!existing)await refreshEvent(b.eventId);
  return reply(await placeBet({accountId:`user:${auth.user.id}`,eventId:b.eventId,key:b.key,odds:b.odds,coins:b.coins,requestKey:b.requestKey}));
});}
