/** @spec spec://modules/khl/FEAT-002-khl-squad#table
 * @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
import {Prisma,type PrismaClient} from '@prisma/client';
import {historicalTableStats,seasonStatFields,type KhlPlayer,type KhlSeasonStats} from '@/khl/contracts';
import {khlStatHelp} from '@/khl/stat-help';
import {hydratePlayers} from './read-model';
const labels={toiSeconds:'TOI',ppToiSeconds:'PP',pkToiSeconds:'PK',attackZoneSeconds:'Атака',goals:'Голы',assists:'Передачи',shotsOnGoal:'Броски',blockedShots:'Блоки',pimMinutes:'Штраф, мин',plusMinus:'+/−',saves:'Сэйвы',goalsAgainst:'Пропущено'};
export async function loadKhlExport(db:PrismaClient,contestId:string,historyWindow:5|10|20){
 return db.$transaction(async tx=>{const contest=await tx.khlContest.findUniqueOrThrow({where:{id:contestId},include:{season:true}});const rows=await tx.khlFantasyPlayer.findMany({where:{contestId},orderBy:{id:'asc'},take:2001});if(rows.length>2000)throw new Error('EXPORT_POOL_LIMIT');
  const now=new Date(),players:KhlPlayer[]=[];for(let i=0;i<rows.length;i+=500)players.push(...await hydratePlayers(tx,rows.slice(i,i+500),{now,historyWindow}));
  return {players,season:contest.season.seasonKey,revision:contest.revision,asOf:now.toISOString(),historyWindow};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000});
}
export async function buildKhlWorkbook(input:{players:KhlPlayer[];season:string;revision:number;asOf:string;historyWindow:number}) {
 if(input.players.length>2000||new Set(input.players.map(p=>p.id)).size!==input.players.length)throw new Error('EXPORT_POOL_INVALID');
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Fantasy Scout';book.created=new Date(input.asOf);
 const identity=(p:KhlPlayer)=>[p.id,p.name,p.clubName,p.position];
 const sheet=(name:string,headers:string[])=>{const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1,xSplit:2}]});ws.addRow(headers);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17354A'}};ws.getRow(1).alignment={wrapText:true,vertical:'middle'};ws.getRow(1).height=34;ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};headers.forEach((h,i)=>{ws.getColumn(i+1).width=i===0?30:i===1?28:Math.min(32,Math.max(14,h.length+2));ws.getColumn(i+1).numFmt='0.##';});return ws;};
 const summary=sheet('Игроки',['ID','Игрок','Клуб','Позиция','Цена, единицы','FP: среднее окна','EP: ближайшие 7 дней','ixG','Текущих матчей','Прошлых матчей Sports','Прошлых матчей КХЛ','FP за сыгранный матч (EP)','Частота участия','Источник EP','Обновлено']);
 for(const p of input.players)summary.addRow([...identity(p),p.price.value,p.officialFp.value,p.ep.value,p.ixg.value,p.seasonStats?.games??null,p.previousSeasonStats?.games??null,p.previousSeasonStats?.protocolStats?.games??null,p.forecastExplanation?.perGame??null,p.forecastExplanation?.appearanceRate??null,p.ep.source,p.ep.asOf]);
 summary.getColumn(13).numFmt='0.##%';summary.getCell('E1').note=khlStatHelp.price;summary.getCell('F1').note=khlStatHelp.officialFp;summary.getCell('G1').note=khlStatHelp.ep;
 for(const period of ['season','recent','previous'] as const){const ws=sheet(period==='season'?'Текущий сезон':period==='recent'?'Последние матчи':'Прошлый сезон',['ID','Игрок','Клуб','Позиция','Матчей',...seasonStatFields.flatMap(k=>[labels[k],`${labels[k]}: известно матчей`]),'Источник','Обновлено']);
  for(const p of input.players){const archive=p.previousSeasonStats;const stats:KhlSeasonStats|undefined=period==='season'?p.seasonStats:period==='previous'?archive&&historicalTableStats(archive):undefined;
   const recent=p as unknown as Record<string,{value:number|null;knownGames?:number;totalGames?:number;source?:string;asOf?:string}>;
   ws.addRow([...identity(p),period==='recent'?p.toiSeconds.totalGames??null:stats?.games??null,...seasonStatFields.flatMap(k=>{const s=period==='recent'?recent[k]:stats?.totals[k];const n=s?.value??null;return [n!==null&&k.endsWith('Seconds')?n/86400:n,s?.knownGames??0];}),period==='previous'?[archive?.source,archive?.protocolStats?.source].filter(Boolean).join(' ; '):period==='season'?'Sports / протоколы КХЛ':'Sports / КХЛ; среднее известных наблюдений',period==='recent'?p.toiSeconds.asOf:stats?.asOf??archive?.protocolStats?.asOf??null]);
  }
  seasonStatFields.forEach((k,i)=>{ws.getCell(1,6+i*2).note=khlStatHelp[k];if(k.endsWith('Seconds'))ws.getColumn(6+i*2).numFmt='[m]:ss';});
 }
 const fixtures=sheet('Предстоящие матчи',['ID игрока','Игрок','Клуб','Позиция','ID матча','Начало UTC','Соперник','Статус','EP матча','Качество EP']);
 for(const p of input.players)for(const f of p.fixtures)fixtures.addRow([...identity(p),f.id,f.startsAt,f.opponent,f.status,f.expectedPoints?.value??null,f.expectedPoints?.quality??null]);
 const help=sheet('Справка',['Показатель','Значение / расчёт']);help.getColumn(1).width=28;help.getColumn(2).width=110;help.getColumn(2).alignment={wrapText:true,vertical:'top'};
 for(const [key,value]of Object.entries(khlStatHelp))help.addRow([key,value]);help.addRow(['Снимок',`${input.season}; ревизия ${input.revision}; ${input.asOf}; ${input.players.length} уникальных игроков. Фильтры и страница не ограничивают экспорт.`]);help.addRow(['Периоды',`Текущий/прошлый сезон — суммы. Последние матчи — средние по окну ${input.historyWindow} сыгранных матчей. FP — среднее этого окна; EP — будущие 7 дней. Отсутствие — пустая ячейка, известный ноль — число 0. Время — минуты:секунды.`]);
 const bytes=await book.xlsx.writeBuffer();return Buffer.from(bytes);
}
