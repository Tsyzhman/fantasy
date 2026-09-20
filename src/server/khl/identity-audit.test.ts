/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentityAudit } from './identity-audit';
import { parseKhlIdentity } from '@/providers/khl-mobile/identity';
const entry = { fantasyId: 'f', playerId: 'p', name: 'Крис Тирни', sports: { id: '1', name: 'Крис Тирни', birthDate: '1994-07-01', source: 'https://www.sports.ru/tags/1/' }, official: { id: '44593', name: 'Тирни Кристофер', birthDate: '1994-07-01', source: 'https://www.khl.ru/players/44593/' } };
const bundle = (entries: unknown[]) => ({ version: 1, contestId: 'c', entries });
test('audit rejects duplicate links and source/date disagreements; accepts verified nickname', () => {
  assert.equal(validateIdentityAudit(bundle([entry])).entries.length, 1);
  assert.throws(() => validateIdentityAudit(bundle([entry, { ...entry, fantasyId: 'f2', playerId: 'p2' }])) , /DUPLICATE_EXTERNAL/);
  assert.throws(() => validateIdentityAudit(bundle([{ ...entry, official: { ...entry.official, birthDate: '1994-07-02' } }])), /UNREVIEWED_DOB/);
  assert.throws(() => validateIdentityAudit(bundle([{ ...entry, official: { ...entry.official, source: 'https://example.com/' } }])), /SOURCE_INVALID/);
});
test('official biography must belong to requested ID and have a real date', () => {
  const raw = (id: string, birthdate: string) => JSON.stringify({ status: 'success', data: { DATA: { pagelink: `/players/${id}/stats/`, birthdate, lastname: 'Тирни', firstname: 'Кристофер' } } });
  assert.equal(parseKhlIdentity(raw('44593', '01.07.1994'), '44593').birthDate, '1994-07-01');
  assert.throws(() => parseKhlIdentity(raw('44592', '01.07.1994'), '44593'), /ID_INVALID/);
  assert.throws(() => parseKhlIdentity(raw('44593', '31.02.1994'), '44593'), /DATE_INVALID/);
});
