/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSportsBirthDate } from './identity';
const fragment = '<table class="profile-table"><tr><th>Родился</th><td>1 июля 1994 <span>|</span>32 года</td></tr></table><div data-control="Stat.OkkoButton" data-tag="161008635"></div>';
test('biography date uses the independently verified Sports tag, never age', () => {
  assert.equal(parseSportsBirthDate(fragment, '161008635'), '1994-07-01');
  assert.equal(parseSportsBirthDate(fragment.replace('32 года', '99 лет'), '161008635'), '1994-07-01');
  assert.throws(() => parseSportsBirthDate(fragment, '161008636'), /TAG_INVALID/);
  assert.throws(() => parseSportsBirthDate(fragment.replace('1 июля', '31 февраля'), '161008635'), /DATE_INVALID/);
  assert.throws(() => parseSportsBirthDate(fragment.replace('1 июля 1994', '32 года'), '161008635'), /DATE_INVALID/);
});
