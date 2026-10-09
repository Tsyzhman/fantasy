/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { applyProbableLineupTeamPlan, type ProbableLineupTeamPlan } from './probable-lineup-sync';
import { enqueueCurrentXiTeamsSnapshotRefresh } from './fantasy-player-pool-refresh-queue';
import { loadSorareRosterEvidence, restoreSorareRosterMembers, type SorareRosterRepair } from './sorareinside-roster';

const db = new PrismaClient();
const skip = !(process.env.CI === 'true' && process.env.DATABASE_URL?.includes('127.0.0.1:55439/fantasy_scout_test_ci'));
after(() => db.$disconnect());

async function fixture() {
  const base = BigInt(randomInt(10000000, 90000000)) * 100n;
  const scope = { leagueId: base, season: `test-${randomUUID()}`, teamId: base + 1n };
  const ids = Array.from({ length: 12 }, (_, i) => base + 10n + BigInt(i));
  await db.coreLeague.create({ data: { id: scope.leagueId, name: 'Test league' } });
  await db.coreTeam.create({ data: { id: scope.teamId, name: 'Test club' } });
  await db.leagueSeason.create({ data: { leagueId: scope.leagueId, season: scope.season, isCurrent: true } });
  await db.leagueSeasonTeam.create({ data: { ...scope, metadata: { retained: true } } });
  await db.corePlayer.createMany({ data: ids.map((id, i) => ({ id, name: i === 1 ? 'Jorg Schreuders' : `Player ${i}` })) });
  await db.teamPlayerSeason.createMany({ data: ids.map((playerId, i) => ({ ...scope, playerId, active: i !== 1, isStarter: i !== 1, position: i === 0 ? 'GK' : 'MID' })) });
  const contest = await db.fantasyContest.create({ data: { leagueId: scope.leagueId, season: scope.season, name: 'Test sports', lastSyncedAt: new Date() } });
  const price = await db.fantasyPlayerPrice.create({ data: { ...scope, contestId: contest.id, playerId: ids[1],
    playerName: 'Jorg Schreuders', normalizedName: 'jorg schreuders', fotmobPlayerName: 'jorg schreuders',
    providerBirthDate: new Date('2004-09-09'), price: 5, lastSeenAt: new Date() } });
  await db.providerEntityMap.create({ data: { provider: 'SPORTS_RU', contestId: contest.id, providerSeason: scope.season,
    providerEntityType: 'FANTASY_PLAYER_PRICE', providerEntityId: price.id, internalEntityType: 'PLAYER', internalEntityId: String(ids[1]), status: 'MATCHED' } });
  const evidence = await loadSorareRosterEvidence(db, [scope], new Date());
  const repair: SorareRosterRepair = { evidence: evidence[0], source: { id: randomUUID(), name: 'Jorg Schreuders', slug: 'jorg-schreuders',
    birthDate: '2004-09-09', position: 'Midfielder', index: 1 } };
  const targetPlayerIds = ids.slice(0, 11);
  const plan: ProbableLineupTeamPlan = { ...scope, source: 'SORAREINSIDE', sourceUrl: 'https://sorareinside.com/',
    leagueName: 'Test league', fetchedAt: new Date(), databaseTeamName: 'Test club', teamMatchedBy: 'PROVIDER_CODE', teamConfidence: 1,
    sourceLineup: { source: 'SORAREINSIDE', sourceUrl: 'https://sorareinside.com/', sourceTeamCode: 'test-club', sourceFixtureId: randomUUID(), teamName: 'Test club', opponentName: 'Other club',
      venue: 'HOME', formation: '4-3-3', sourceUpdatedText: '', sourceKickoff: new Date(Date.now() + 86400000).toISOString(),
      players: targetPlayerIds.map(id => ({ name: `Player ${id}`, fullName: null, providerCode: null, shirtNumber: null })) },
    status: 'READY', playerResolutions: [], currentStarterIds: ids.filter((_, i) => i !== 1), targetPlayerIds, startersToSet: 1, startersToClear: 1, problems: [] };
  const cleanup = async () => {
    await db.providerEntityMap.deleteMany({ where: { OR: [{ contestId: contest.id }, { providerEntityId: repair.source.id }] } });
    await db.fantasyPlayerPoolRefreshRequest.deleteMany({ where: { leagueId: scope.leagueId, season: scope.season } });
    await db.coreLeague.delete({ where: { id: scope.leagueId } });
    await db.coreTeam.delete({ where: { id: scope.teamId } });
    await db.corePlayer.deleteMany({ where: { id: { in: ids } } });
  };
  const persist = async (tx: Parameters<typeof restoreSorareRosterMembers>[0]) => {
    await tx.providerEntityMap.upsert({ where: { provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
      provider: 'SORAREINSIDE', providerSeason: 'GLOBAL', providerEntityType: 'PLAYER', providerEntityId: repair.source.id, internalEntityType: 'PLAYER' } },
      create: { provider: 'SORAREINSIDE', providerSeason: 'GLOBAL', providerEntityType: 'PLAYER', providerEntityId: repair.source.id,
        internalEntityType: 'PLAYER', internalEntityId: String(ids[1]), status: 'MATCHED' }, update: {} });
  };
  return { scope, ids, plan, repair, price, persist, cleanup };
}

