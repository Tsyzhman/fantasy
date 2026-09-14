/** @spec spec://modules/khl/FEAT-002-khl-squad#table */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildKhlWorkbook} from './player-export';
import {unknown,seasonStatFields,type KhlPlayer} from '@/khl/contracts';
import {khlCellHelp} from '@/khl/stat-help';

const observed={value:0,quality:'FACT' as const,source:'КХЛ',asOf:'2026-09-13T20:00:00Z',knownGames:2,totalGames:3};
const player:KhlPlayer={id:'player-0',contestId:'contest',playerId:'canonical',name:'=SUM(A1:A2)',clubId:'club',clubName:'Клуб',position:'D',price:{...observed,value:924},priceRevision:1,priceDelta:null,providerLock:unknown('Нет данных'),injury:unknown('Нет данных'),toiSeconds:{...observed,value:1200},ppToiSeconds:observed,pkToiSeconds:unknown('Нет данных'),officialFp:{...observed,value:6.123456},ep:{...observed,value:12.345678},ixg:unknown('Нет данных'),saves:unknown('Не вратарь'),goalsAgainst:unknown('Не вратарь'),fixtures:[{id:'match',weekId:'week',startsAt:'2026-09-15T12:00:00Z',opponent:'Соперник',status:'SCHEDULED',startProbability:unknown('Нет данных'),expectedPoints:{...observed,value:12.345678}}],
 seasonStats:{games:3,asOf:observed.asOf,totals:Object.fromEntries(seasonStatFields.map(k=>[k,{value:k==='toiSeconds'?72441:k==='ppToiSeconds'?0:null,knownGames:k==='toiSeconds'?3:k==='ppToiSeconds'?2:0}])) as NonNullable<KhlPlayer['seasonStats']>['totals']},
 forecastExplanation:{perGame:6.81,appearanceRate:0.9,currentGames:3,previousGames:60,previousSeason:'2025/2026',priorWeight:20,components:{goals:1.234,assists:2.45},warnings:[]},
};
test('XLSX contains all 603 unique players on each period sheet, real numbers, missing values, exact long times and formula-safe names',async()=>{
 const players=Array.from({length:603},(_,i)=>({...player,id:`player-${i}`}));
 const input={players,season:'2026/2027',revision:3,asOf:observed.asOf,historyWindow:10};
 const bytes=await buildKhlWorkbook(input),book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(bytes).buffer);
 assert.equal(book.worksheets.length,6);
 for(const name of ['Игроки','Текущий сезон','Последние матчи','Прошлый сезон']){
  const sheet=book.getWorksheet(name)!;assert.equal(sheet.rowCount,604);
  assert.equal(new Set(sheet.getColumn(1).values.slice(2)).size,603);
  assert.equal(sheet.getCell('A604').value,'player-602');
 }
 const sheet=book.getWorksheet('Игроки')!;
 assert.equal(sheet.getCell('B2').value,'=SUM(A1:A2)');assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);
 assert.equal(sheet.getCell('F2').value,6.123456);assert.equal(sheet.getCell('F2').numFmt,'0.##');assert.equal(sheet.getCell('H2').value,null);
 const season=book.getWorksheet('Текущий сезон')!;
 // ExcelJS reads Excel duration cells as dates; the stored serial retains exact seconds.
 const seconds=(cell:ExcelJS.Cell)=>cell.value instanceof Date?(cell.value.getTime()-Date.UTC(1899,11,30))/1000:Number(cell.value)*86400;
 assert.equal(seconds(season.getCell('F2')),72441);assert.equal(season.getCell('F2').numFmt,'[m]:ss');
 assert.equal(seconds(season.getCell('H2')),0);assert.equal(season.getCell('J2').value,null);assert.equal(season.getCell('I2').value,2);
 assert.equal(book.getWorksheet('Предстоящие матчи')!.rowCount,604);
 assert.ok(book.getWorksheet('Справка')!.getColumn(2).values.some(v=>String(v).includes('603 уникальных')));
 await assert.rejects(()=>buildKhlWorkbook({...input,players:[player,player]}),/EXPORT_POOL_INVALID/);
});
test('cell help distinguishes zero from missing, states coverage/source and explains this player EP',()=>{
 const zero=khlCellHelp(player,'ppToiSeconds','Текущий сезон');assert.match(zero,/Значение: 0:00/);assert.match(zero,/2 из 3/);assert.match(zero,/Источник: КХЛ/);
 assert.match(khlCellHelp(player,'pkToiSeconds','Текущий сезон'),/Значение: Нет данных/);
 const ep=khlCellHelp(player,'ep','Ближайшие 7 дней');assert.match(ep,/текущих матчей 3, прошлых 60/);assert.match(ep,/За сыгранный матч: 6,81/);assert.match(ep,/Голы, FP: 1,23/);
});
