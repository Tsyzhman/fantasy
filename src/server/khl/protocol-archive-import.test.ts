/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#providers */
import {test} from 'node:test';import assert from 'node:assert/strict';
import {matchingArchiveIdentity} from './protocol-archive-import';
import {summarizeHockeyHistory} from '@/khl/history-projection';
test('new archive identity needs full name, position and complete matching season fingerprint',()=>{
 const stats=summarizeHockeyHistory([{participationStatus:'PLAYED',points:7,goals:1,assists:0,plusMinus:-1,pimMinutes:2}],'2025/2026','Sports');
 const entry={...stats,name:'Морозов Егор',position:'F' as const,source:'https://www.khl.ru/players/123/',officialPlayerId:'123',officialSeasonId:'1369',matchIds:['1'],pairedGoals:0,pairedShots:0,pairedGames:0};
 const player={name:'Егор Морозов 2002',position:'F',stats};assert.equal(matchingArchiveIdentity(entry,player),true);
 assert.equal(matchingArchiveIdentity({...entry,name:'Морозов'},player),false);
 assert.equal(matchingArchiveIdentity({...entry,position:'D'},player),false);
 assert.equal(matchingArchiveIdentity({...entry,games:2},player),false);
 const changed=structuredClone(stats);changed.totals.pimMinutes.value=4;assert.equal(matchingArchiveIdentity(entry,{...player,stats:changed}),false);
});
