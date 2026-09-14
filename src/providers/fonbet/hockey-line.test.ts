/** @spec spec://modules/khl/INFRA-003-khl-fonbet-odds#acceptance */
import test from 'node:test';
import assert from 'node:assert/strict';
import sample from './fixtures/khl-line-20260914.json';
import { hockeyTeamId, parseHockeyLine, verifyHockeyDictionary } from './hockey-line';
import { noVig } from './hockey-markets';
test('12 observed KHL fixtures use only verified regulation 1/X/2; aggregates and child/live events excluded', () => {
  const parsed = parseHockeyLine(sample);
  assert.equal(parsed.length, 12);
  assert.ok(parsed.every(e => Math.abs(noVig(e.markets)!.reduce((n,p) => n+p.probability, 0)-1)<1e-12));
  assert.equal(hockeyTeamId('Динамо'), null);
  const first = sample.events[0];
  for (const patch of [{ parentId: 123 }, { place: 'live' }, { team1: first.team2, team2: 'НЕИЗВЕСТНЫЙ' }, { sportId: 1 }, { level: 2 }]) assert.equal(parseHockeyLine({ ...sample, events: [{ ...first, ...patch }] }).length, 0);
  assert.equal(parseHockeyLine({ ...sample, events: [first, first] }).length, 0);
  const duplicate = { ...sample, customFactors: [...sample.customFactors, sample.customFactors[0]] };
  assert.equal(parseHockeyLine(duplicate).length, 11);
  assert.equal(noVig(parseHockeyLine({ ...sample, eventBlocks: [{ eventId: first.id, state: 'blocked' }] })[0].markets), null);
});
test('runtime dictionary validates labels, not mere occurrence of football factor IDs', () => {
  const rows: {name?:string;factorId?:number}[][] = [[{name:'1'},{name:'X'},{name:'2'}],[{factorId:921},{factorId:922},{factorId:923}]];
  assert.equal(verifyHockeyDictionary({ groups: [{ tables: [{ name: 'Исходы', rows }] }] }), true);
  rows[0][0].name = '2';
  assert.equal(verifyHockeyDictionary({ groups: [{ tables: [{ name: 'Исходы', rows }] }] }), false);
  assert.equal(verifyHockeyDictionary({}), false);
});
