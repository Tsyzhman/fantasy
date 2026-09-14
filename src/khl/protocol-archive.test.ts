/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#providers
 * @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProtocolArchive,validateProtocolArchive} from './protocol-archive';
import {historicalTableStats,seasonStatFields} from './contracts';
import {projectHistory,summarizeHockeyHistory} from './history-projection';
import type {KhlProtocolRow} from '@/providers/khl-mobile/protocol';
const row:KhlProtocolRow={officialPlayerId:'44956',name:'Грегуар',teamName:'Северсталь',position:'D',participationStatus:'PLAYED',toiSeconds:1200,ppToiSeconds:120,pkToiSeconds:90,attackZoneSeconds:110,goals:1,assists:1,plusMinus:1,pimMinutes:2,shotsOnGoal:5,saves:null,goalsAgainst:null,shifts:20,blockedShots:2};
const input={officialPlayerId:'44956',officialSeasonId:'1369',observedAt:'2026-09-13T12:00:00Z',rows:Array.from({length:60},(_,i)=>({matchId:String(897000+i),row}))};
test('protocol archive sums exact seconds, excludes DNP, validates identity and keeps missing telemetry null',()=>{
 const stats=summarizeProtocolArchive({...input,rows:[...input.rows,{matchId:'999999',row:{...row,participationStatus:'DNP'}}]});
 assert.equal(stats.games,60);assert.equal(stats.totals.toiSeconds.value,72000);assert.equal(stats.totals.attackZoneSeconds.value,6600);assert.equal(stats.pairedShots,300);
 assert.throws(()=>summarizeProtocolArchive({...input,rows:[...input.rows,input.rows[0]]}),/DUPLICATE/);
 assert.throws(()=>validateProtocolArchive({...stats,officialPlayerId:'1'}),/INVALID/);
 const missing=summarizeProtocolArchive({...input,rows:[{matchId:'1',row:{...row,attackZoneSeconds:null}}]});assert.equal(missing.totals.attackZoneSeconds.value,null);
 const broken=structuredClone(stats);broken.totals.ppToiSeconds.knownGames=999;assert.throws(()=>validateProtocolArchive(broken),/INVALID/);
});
test('archive shots enter EP with capped paired history; FP/participation and larger Sports coverage stay intact',()=>{
 const previous=summarizeHockeyHistory(Array.from({length:68},()=>({...row,shotsOnGoal:null,points:18})),'2025/2026','Sports');
 const protocolStats=summarizeProtocolArchive(input), enriched={...previous,protocolStats};
 const table=historicalTableStats(enriched);assert.equal(table.games,68);assert.equal(table.totals.toiSeconds.knownGames,68);assert.equal(table.totals.shotsOnGoal.knownGames,60);
 assert.deepEqual(enriched.officialFp,previous.officialFp);assert.equal(enriched.games,68);
 const current=summarizeHockeyHistory([{...row,goals:0,points:8}],'2026/2027','Sports');
 const base={position:'D' as const,current,previous:enriched,pairedGoals:0,pairedShots:5,leagueGoals:10,leagueShots:100};
 const prediction=projectHistory(base)!;assert.equal(prediction.components.shotConversion,(20+5)/(5+100+50));assert.equal(prediction.components.previousShotGames,60);
 const without=projectHistory({...base,previous})!;assert.notEqual(prediction.perGame,without.perGame);assert.equal(prediction.appearanceRate,without.appearanceRate);
 const empty=summarizeHockeyHistory([],'current','Sports');const priorOnly=projectHistory({...base,current:empty,pairedGoals:0,pairedShots:0,leagueGoals:0,leagueShots:0})!;assert.equal(priorOnly.components.shotConversion,0.2);assert.ok(Number.isFinite(priorOnly.perGame));
 for(const field of seasonStatFields)assert.ok(table.totals[field].knownGames<=table.games);
});
