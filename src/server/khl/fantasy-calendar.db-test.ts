/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#fantasy-weeks
 * @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { importCalendar } from './data-layer';
import { importSportsFantasyCalendar } from './fantasy-calendar';
import type { ClubCalendar } from '@/khl/fantasy-calendar';

const db = new PrismaClient();
const enabled = process.env.KHL_TEST_DATABASE === 'true' && Boolean(process.env.DATABASE_URL?.match(/127\.0\.0\.1:(55439|45439)\/khl_test/));
after(() => db.$disconnect());

test('calendar corrections are atomic, idempotent, scoped, audited and protect verified weeks', { skip: !enabled }, async () => {
  const key = randomUUID(), now = new Date('2026-10-05T08:22:00Z');
  const competition = await db.khlCompetition.create({ data: { code: key } });
  const season = await db.khlSeason.create({ data: { competitionId: competition.id, seasonKey: '2026/2027', label: key } });
  const contest = await db.khlContest.create({ data: { seasonId: season.id, providerContestId: '107', name: key } });
  await importCalendar(db, { contestId: contest.id, stageId: key, officialSeasonId: key, complete: true, batchId: key, observedAt: now,
    from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-20T00:00:00Z'), matches: [{ eventId: key, officialMatchId: key, stageId: key, officialSeasonId: key,
      startsAt: '2026-10-05T16:30:00Z', home: { officialId: '53', mobileId: key + 'home', name: 'Ak Bars' }, away: { officialId: '1', mobileId: key + 'away', name: 'Lokomotiv' }, status: 'SCHEDULED', decidedBy: 'UNKNOWN', score: null }] });
  const match = await db.khlMatch.findFirstOrThrow({ where: { seasonId: season.id } });
  const players = await Promise.all(['1234', '5678'].map(async (id, i) => {
    const player = await db.khlPlayer.create({ data: { name: id } });
    return db.khlFantasyPlayer.create({ data: { contestId: contest.id, providerPlayerId: id, playerId: player.id, name: id, clubId: i ? '3601' : '3600', clubName: id, position: 'F', observedAt: now } });
  }));
  const old = await db.khlFantasyWeek.create({ data: { contestId: contest.id, providerWeekId: '4', label: '4', sourceUrl: 'old' } });
  const target = await db.khlFantasyWeek.create({ data: { contestId: contest.id, providerWeekId: '5', label: '5', sourceUrl: 'new' } });
  await db.khlMatchFantasyWeek.create({ data: { contestId: contest.id, matchId: match.id, weekId: old.id } });
  const historyTime = new Date(now.getTime() - 3600000);
  await db.khlProviderCheckpoint.create({ data: { provider: 'SPORTS_RU_STATS', scope: players[0].id, jobType: 'PLAYER', completedAt: historyTime,
    cursor: { played: 2, quarantined: [`WEEK_ASSIGNMENT_CONFLICT:${match.id}`, 'OTHER_QUARANTINE'] } } });
  const clubs: ClubCalendar[] = players.map((p, i) => ({ teamId: i ? match.awayId : match.homeId, observedAt: now,
    source: `https://www.sports.ru/fantasy/hockey/player/info/107/${p.providerPlayerId}.html`, fixtures: [{ date: '2026-10-05', opponentId: i ? match.homeId : match.awayId, home: i === 0, week: 5 }] }));
  const before = await db.khlContest.findUniqueOrThrow({ where: { id: contest.id } });
  const historicalMatch = await db.khlMatch.create({ data: { seasonId: season.id, homeId: match.homeId, awayId: match.awayId, startsAt: new Date('2026-10-04T16:30:00Z'), status: 'FINAL' } });
  const stat = await db.khlPlayerMatchStat.create({ data: { playerId: players[0].playerId!, matchId: historicalMatch.id, participationStatus: 'PLAYED', toiSeconds: 900, goals: 1, sources: { toiSeconds: 'TEST' }, observedAt: now, availableAt: now } });
  const score = await db.khlOfficialFantasyScore.create({ data: { contestId: contest.id, fantasyPlayerId: players[0].id, matchId: historicalMatch.id, points: 8, source: 'TEST', observedAt: now, availableAt: now, revision: 1 } });
  const statsBefore = await db.khlPlayerMatchStat.count({ where: { match: { seasonId: season.id } } });
  const scoresBefore = await db.khlOfficialFantasyScore.count({ where: { contestId: contest.id } });
  const result = await importSportsFantasyCalendar(db, contest.id, clubs, now);
  assert.equal(result.changed, 1); assert.equal(result.cleared, 1);
  assert.equal((await db.khlMatchFantasyWeek.findFirstOrThrow({ where: { matchId: match.id, contestId: contest.id } })).weekId, target.id);
  assert.equal((await db.khlFantasyWeek.findUniqueOrThrow({ where: { id: old.id } })).revision, 2);
  assert.equal((await db.khlFantasyWeek.findUniqueOrThrow({ where: { id: target.id } })).revision, 2);
  assert.equal((await db.khlContest.findUniqueOrThrow({ where: { id: contest.id } })).revision, before.revision + 1);
  const check = await db.khlProviderCheckpoint.findFirstOrThrow({ where: { scope: players[0].id, provider: 'SPORTS_RU_STATS' } });
  assert.deepEqual((check.cursor as { quarantined: string[] }).quarantined, ['OTHER_QUARANTINE']); assert.deepEqual(check.completedAt, historyTime);
  const streamId = `sports-week:${contest.id}:${match.id}`;
  const evidence = await db.khlObservationRevision.findFirstOrThrow({ where: { streamId } });
  assert.deepEqual(evidence.value, { providerWeekId: '5', previousWeek: '4', sources: clubs.map(c => c.source) });
  assert.equal((await importSportsFantasyCalendar(db, contest.id, clubs, now)).changed, 0);
  assert.equal(await db.khlObservationRevision.count({ where: { streamId } }), 1);
  assert.equal((await db.khlContest.findUniqueOrThrow({ where: { id: contest.id } })).revision, before.revision + 1);
  assert.equal(await db.khlPlayerMatchStat.count({ where: { match: { seasonId: season.id } } }), statsBefore);
  assert.equal(await db.khlOfficialFantasyScore.count({ where: { contestId: contest.id } }), scoresBefore);
  assert.deepEqual(await db.khlPlayerMatchStat.findUnique({ where: { id: stat.id } }), stat);
  assert.deepEqual(await db.khlOfficialFantasyScore.findUnique({ where: { id: score.id } }), score);
  const disagreeing = structuredClone(clubs); disagreeing[0].fixtures[0].week = 6;
  assert.equal((await importSportsFantasyCalendar(db, contest.id, disagreeing, now)).deferred, 1);
  assert.equal((await db.khlMatchFantasyWeek.findFirstOrThrow({ where: { matchId: match.id, contestId: contest.id } })).weekId, target.id);
  await db.khlFantasyWeek.update({ where: { id: target.id }, data: { verified: true,
    startsAt: new Date('2026-10-05T00:00:00Z'), endsAt: new Date('2026-10-12T00:00:00Z'), timezone: 'Europe/Moscow' } });
  const moving = structuredClone(clubs); moving.forEach(c => { c.fixtures[0].week = 6; });
  assert.equal((await importSportsFantasyCalendar(db, contest.id, moving, now)).deferred, 1);
  assert.equal((await db.khlMatchFantasyWeek.findFirstOrThrow({ where: { matchId: match.id, contestId: contest.id } })).weekId, target.id);
  const foreign = structuredClone(clubs); foreign[0].source = foreign[0].source.replace('/107/', '/108/');
  await assert.rejects(importSportsFantasyCalendar(db, contest.id, foreign, now), /IDENTITY_INVALID/);
  await assert.rejects(importSportsFantasyCalendar(db, contest.id, clubs, historyTime), /STALE_OBSERVATION/);
  assert.equal(await db.khlMatchFantasyWeek.count({ where: { contestId: contest.id } }), 1);
});
