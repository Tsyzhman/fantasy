/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKhlInjuries } from './injuries';
const p = (id: number) => ({ id, link: `/players/${id}/` });
const raw = (season = '1436', injured: unknown = [p(4)]) => JSON.stringify({ '207': { status: 'success', data: { photo: `//img.khl.ru/teamphoto/${season}/207/999.jpg`, players: { goalkeepers: [p(1)], defenders: [p(2)], forwards: [p(3)], ...(injured === undefined ? {} : { injured }) } } } });
test('injuries require exact season/club and unique roster IDs; absent list does not claim healthy', () => {
  assert.deepEqual(parseKhlInjuries(raw(), '1436', ['207']), ['4']);
  const empty = JSON.parse(raw()); delete empty['207'].data.players.injured;
  assert.deepEqual(parseKhlInjuries(JSON.stringify(empty), '1436', ['207']), []);
  assert.throws(() => parseKhlInjuries(raw('1287'), '1436', ['207']), /SCOPE_INVALID/);
  assert.throws(() => parseKhlInjuries(raw('1436', [p(1)]), '1436', ['207']), /PLAYER_INVALID/);
  assert.throws(() => parseKhlInjuries(raw('1436', null), '1436', ['207']), /ROSTER_INVALID/);
});