test('PostgreSQL: complete XI restores a corroborated inactive member atomically and repeat creates no duplicate refresh', { skip }, async () => {
  const f = await fixture();
  try {
    const apply = () => applyProbableLineupTeamPlan(db, f.plan, new Date(), (change, tx) => enqueueCurrentXiTeamsSnapshotRefresh(tx, change),
      f.persist, tx => restoreSorareRosterMembers(tx, f.scope, [f.repair]));
    assert.equal((await apply()).status, 'APPLIED');
    const starters = await db.teamPlayerSeason.findMany({ where: { ...f.scope, isStarter: true } });
    assert.equal(starters.length, 11);
    assert.equal(starters.every(row => row.active), true);
    assert.equal((await apply()).status, 'UNCHANGED');
    assert.equal(await db.fantasyPlayerPoolRefreshRequest.count({ where: { leagueId: f.scope.leagueId, season: f.scope.season } }), 1);
    assert.equal(await db.providerEntityMap.count({ where: { providerEntityId: f.repair.source.id } }), 1);
  } finally { await f.cleanup(); }
});

test('PostgreSQL: stale evidence and a failure after writing flags/metadata/queue roll back the entire XI transaction', { skip }, async () => {
  const f = await fixture();
  try {
    await db.fantasyPlayerPrice.update({ where: { id: f.price.id }, data: { lastSeenAt: new Date(Date.now() - 49 * 3600000) } });
    await assert.rejects(applyProbableLineupTeamPlan(db, f.plan, new Date(), undefined, f.persist,
      tx => restoreSorareRosterMembers(tx, f.scope, [f.repair])), /corroboration changed/);
    await db.fantasyPlayerPrice.update({ where: { id: f.price.id }, data: { lastSeenAt: new Date() } });
    const conflict = await db.fantasyPlayerPrice.create({ data: { ...f.scope, contestId: f.price.contestId, playerId: f.ids[1],
      playerName: 'Jorg Schreuders alternative entry', normalizedName: 'jorg schreuders alternative entry', fotmobPlayerName: 'jorg schreuders',
      providerBirthDate: new Date('2004-09-10'), price: 5, lastSeenAt: new Date() } });
    await db.providerEntityMap.create({ data: { provider: 'SPORTS_RU', contestId: f.price.contestId, providerSeason: f.scope.season,
      providerEntityType: 'FANTASY_PLAYER_PRICE', providerEntityId: conflict.id, internalEntityType: 'PLAYER', internalEntityId: String(f.ids[1]), status: 'MATCHED' } });
    await assert.rejects(applyProbableLineupTeamPlan(db, f.plan, new Date(), undefined, f.persist,
      tx => restoreSorareRosterMembers(tx, f.scope, [f.repair])), /corroboration changed/);
    await db.providerEntityMap.deleteMany({ where: { providerEntityId: conflict.id } });
    await db.fantasyPlayerPrice.delete({ where: { id: conflict.id } });
    await assert.rejects(applyProbableLineupTeamPlan(db, f.plan, new Date(), async (change, tx) => {
      await enqueueCurrentXiTeamsSnapshotRefresh(tx, change); throw new Error('rollback after queue');
    }, f.persist, tx => restoreSorareRosterMembers(tx, f.scope, [f.repair])), /rollback after queue/);
    const member = await db.teamPlayerSeason.findUnique({ where: { leagueId_season_teamId_playerId: { ...f.scope, playerId: f.ids[1] } } });
    assert.equal(member?.active, false);
    assert.equal(member?.isStarter, false);
    assert.equal(await db.teamPlayerSeason.count({ where: { ...f.scope, isStarter: true } }), 11);
    assert.deepEqual((await db.leagueSeasonTeam.findUnique({ where: { leagueId_season_teamId: f.scope } }))?.metadata, { retained: true });
    assert.equal(await db.fantasyPlayerPoolRefreshRequest.count({ where: { leagueId: f.scope.leagueId, season: f.scope.season } }), 0);
    assert.equal(await db.providerEntityMap.count({ where: { providerEntityId: f.repair.source.id } }), 0);
  } finally { await f.cleanup(); }
});
