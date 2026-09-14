/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isArchiveLeagueGame } from './archive-protocol-sync';
import type { MobileMatch } from '@/providers/khl-mobile/calendar';

test('archived calendar excludes all four All-Star games but keeps league clubs', () => {
  const match = (home: string, away: string) => ({ home: { officialId: home }, away: { officialId: away } }) as MobileMatch;
  for (const pair of [['923', '922'], ['924', '807'], ['924', '922'], ['807', '923']]) {
    assert.equal(isArchiveLeagueGame(match(...pair as [string, string])), false);
  }
  assert.equal(isArchiveLeagueGame(match('53', '1')), true);
  assert.equal(isArchiveLeagueGame(match('568', '719')), true);
});
