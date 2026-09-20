/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import test from 'node:test';
import assert from 'node:assert/strict';
import { protocolIdentityMatches } from './protocol-import';
const player = { playerId: 'canonical', name: 'Крис Тирни', clubId: '207', position: 'F', birthDate: new Date('1994-07-01') };
const row = { name: 'Тирни Кристофер', position: 'F', birthDate: '1994-07-01' };
test('DOB resolves independently verified nickname variants but rejects another birthday or club', () => {
  assert.equal(protocolIdentityMatches(player, row, null, '207'), true);
  assert.equal(protocolIdentityMatches(player, { ...row, birthDate: '1994-07-02' }, null, '207'), false);
  assert.equal(protocolIdentityMatches(player, row, null, '38'), false);
  assert.equal(protocolIdentityMatches({ ...player, birthDate: null }, row, null, '207'), false);
});
test('verified ID survives fantasy position differences, but never a DOB conflict or different canonical ID', () => {
  assert.equal(protocolIdentityMatches(player, { ...row, position: 'D' }, 'canonical', '38'), true);
  assert.equal(protocolIdentityMatches(player, { ...row, position: 'D' }, null, '207'), false);
  assert.equal(protocolIdentityMatches(player, row, 'someone-else', '207'), false);
  assert.equal(protocolIdentityMatches(player, { ...row, birthDate: '1995-07-01' }, 'canonical', '207'), false);
});
