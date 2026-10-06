/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#fantasy-weeks */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileClubCalendars, type ClubCalendar } from './fantasy-calendar';

const now = new Date('2026-10-05T08:22:00Z');
const match = { id: 'match', homeId: 'ak-bars', awayId: 'lokomotiv', startsAt: new Date('2026-10-05T16:30:00Z') };
const clubs: ClubCalendar[] = [
  { teamId: 'ak-bars', source: 'https://www.sports.ru/fantasy/hockey/player/info/107/1997909.html', observedAt: now,
    fixtures: [{ date: '2026-10-05', opponentId: 'lokomotiv', home: true, week: 5 }] },
  { teamId: 'lokomotiv', source: 'https://www.sports.ru/fantasy/hockey/player/info/107/26031.html', observedAt: now,
    fixtures: [{ date: '2026-10-05', opponentId: 'ak-bars', home: false, week: 5 }] },
];

test('both clubs corroborate the current provider week rather than an earlier assignment', () => {
  assert.deepEqual(reconcileClubCalendars([match], clubs, now), {
    assignments: [{ matchId: 'match', providerWeekId: '5', sources: clubs.map(c => c.source) }], deferred: [],
  });
});

test('a single club and disagreeing club weeks cannot authorize a correction', () => {
  const one = reconcileClubCalendars([match], clubs.slice(0, 1), now);
  assert.equal(one.assignments.length, 0); assert.equal(one.deferred.length, 1);
  const conflicting = structuredClone(clubs); conflicting[1].fixtures[0].week = 4;
  assert.equal(reconcileClubCalendars([match], conflicting, now).assignments.length, 0);
  assert.throws(() => reconcileClubCalendars([match], [clubs[0], clubs[0]], now), /SNAPSHOT_INVALID/);
});

test('stale, future, missing and invalid week observations preserve last-good data', () => {
  for (const mutate of [
    (c: ClubCalendar) => { c.observedAt = new Date(now.getTime() - 120001); },
    (c: ClubCalendar) => { c.observedAt = new Date(now.getTime() + 1); },
    (c: ClubCalendar) => { c.fixtures[0].week = null; },
    (c: ClubCalendar) => { c.fixtures[0].week = 0; },
    (c: ClubCalendar) => { c.source += '?s=old'; },
  ]) {
    const input = structuredClone(clubs); mutate(input[0]);
    assert.equal(reconcileClubCalendars([match], input, now).assignments.length, 0);
  }
});

test('exact Moscow date, opponent and home/away are required; ambiguous official matches are deferred', () => {
  for (const field of ['date', 'opponentId', 'home'] as const) {
    const input = structuredClone(clubs);
    if (field === 'date') input[0].fixtures[0].date = '2026-10-06';
    if (field === 'opponentId') input[0].fixtures[0].opponentId = 'other';
    if (field === 'home') input[0].fixtures[0].home = false;
    assert.equal(reconcileClubCalendars([match], input, now).assignments.length, 0);
  }
  const ambiguous = reconcileClubCalendars([match, { ...match, id: 'second' }], clubs, now);
  assert.equal(ambiguous.assignments.length, 0); assert.match(ambiguous.deferred[0], /AMBIGUOUS/);
  assert.equal(reconcileClubCalendars([{ ...match, startsAt: new Date('2026-10-04T22:00:00Z') }], clubs, now).assignments.length, 1);
});

test('contradictory duplicate rows from one club cannot masquerade as agreement', () => {
  const input = structuredClone(clubs); input[0].fixtures.push({ ...input[0].fixtures[0], week: 4 });
  assert.equal(reconcileClubCalendars([match], input, now).assignments.length, 0);
});
