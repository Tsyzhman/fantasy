/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {parseHockeyHistory,hockeyHistorySeasonId,previousHockeySeason} from './history';
const fixture=(name:string)=>readFileSync(`src/providers/sports-ru-hockey/fixtures/history-${name}.html`,'utf8');
const expected={tagId:'161159685',season:'2026/2027',position:'D' as const};
test('archived season uses published selector and ignores the current-season calendar',()=>{
 const html=fixture('previous');
 assert.equal(previousHockeySeason('2026/2027'),'2025/2026');
 assert.equal(hockeyHistorySeasonId(fixture('skater'),'2025/2026'),'1317639');
 const h=parseHockeyHistory(html,{...expected,season:'2025/2026',historyOnly:true});
 assert.ok(h.rows.length>50);assert.equal(h.fixtures.length,0);
 assert.ok(h.rows.every(r=>r.date>='2025-07-01'&&r.date<'2026-07-01'));
 assert.throws(()=>parseHockeyHistory(html,{...expected,historyOnly:true}),/IDENTITY|SEASON/);
 assert.throws(()=>parseHockeyHistory(html.replace('19.03.2026','19.03.2027'),{...expected,season:'2025/2026',historyOnly:true}),/SEASON/);
});
test('Sports hockey malformed tbody preserves actual TOI, FP and separate future weeks',()=>{
 const h=parseHockeyHistory(fixture('skater'),expected);
 assert.equal(h.rows.find(r=>r.date==='2026-09-05')?.toiSeconds,1250);
 assert.equal(h.rows.find(r=>r.date==='2026-09-05')?.points,7);
 assert.equal(h.rows.find(r=>r.date==='2026-09-07')?.points,17);
 assert.ok(h.fixtures.length>0);assert.ok(h.fixtures.every(r=>r.week!==null&&r.toiSeconds===null));
 assert.equal(h.rows[0].saves,null);
});
test('goalie stats retain saves and goals against independently of team score',()=>{
 const html=fixture('goalie');const tagId='161103641';
 const h=parseHockeyHistory(html,{...expected,tagId,position:'G'});
 const r=h.rows.find(r=>r.date==='2026-09-07')!;
 assert.equal(r.toiSeconds,3573);assert.equal(r.saves,33);assert.equal(r.goalsAgainst,1);assert.equal(r.points,15);assert.equal(r.goals,null);
});
test('vanity profile identity and players without history are supported without invented zeroes',()=>{
 const vanity=parseHockeyHistory(fixture('vanity'),{...expected,tagId:'161057847',position:'F'});assert.equal(vanity.tagId,null);assert.equal(vanity.rows.length,2);
 const html=fixture('new'),tagId=/\/tags\/(\d+)\//.exec(html)![1];
 assert.equal(parseHockeyHistory(html,{...expected,tagId,position:'D'}).rows.length,0);
});
test('identity, season and provider column drift fail closed',()=>{
 const html=fixture('skater');
 assert.throws(()=>parseHockeyHistory(html,{...expected,tagId:'1'}),/IDENTITY/);
 assert.throws(()=>parseHockeyHistory(html,{...expected,season:'2025\/2026'}),/IDENTITY|SEASON/);
 assert.throws(()=>parseHockeyHistory(html.replace('МИН','MIN'),expected),/COLUMNS/);
});

test('blank archive headers require the same provider route, verified current tag and selected season',()=>{
 const currentHtml=fixture('blank-current'), archive=fixture('blank-archive');
 const tagId=/\/tags\/(\d+)\//.exec(currentHtml)![1];
 const current=parseHockeyHistory(currentHtml,{tagId,season:'2026/2027',position:'F'});
 const currentUrl='https://www.sports.ru/fantasy/hockey/player/info/107/2152421.html';
 const verifiedArchiveIdentity={current,currentUrl,archiveUrl:currentUrl+'?s=1317639',providerSeasonId:'1317639'};
 const expected={tagId,season:'2025/2026',position:'F' as const,historyOnly:true,verifiedArchiveIdentity};
 const result=parseHockeyHistory(archive,expected);
 assert.equal(result.tagId,tagId);assert.equal(result.name,current.name);assert.ok(result.rows.length>0);
 assert.throws(()=>parseHockeyHistory(archive,{...expected,verifiedArchiveIdentity:undefined}),/IDENTITY/);
 assert.throws(()=>parseHockeyHistory(archive,{...expected,verifiedArchiveIdentity:{...verifiedArchiveIdentity,archiveUrl:currentUrl.replace('2152421','123')+'?s=1317639'}}),/IDENTITY/);
 assert.throws(()=>parseHockeyHistory(archive,{...expected,tagId:'123'}),/IDENTITY/);
 assert.throws(()=>parseHockeyHistory(archive.replace('<b></b>','<b>Другой игрок</b>'),expected),/IDENTITY/);
});
