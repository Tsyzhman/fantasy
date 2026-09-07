"use client";
/** @spec spec://modules/betting/FEAT-001-virtual-league#ui */
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { ArrowUpRight,Check,Coins,RefreshCw,Search,SkipForward,Trophy,X } from "lucide-react";
import { BOTS,type Recommendation,type Selection,type ModelInput } from "@/betting/domain";
import { matchAdvice } from "@/betting/match-advice";
import { currentOpportunity, matchOpportunities, quoteUnavailable, type OpportunitySummary, type EventSort } from "@/betting/opportunities";
import styles from "./ui.module.css";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
type Event={id:string;leagueId:number;home:string;away:string;kickoff:string;fetchedAt:string|null;matchId:number|null;closed?:boolean;opportunity?:OpportunitySummary|null};
type Market=Selection & {recommendations:Recommendation[]};
type Detail=Event & {markets:Market[];model?:ModelInput|null;warning?:string|null};
type Standing={id:string;name:string;bot_name:string|null;balance:number;locked:number;turnover:number;profit:number;bets:number;wins:number};
type Ticket={id:string;event_id:string;home:string;away:string;selection:Selection;odds:number;stake:number;payout:number;status:string;created_at:string;settlement_source:string|null};
type Decision={id:string;name:string;home:string;away:string;decision:string;reason:string;decided_at:string};
type Dashboard={account:{id:string;balance:number};events:Event[];total:number;leagues:{id:number;name:string;events:number}[];standings:Standing[];history:Ticket[];decisions:Decision[];sync:{lastSuccess:string|null;lastError:string|null;summary?:{events:number;unmatched:number}}|null};
const money=(cents:number)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(cents/100);
const date=(v:string)=>new Date(v).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const pct=(v:number)=>`${v>0?"+":""}${(v*100).toFixed(1)}%`;
const statuses:Record<string,string>={PENDING:"В игре",WON:"Выигрыш",LOST:"Проигрыш",VOID:"Возврат",HALF_WON:"½ выигрыша",HALF_LOST:"½ проигрыша"};
async function api<T>(path="",body?:unknown,signal?:AbortSignal):Promise<T>{const r=await fetch(`/api/betting${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store",signal});const d=await r.json();if(!r.ok)throw new Error(typeof d.error==="string"?d.error:d.error?.message??"Ошибка соединения");return d;}

export function BettingLeague() {
  const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [tab,setTab]=useState("line"),[league,setLeague]=useState(""),[search,setSearch]=useState(""),[offset,setOffset]=useState(0);
  const [sort,setSort]=useState<EventSort>("value");
  const [selected,setSelected]=useState<Detail|null>(null),[loadingEvent,setLoadingEvent]=useState(false),[marketSearch,setMarketSearch]=useState("");
  const [slip,setSlip]=useState<{event:Detail;market:Market;requestKey:string}|null>(null),[coins,setCoins]=useState("1000"),[busy,setBusy]=useState(false);
  const eventAbort=useRef<AbortController|null>(null),dashboardAbort=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{dashboardAbort.current?.abort();const c=new AbortController();dashboardAbort.current=c;try{const d=await api<Dashboard>(`?league=${league}&search=${encodeURIComponent(search)}&offset=${offset}&sort=${sort}`,undefined,c.signal);if(!c.signal.aborted)setData(d);}catch(e){if(!c.signal.aborted)setError((e as Error).message);}},[league,search,offset,sort]);
  const loadRef=useRef(load);
  useEffect(()=>{loadRef.current=load;},[load]);
  useEffect(()=>{const t=setTimeout(()=>void load(),250);const interval=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>{clearTimeout(t);clearInterval(interval);dashboardAbort.current?.abort();};},[load]);
  useEffect(()=>()=>eventAbort.current?.abort(),[]);
  useEffect(()=>{
    if(!slip)return;
    const before=document.activeElement as HTMLElement|null;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape" && !busy){setSlip(null);}
      if(e.key!=="Tab")return;
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]),[role="dialog"] input,[role="dialog"] select,[role="dialog"] textarea'));
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",key);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",key);before?.focus();};
  },[Boolean(slip),busy]);
  async function openEvent(id:string){eventAbort.current?.abort();const c=new AbortController();eventAbort.current=c;setLoadingEvent(true);setSelected(null);setMarketSearch("");setError("");try{const d=await api<Detail>(`?event=${id}`,undefined,c.signal);if(!c.signal.aborted){setSelected(d);void loadRef.current();}}catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{if(!c.signal.aborted)setLoadingEvent(false);}}
  async function post(body:unknown){setBusy(true);setError("");setNotice("");try{const r=await api("",body);await load();return r;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
  async function submit(){if(!slip)return;try{await post({action:"bet",eventId:slip.event.id,key:slip.market.key,odds:slip.market.odds,coins:Number(coins),requestKey:slip.requestKey});setNotice(`Ставка принята по ${slip.market.odds.toFixed(2)}. Коэффициент зафиксирован.`);setSlip(null);}catch{/* Preserve idempotency key and offered quote for network retries. */}}
  const [adviceTime,setAdviceTime]=useState(0);
  useEffect(()=>{
    if((!selected && !data) || tab!=="line")return;
    let timer:ReturnType<typeof setTimeout>;
    const update=()=>{
      const now=Date.now();setAdviceTime(now);
      const deadlines=[...(data?.events??[]),...(selected?[selected]:[])].flatMap(e=>[Date.parse(e.kickoff),Date.parse(e.fetchedAt??"")+300001]).filter(t=>Number.isFinite(t)&&t>now);
      if(deadlines.length)timer=setTimeout(update,Math.min(300001,Math.max(1,Math.min(...deadlines)-now)));
    };
    timer=setTimeout(update,0);
    return()=>clearTimeout(timer);
  },[selected,data,tab]);
  const opportunities=useMemo(()=>selected?matchOpportunities(selected,adviceTime):[],[selected,adviceTime]);
  const opportunityKeys=useMemo(()=>new Set(opportunities.map(o=>o.market.key)),[opportunities]);
  const me=data?.standings.find(r=>r.id===data.account.id);
  const groups=new Map<string,Market[]>();
  for(const m of selected?.markets??[])if(!marketSearch || `${m.group} ${m.label}`.toLowerCase().includes(marketSearch.toLowerCase()))groups.set(m.group,[...(groups.get(m.group)??[]),m]);
  return <main className={styles.arena}>
    <div className={styles.hero}><div><span className={styles.eyebrow}>FANTASY / PAPER LEAGUE</span><h1>Арена<span>Человек. Алгоритм. Игра.</span></h1><p>Реальная линия Фонбета. Виртуальные монеты. Одинаковый старт для всех.</p></div><div className={styles.heroIcon}><Trophy size={52}/><span>СЕЗОН 01</span></div></div>
    <div className={styles.metrics}>
      <div><span><Coins size={15}/> Доступно</span><strong>{data?money(data.account.balance):"—"}<small> монет</small></strong></div>
      <div><span>В открытых ставках</span><strong>{me?money(me.locked):"—"}</strong></div>
      <div><span>Капитал</span><strong>{me?money(me.balance+me.locked):"100 000"}</strong></div>
      <div><span>ROI · рассчитанные ставки</span><strong className={me && me.profit>0?styles.positive:""}>{me?.turnover?pct(me.profit/me.turnover):"—"}</strong></div>
    </div>
    <div className={styles.tabbar}><nav aria-label="Разделы арены">{[["line","Линия"],["rank","Таблица лиги"],["history","Мои ставки"],["bots","Алгоритмы"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} aria-current={tab===id?"page":undefined}>{label}</button>)}</nav><button aria-label="Обновить лигу" onClick={()=>void load()}><RefreshCw size={16}/></button></div>
    {error&&<div className={styles.error} role="alert">{error}<button onClick={()=>setError("")} aria-label="Закрыть ошибку"><X size={16}/></button></div>}
    {notice&&<div className={styles.notice} role="status"><Check size={17}/>{notice}</div>}
    {!data&&<p role="status">Загружаем арену…</p>}
    {tab==="line"&&<>
      <div className={styles.filters}><label>Турнир<select value={league} onChange={e=>{setLeague(e.target.value);setOffset(0);}}><option value="">Все лиги</option>{data?.leagues.map(l=><option key={l.id} value={l.id}>{l.name} · {l.events}</option>)}</select></label><label><span><Search size={14}/> Найти команду</span><input value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="Челси, Рубин…"/></label><div className={styles.feedStatus}>{data?.total??0} событий<br/><small>{data?.sync?.lastSuccess?`Обновлено ${date(data.sync.lastSuccess)}`:"Ожидаем первую синхронизацию"}</small></div></div>
      {data?.sync?.lastError&&<p className={styles.warning}>Обновление линии: {data.sync.lastError}</p>}
      <div className={styles.opportunityControls}><label><I18nText en="Event order" ru="Порядок событий"/><select value={sort} onChange={e=>{setSort(e.target.value as EventSort);setOffset(0);}}><LocalizedOption value="value" en="Highest EV first" ru="Сначала высокий EV"/><LocalizedOption value="time" en="Kickoff time" ru="По времени начала"/></select></label><p><I18nText en="Highlights pass at least one algorithm’s threshold. EV is a model estimate." ru="Подсвечены исходы, прошедшие порог хотя бы одного алгоритма. EV — оценка модели."/></p></div>
      <div className={styles.lineGrid}><section className={styles.events} aria-label="События">
        {data?.events.map(e=>{const opportunity=currentOpportunity(e,adviceTime);return <button key={e.id} className={`${styles.event} ${opportunity?.count?styles.eventOpportunity:""} ${selected?.id===e.id?styles.selected:""}`} onClick={()=>void openEvent(e.id)}><span>{data.leagues.find(l=>l.id===e.leagueId)?.name}<time>{date(e.kickoff)}</time></span><strong>{e.home}<small> — </small>{e.away}</strong>{opportunity?.count?<span className={styles.opportunityBadge}><I18nText en="Qualifying outcomes:" ru="Подходящих исходов:"/> {opportunity.count}<b><I18nText en="EV up to" ru="EV до"/> {pct(opportunity.bestEv!)}</b></span>:<small>{opportunity?"Нет исходов выше порога":"Нет актуальной оценки"}</small>}<span>{e.matchId?"Статистика подключена":"Без сопоставленной статистики"}<ArrowUpRight size={17}/></span></button>;})}
        {data?.events.length===0&&<div className={styles.empty}>Сейчас в этом фильтре нет событий Фонбета. Попробуйте другую лигу или дождитесь обновления линии.</div>}
        {data && data.total>30&&<div className={styles.pagination}><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-30))}>← Назад</button><span>{offset+1}–{Math.min(offset+30,data.total)}</span><button disabled={offset+30>=data.total} onClick={()=>setOffset(offset+30)}>Далее →</button></div>}
      </section><section className={styles.marketPanel} aria-label="Роспись матча">
        {loadingEvent?<div className={styles.empty}>Загружаем полную роспись…</div>:selected?<>
          <div className={styles.matchTitle}><span>{date(selected.kickoff)}</span><h2>{selected.home} — {selected.away}</h2><p>{selected.markets.length} исходов · {selected.fetchedAt?`котировки ${date(selected.fetchedAt)}`:"нет свежей линии"}</p><div><button onClick={()=>void openEvent(selected.id)}><RefreshCw size={14}/>Обновить</button><button disabled={busy} onClick={()=>void post({action:"skip",eventId:selected.id}).then(()=>setNotice("Матч пропущен. Монеты остаются на балансе.")).catch(()=>{})}><SkipForward size={14}/>Пропустить матч</button></div></div>
          {selected.warning&&<p className={styles.warning}>{selected.warning}</p>}
          <section className={styles.opportunities} aria-label="Подходящие исходы матча">
            <h3><I18nText en="Qualifying outcomes" ru="Подходящие исходы"/> · {opportunities.length}</h3>
            <p><I18nText en="Sorted by highest EV. Outcomes within one match may be correlated; their edges do not add up." ru="Отсортированы по лучшему EV. Исходы одного матча могут быть связаны — их преимущество не складывается."/></p>
            {opportunities.length?<div className={styles.opportunityList}>{opportunities.map(o=><button key={o.market.key} className={styles.opportunity} onClick={()=>{setSlip({event:selected,market:o.market,requestKey:crypto.randomUUID()});setError("");}}>
              <span><strong>{o.market.label}</strong><small>{o.market.group}</small><small>{o.supporters.map(r=>`${r.name}: EV ${pct(r.ev!)}`).join(" · ")}</small></span>
              <span><b>{o.market.odds.toFixed(2)}</b><em><I18nText en="EV up to" ru="EV до"/> {pct(o.bestEv)}</em><small><I18nText en="Open bet slip" ru="Открыть купон"/></small></span>
            </button>)}</div>:<p>{quoteUnavailable(selected,adviceTime)??"Алгоритмы не нашли доступных исходов выше своих порогов."}</p>}
          </section>
          <section className={styles.matchAdvice} aria-label="Советы алгоритмов на выбранный матч">
            <h3>Что думают алгоритмы об этом матче</h3>
            {selected.model?.europeanCompetitionId&&<p className={styles.hint}>История чемпионатов и прошлых матчей {selected.model.europeanCompetitionId===42?"ЛЧ":"ЛЕ"}, только до этой игры. {([[selected.home,selected.model.home],[selected.away,selected.model.away]] as const).map(([name,rows])=>`${name}: ${rows.filter(r=>r.competitionId!==selected.model!.europeanCompetitionId).length} в чемпионатах + ${rows.filter(r=>r.competitionId===selected.model!.europeanCompetitionId).length} в еврокубке`).join("; ")}. Длинные модели используют до 12 + 8 игр, короткая — до 5 + 3.</p>}
            <div>{matchAdvice(selected, adviceTime).map((tip,i)=><article key={tip.name}>
              <header><span className={styles.avatar} data-color={i}>{tip.name[0]}</span><h4>{tip.name}</h4></header>
              {tip.market && tip.recommendation ? <>
                <strong>{tip.market.label}</strong>
                <p>Коэффициент {tip.market.odds.toFixed(2)} · EV {pct(tip.recommendation.ev!)}</p>
                <small>{tip.reason}</small>
                <button onClick={()=>{setSlip({event:selected,market:tip.market!,requestKey:crypto.randomUUID()});setError("");}}>Открыть купон · {tip.name}</button>
              </> : <><strong>Сюда лучше не ставить</strong><small>{tip.reason}</small></>}
            </article>)}</div>
          </section>
          <input className={styles.marketSearch} aria-label="Поиск рынка" placeholder="Найти рынок: тотал, угловые, тайм…" value={marketSearch} onChange={e=>setMarketSearch(e.target.value)}/>
          <p className={styles.hint}>«Ручной расчёт» — результат подтверждает администратор по источнику. Модели оценивают основные рынки матча.</p>
          {Array.from(groups).map(([name,markets],i)=><details key={name} className={styles.marketGroup} open={i<2 || Boolean(marketSearch)}><summary>{name}<span>{markets.length}</span></summary><div>{markets.map(m=><button key={m.key} disabled={!m.enabled || selected.closed || Date.parse(selected.kickoff)<=Date.now()} onClick={()=>{setSlip({event:selected,market:m,requestKey:crypto.randomUUID()});setError("");}} className={`${styles.market} ${opportunityKeys.has(m.key)?styles.marketOpportunity:""}`}><span>{m.label}<small>{!m.enabled?"Приём недоступен":m.manual?"Ручной расчёт":opportunityKeys.has(m.key)?"Есть рекомендация":"Автоматический расчёт"}</small></span><strong>{m.odds.toFixed(2)}</strong></button>)}</div></details>)}
          {!selected.markets.length&&<div className={styles.empty}>Роспись недоступна у источника. Ставки закрыты до обновления.</div>}
        </>:<div className={styles.empty}><ArrowUpRight size={32}/><h2>Выберите матч</h2><p>Откройте роспись и сравните своё решение с пятью алгоритмами.</p><small>Вы можете пропустить любое событие.</small></div>}
      </section></div>
    </>}
    {tab==="rank"&&<section className={styles.panel}><h2>Одна лига. Равные условия.</h2><p>Старт — 100 000 монет. Место определяется капиталом: свободные монеты + сумма открытых ставок. Незавершённый риск не считается прибылью.</p><div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Участник</th><th>Капитал</th><th>В игре</th><th>Ставки</th><th>Прибыль</th><th>ROI</th></tr></thead><tbody>{data?.standings.map((r,i)=><tr key={r.id} className={r.id===data.account.id?styles.self:""}><td>{i+1}</td><td><b>{r.name}</b><small>{r.bot_name?"Алгоритм":r.id===data.account.id?"Это вы":"Игрок"}</small></td><td>{money(r.balance+r.locked)}</td><td>{money(r.locked)}</td><td>{r.bets}</td><td>{money(r.profit)}</td><td>{r.turnover?pct(r.profit/r.turnover):"—"}</td></tr>)}</tbody></table></div></section>}
    {tab==="history"&&<section className={styles.panel}><h2>Мои ставки</h2><p>Коэффициент каждой ставки зафиксирован при приёме. Обновления линии его не меняют.</p>{!data?.history.length&&<div className={styles.empty}>Ставок пока нет. Начните с линии или наблюдайте за алгоритмами.</div>}<div className={styles.tableWrap}><table><thead><tr><th>Матч / исход</th><th>Кэф при ставке</th><th>Сумма</th><th>Выплата</th><th>Статус</th></tr></thead><tbody>{data?.history.map(b=><tr key={b.id}><td><b>{b.home} — {b.away}</b><small>{b.selection.label}</small><small>{date(b.created_at)} · {b.selection.manual?"Ручной расчёт":"Авто"}</small>{b.settlement_source&&<small>{b.settlement_source}</small>}</td><td>{(b.odds/10000).toFixed(2)}</td><td>{money(b.stake)}</td><td>{b.status==="PENDING"?"—":money(b.payout)}</td><td><span className={b.status==="WON"?styles.positive:""}>{statuses[b.status]}</span></td></tr>)}</tbody></table></div><p className={styles.hint}>Показаны последние 100 ставок. Все ставки остаются в журнале лиги.</p></section>}
    {tab==="bots"&&<section><div className={styles.botCards}>{BOTS.map((b,i)=><article key={b.name} className={styles.botCard}><div className={styles.avatar} data-color={i}>{b.name[0]}</div><h2>{b.name}</h2><p>{b.description}</p><span>{money(data?.standings.find(s=>s.bot_name===b.name)?.balance??10000000)} монет</span></article>)}</div><div className={styles.panel}><h2>Решение — это и пропуск</h2><p>Алгоритмы проверяют матчи в ближайшие 24 часа. Не больше 1 000 монет на матч и 10 000 в открытом риске. Минимум 5 прошлых матчей, усадка к среднему лиги, убывающие веса истории. Riley проверяет короткий отдых; погода в эту версию не включена. Версия 2026-09-07.1.</p><p>Это эксперимент: исторические тесты не подтвердили устойчивый ROI 20–30%. EV — оценка модели, а не обещание результата.</p><div className={styles.decisions}>{data?.decisions.map(d=><div key={d.id}><b>{d.name}</b><span>{d.home} — {d.away}<small>{d.reason}</small></span><em>{d.decision==="BET"?"Ставка":"Пропуск"}</em></div>)}</div></div></section>}
    <footer className={styles.footer}>Монеты не имеют денежной стоимости. Начисление однократное, пополнений и вывода нет. Коэффициенты могут меняться до приёма ставки.</footer>
    {slip&&<div className={styles.overlay} onClick={e=>{if(e.target===e.currentTarget&&!busy)setSlip(null);}}><section className={styles.slip} role="dialog" aria-modal="true" aria-labelledby="slip-title"><button className={styles.close} disabled={busy} onClick={()=>setSlip(null)} aria-label="Закрыть купон"><X/></button><span className={styles.eyebrow}>ВАШЕ РЕШЕНИЕ</span><h2 id="slip-title">{slip.event.home} — {slip.event.away}</h2><p>{slip.market.label}</p><div className={styles.quote}><span>Коэффициент<strong>{slip.market.odds.toFixed(2)}</strong></span><span>Расчёт<strong>{slip.market.manual?"Ручной":"Авто"}</strong></span></div><h3>Что думают алгоритмы</h3><div className={styles.recommendations}>{slip.market.recommendations.map(r=><div key={r.name}><b>{r.name}</b><span>{r.probability===null?"Нет оценки":`P выигрыша ${(r.probability*100).toFixed(1)}% · EV ${pct(r.ev!)}`}<small>{r.reason}</small></span><em className={r.decision==="BET"?styles.positive:""}>{r.decision==="BET"?"Ставить":"Пропуск"}</em></div>)}</div><label className={styles.amount}>Сумма, монеты<input autoFocus type="number" min="1" max="100000" step="1" value={coins} onChange={e=>{setCoins(e.target.value);setSlip(s=>s?{...s,requestKey:crypto.randomUUID()}:null);}}/></label><div className={styles.quick}>{[100,500,1000,5000].map(n=><button key={n} onClick={()=>{setCoins(String(n));setSlip(s=>s?{...s,requestKey:crypto.randomUUID()}:null);}}>{n}</button>)}</div><p>Полная выплата при выигрыше: <b>{money(Math.round(Number(coins)*slip.market.odds*100))} монет</b></p><small>Включает сумму ставки. Для целых и четвертных линий возможны возвраты и частичные выплаты.</small>{slip.market.manual&&<p className={styles.warning}>Этот рынок рассчитывается администратором по подтверждённому результату.</p>}{error&&<p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} disabled={busy || !Number.isInteger(Number(coins)) || Number(coins)<1 || Number(coins)>100000 || Number(coins)*100>(data?.account.balance??0)} onClick={()=>void submit()}>{busy?"Проверяем линию…":`Поставить ${Number(coins)||0} монет`}</button><button disabled={busy} onClick={()=>setSlip(null)}>Пропустить этот исход</button><button disabled={busy} onClick={async()=>{try{const d=await api<Detail>(`?event=${slip.event.id}`);const m=d.markets.find(m=>m.key===slip.market.key);if(m){setSlip({event:d,market:m,requestKey:crypto.randomUUID()});setError("");}}catch(e){setError((e as Error).message);}}}>Обновить цену купона</button></section></div>}
  </main>;
}
