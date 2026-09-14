/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMobileRange } from './transport';
const epoch=Date.parse('2026-09-14T00:00:00Z');
const row=(id:number,hour:number)=>({event:{id,khl_id:id,stage_id:407,outer_stage_id:1436,type_id:24,start_at:epoch+hour*3600000,team_a:{id:1,khl_id:1,name:'A'},team_b:{id:2,khl_id:2,name:'B'},scores:{},game_state_key:'not_yet_started'}});
test('mobile date-rounded upper bound is filtered locally without rejecting the whole calendar',async()=>{
 let page=0;
 const source:typeof fetch=async()=>new Response(JSON.stringify(page++===0?[row(3,9),row(2,7),row(1,3)]:[]));
 const result=await fetchMobileRange({stageId:'407',from:new Date(epoch+4*3600000),to:new Date(epoch+8*3600000)},source);
 assert.deepEqual(result.matches.map(m=>m.eventId),['2']);assert.equal(result.complete,true);
 const unordered:typeof fetch=async()=>new Response(JSON.stringify([row(1,7),row(2,9)]));
 await assert.rejects(()=>fetchMobileRange({stageId:'407',from:new Date(epoch),to:new Date(epoch+8*3600000)},unordered),/CALENDAR_WATERMARK_INVALID/);
});
