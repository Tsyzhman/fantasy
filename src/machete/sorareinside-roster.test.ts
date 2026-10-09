/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSourcePlayer } from './sorareinside-identity';
import { corroboratedSorareRosterRepair, sorareRosterIdentity, verifiedSorareRosterEvidence } from './sorareinside-roster';

const now = new Date('2026-10-09T08:00:00Z');
const birth = new Date('2004-09-09');
const price = { id: 'price', provider: 'SPORTS_RU', contestId: 'contest', leagueId: 57n, season: '2026/2027',
  teamId: 8674n, playerId: 1419385n, fotmobPlayerName: 'jorg schreuders', providerBirthDate: birth, lastSeenAt: now };
const map = { provider: 'SPORTS_RU', contestId: 'contest', providerSeason: '2026/2027', providerEntityType: 'FANTASY_PLAYER_PRICE',
  providerEntityId: 'price', internalEntityType: 'PLAYER', internalEntityId: '1419385', status: 'MATCHED' };
const scope = { leagueId: 57n, season: '2026/2027', teamId: 8674n };
const member = { player: { id: 1419385n, name: 'Jorg Schreuders', birthDate: null }, active: false, position: 'RM' };
const source = { id: 's', name: 'Jorg Schreuders', slug: 'jorg-schreuders', birthDate: '2004-09-09', position: 'Midfielder', index: 4 };
const verified = () => verifiedSorareRosterEvidence([price], [map], now);

test('a price foreign key needs the matching provider, contest, season and player binding', () => {
  assert.equal(verified().length, 1);
  assert.equal(verifiedSorareRosterEvidence([price], [], now).length, 0);
  for (const change of [{ provider: 'FPL' }, { contestId: 'other' }, { providerSeason: 'old' }, { internalEntityId: '99' },
    { status: 'UNMATCHED' }, { providerEntityType: 'PLAYER' }]) {
    assert.equal(verifiedSorareRosterEvidence([price], [{ ...map, ...change }], now).length, 0);
  }
  assert.equal(verifiedSorareRosterEvidence([price], [map, map], now).length, 0);
});

test('stale, future and undated identity evidence is rejected', () => {
  for (const lastSeenAt of [new Date(now.getTime() - 48 * 3600000 - 1), new Date(now.getTime() + 1)]) {
    assert.equal(verifiedSorareRosterEvidence([{ ...price, lastSeenAt }], [map], now).length, 0);
  }
  assert.equal(verifiedSorareRosterEvidence([{ ...price, providerBirthDate: null }], [map], now).length, 0);
});

test('competing club or birth-date assignments contribute no identity alias', () => {
  for (const change of [{ teamId: 999n }, { providerBirthDate: new Date('2004-09-10') }]) {
    const other = { ...price, id: 'other-price', ...change };
    const otherMap = { ...map, providerEntityId: other.id };
    assert.equal(verifiedSorareRosterEvidence([price, other], [map, otherMap], now).length, 0);
  }
});

test('Rodri resolves through his verified full name and date, without a nickname guess', () => {
  const row = { ...verified()[0], playerId: 675088n, fotmobPlayerName: 'rodrigo hernandez', providerBirthDate: new Date('1996-06-22') };
  const player = sorareRosterIdentity({ id: 675088n, name: 'Rodri', birthDate: null }, [row]);
  const rodri = { ...source, name: 'Rodrigo', slug: 'rodrigo-hernandez-cascante', birthDate: '1996-06-22' };
  assert.equal(resolveSourcePlayer(rodri, [player]).player?.id, 675088n);
  assert.equal(resolveSourcePlayer({ ...rodri, birthDate: '1996-06-23' }, [player]).player, null);
  assert.equal(resolveSourcePlayer(rodri, [player, { ...player, id: 99n }]).reason, 'AMBIGUOUS');
});

test('Makhachkala transliteration resolves by the verified source slug', () => {
  const row = { ...verified()[0], playerId: 1477508n, fotmobPlayerName: 'makhmudjon makhamadjonov', providerBirthDate: new Date('2003-06-30') };
  const player = sorareRosterIdentity({ id: 1477508n, name: 'Makhmud Makhamadzhonov', birthDate: null }, [row]);
  const makhmud = { ...source, name: 'Mahmudjon Maxamadjonov', slug: 'makhmudjon-makhamadjonov', birthDate: '2003-06-30' };
  assert.equal(resolveSourcePlayer(makhmud, [player]).reason, 'EXACT_NAME_IN_TEAM');
  const conflicting = sorareRosterIdentity({ ...player, aliases: undefined, birthDate: new Date('2003-07-01') }, [row]);
  assert.equal(conflicting.aliases, undefined);
  assert.equal(resolveSourcePlayer(makhmud, [conflicting]).player, null);
});

test('inactive Groningen member needs corroborated name, full date, exact scope and no competing club', () => {
  assert.equal(corroboratedSorareRosterRepair(source, member, scope, verified(), false)?.evidence.playerId, 1419385n);
  assert.equal(corroboratedSorareRosterRepair(source, member, scope, verified(), true), null);
  assert.equal(corroboratedSorareRosterRepair(source, { ...member, position: null }, scope, verified(), false), null);
  assert.equal(corroboratedSorareRosterRepair(source, member, { ...scope, leagueId: 42n }, verified(), false), null);
  assert.equal(corroboratedSorareRosterRepair({ ...source, birthDate: null }, member, scope, verified(), false), null);
  assert.equal(corroboratedSorareRosterRepair({ ...source, birthDate: '2004-09-10' }, member, scope, verified(), false), null);
  assert.equal(corroboratedSorareRosterRepair({ ...source, name: 'Someone Else', slug: 'someone-else' }, member, scope, verified(), false), null);
  assert.equal(resolveSourcePlayer(source, [], 1419385n).reason, 'ID_NOT_IN_ACTIVE_ROSTER');
});

test('a reviewed UUID cannot bypass independent name corroboration for an inactive member', () => {
  const row = { ...verified()[0], playerId: 983199n, fotmobPlayerName: 'Tino Anjorin', providerBirthDate: new Date('2001-11-23') };
  const inactive = { ...member, player: { id: 983199n, name: 'Tino Anjorin', birthDate: null } };
  const changed = { ...source, id: 'f8ce190b-e498-4367-8685-3603fab2643e', name: 'Someone Else', slug: 'someone-else', birthDate: '2001-11-23' };
  assert.equal(resolveSourcePlayer(changed, [sorareRosterIdentity(inactive.player, [row])]).reason, 'REVIEWED_UUID');
  assert.equal(corroboratedSorareRosterRepair(changed, inactive, scope, [row], false), null);
});
