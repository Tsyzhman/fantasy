/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveCoverageHash } from './archive-protocol-sync';
test('new verified identity invalidates archive coverage even when fantasy pool is unchanged', () => {
  const pool = [{ id: 'f', playerId: 'p' }, { id: 'g', playerId: 'q' }];
  const ids = [{ externalId: '44593', playerId: 'p' }, { externalId: '19692', playerId: 'q' }];
  const hash = archiveCoverageHash(pool, ids, '2025/2026', '370');
  assert.notEqual(hash, archiveCoverageHash(pool, ids.slice(0, 1), '2025/2026', '370'));
  assert.equal(hash, archiveCoverageHash([...pool].reverse(), [...ids].reverse(), '2025/2026', '370'));
});
