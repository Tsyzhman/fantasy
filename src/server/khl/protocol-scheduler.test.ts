/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isProtocolValidationError, protocolRefreshDue } from './protocol-scheduler';

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

test('incomplete protocol retries next hour even for old matches; access and lease failures remain global', () => {
  const now = new Date('2026-09-20T12:22:00Z'), old = new Date('2026-09-01T12:00:00Z');
  assert.equal(protocolRefreshDue(old, new Date(now.getTime() - 10 * 60000), now, true), false);
  assert.equal(protocolRefreshDue(old, new Date(now.getTime() - 60 * 60000), now, true), true);
  for (const message of ['PROTOCOL_COVERAGE_INVALID', 'PROTOCOL_MATCH_INVALID', 'PROTOCOL_CLUB_MISMATCH']) assert.equal(isProtocolValidationError(message), true);
  for (const message of ['PROTOCOL_HTTP_403', 'PROTOCOL_HTTP_429', 'LEASE_LOST', 'Database unavailable']) assert.equal(isProtocolValidationError(message), false);
});
