/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import test from 'node:test';
import assert from 'node:assert/strict';
import { protocolRefreshDue } from './protocol-scheduler';

test('protocol corrections are incremental and same-hour retries do not redownload settled facts', () => {
  const now = new Date('2026-09-20T12:22:00Z');
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600000);
  assert.equal(protocolRefreshDue(ago(3), undefined, now), true);
  assert.equal(protocolRefreshDue(ago(3), ago(0.1), now), false);
  assert.equal(protocolRefreshDue(ago(3), ago(1), now), true);
  assert.equal(protocolRefreshDue(ago(100), ago(2), now), false);
  assert.equal(protocolRefreshDue(ago(100), ago(24), now), true);
  assert.equal(protocolRefreshDue(ago(300), ago(25), now), false);
  assert.equal(protocolRefreshDue(ago(300), ago(169), now), true);
});
