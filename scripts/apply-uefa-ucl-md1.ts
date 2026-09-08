/** @spec spec://modules/machete/FEAT-003-squad-player-card#root
 * One-off reviewed UEFA predictions, not confirmed match lineups.
 * Dry-run by default. Bundle with esbuild --external:@prisma/client for the worker.
 * Apply: node scripts/uefa-md1.cjs --apply --backup=/app/output/uefa-md1-before.json
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
import source from './data/uefa-ucl-md1-2026-09-08.json';
import { applyProbableLineupTeamPlan, type ProbableLineupTeamPlan } from '../src/machete/probable-lineup-sync';
import { loadSportsRuAuthoritativeStarterCandidate, setSportsRuPlayerMapping } from '../src/machete/sports_ru_player_mapping';
import { normalizeFantasyPosition } from '../src/machete/squad_logic';

const db = new PrismaClient();
const leagueId = BigInt(source.leagueId);
const season = source.season;
const scope = { leagueId, season };
const apply = process.argv.includes('--apply');
// Legal names/nicknames were checked against FotMob public profiles and Sports.ru DOB.
const priceBindings = [
  { providerId: '74544', playerId: 1387439n, teamId: 9773n, birthDate: '2003-09-29' },
  { providerId: '74045', playerId: 850356n, teamId: 9773n, birthDate: '1997-02-24' },
  { providerId: '74560', playerId: 611831n, teamId: 10235n, birthDate: '1996-10-19' },
  { providerId: '74851', playerId: 867080n, teamId: 10269n, birthDate: '1998-02-12' },
  { providerId: '73954', playerId: 1061249n, teamId: 9847n, birthDate: '2000-02-13' },
  { providerId: '74178', playerId: 288406n, teamId: 9906n, birthDate: '1995-09-20' },
  { providerId: '74003', playerId: 1199272n, teamId: 9875n, birthDate: '2003-02-04' }
];
const json = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? String(v) : v, 2);

async function main() {
  if (leagueId !== 42n || season !== '2026/2027' || source.teams.length !== 36) throw new Error('Unexpected source scope');
  const targetIds = source.teams.flatMap(t => t.players.map(p => BigInt(p.playerId)));
  if (new Set(targetIds.map(String)).size !== 396) throw new Error('Duplicate/missing target players');
  const [teams, roster, players, noahPrices] = await Promise.all([
    db.leagueSeasonTeam.findMany({ where: { ...scope, active: true }, include: { team: true } }),
    db.teamPlayerSeason.findMany({ where: scope }),
    db.corePlayer.findMany({ where: { id: { in: targetIds } } }),
    db.fantasyPlayerPrice.findMany({ where: { ...scope, provider: 'SPORTS_RU', providerPlayerId: '74263' } })
  ]);
  if (players.length !== 396 || teams.length !== 36) throw new Error('Catalog changed');
  const noah = noahPrices[0];
  if (noahPrices.length !== 1 || !noah || noah.providerBirthDate?.toISOString().slice(0,10) !== '2008-01-09'
    || (noah.playerId !== null && noah.playerId !== 1699551n)
    || (noah.teamId !== null && noah.teamId !== 8640n)) throw new Error('Noah Fernandez identity conflict');
  const noahNeedsMapping = noah.playerId === null || noah.teamId === null;
  const extraPrices = await db.fantasyPlayerPrice.findMany({ where: { ...scope, provider: 'SPORTS_RU', providerPlayerId: { in: priceBindings.map(b => b.providerId) } } });
  const priceRepairs = priceBindings.map(binding => {
    const matches = extraPrices.filter(p => p.providerPlayerId === binding.providerId);
    const price = matches[0];
    if (matches.length !== 1 || price.providerBirthDate?.toISOString().slice(0,10) !== binding.birthDate
      || (price.playerId !== null && price.playerId !== binding.playerId)
      || (price.teamId !== null && price.teamId !== binding.teamId)
      || !roster.some(r => r.active && r.teamId === binding.teamId && r.playerId === binding.playerId)) throw new Error(`Price identity conflict: ${binding.providerId}`);
    return { binding, price };
  }).filter(({ price }) => price.playerId === null || price.teamId === null);
  const memberships: Array<{ teamId: bigint; playerId: bigint; position: string }> = [];
  const plans: ProbableLineupTeamPlan[] = [];
  for (const [index, team] of source.teams.entries()) {
    const teamId = BigInt(team.teamId);
    const activeTeam = teams.find(t => t.teamId === teamId);
    if (!activeTeam || team.players.length !== 11) throw new Error(`Invalid team ${team.teamName}`);
    const positions: string[] = [];
    for (const player of team.players) {
      const playerId = BigInt(player.playerId);
      const core = players.find(p => p.id === playerId);
      if (core?.name !== player.resolvedName) throw new Error(`Identity changed: ${player.resolvedName} -> ${core?.name}`);
      const existing = roster.find(r => r.teamId === teamId && r.playerId === playerId && r.active);
      if (existing) {
        positions.push(normalizeFantasyPosition(existing.position) ?? '');
      } else {
        const verified = playerId === 1699551n && teamId === 8640n && noahNeedsMapping
          ? { position: noah.position }
          : await loadSportsRuAuthoritativeStarterCandidate(db, { ...scope, seasons: [season], teamId, playerId });
        if (!verified?.position) throw new Error(`Unverified roster: ${team.teamName}/${player.sourceName}`);
        memberships.push({ teamId, playerId, position: verified.position });
        positions.push(normalizeFantasyPosition(verified.position) ?? '');
      }
    }
    if (positions[0] !== 'GK' || positions.filter(p => p === 'GK').length !== 1) throw new Error(`Invalid GK count: ${team.teamName}`);
    const currentStarterIds = roster.filter(r => r.teamId === teamId && r.isStarter).map(r => r.playerId);
    const targetPlayerIds = team.players.map(p => BigInt(p.playerId));
    const startersToSet = targetPlayerIds.filter(p => !currentStarterIds.includes(p)).length;
    const startersToClear = currentStarterIds.filter(p => !targetPlayerIds.includes(p)).length;
    const fetchedAt = new Date();
    plans.push({
      source: 'UEFA', sourceUrl: source.sourceUrl, ...scope, leagueName: 'Champions League', fetchedAt,
      sourceLineup: {
        source: 'UEFA', sourceUrl: source.sourceUrl, sourceTeamCode: null, sourceFixtureId: null,
        teamName: team.teamName, opponentName: source.teams[index % 2 ? index-1 : index+1].teamName,
        venue: index % 2 ? 'AWAY' : 'HOME', formation: null, sourceUpdatedText: source.sourceUpdatedText,
        players: team.players.map(p => ({ name: p.sourceName, fullName: p.resolvedName, providerCode: null, shirtNumber: null }))
      },
      teamId, databaseTeamName: activeTeam.team.name, teamMatchedBy: 'NAME', teamConfidence: 1,
      status: startersToSet || startersToClear ? 'READY' : 'UNCHANGED', playerResolutions: [],
      currentStarterIds, targetPlayerIds, startersToSet, startersToClear, problems: []
    });
  }
  console.log(json({ apply, noahNeedsMapping, priceRepairs: priceRepairs.length, memberships: memberships.length,
    teams: plans.map(p => ({ team: p.databaseTeamName, set: p.startersToSet, clear: p.startersToClear, status: p.status })) }));
  if (!apply) return;
  const backup = process.argv.find(a => a.startsWith('--backup='))?.slice(9);
  if (!backup) throw new Error('--backup=PATH is required for apply');
  const maps = await db.providerEntityMap.findMany({ where: { provider: 'SPORTS_RU', providerEntityId: { in: [noah.id, ...extraPrices.map(p => p.id)] } } });
  await writeFile(backup, json({ createdAt: new Date(), source, teams, roster, noah, extraPrices, maps, memberships }), { flag: 'wx' });
  console.log(`Backup: ${backup}`);
  if (noahNeedsMapping) await setSportsRuPlayerMapping(db, { priceId: noah.id, contestId: noah.contestId, playerId: 1699551n, teamId: 8640n, lockTeam: true });
  for (const { binding, price } of priceRepairs) await setSportsRuPlayerMapping(db, {
    priceId: price.id, contestId: price.contestId, playerId: binding.playerId, teamId: binding.teamId, lockTeam: true
  });
  for (const plan of plans) {
    const teamId = plan.teamId!;
    const missing = memberships.filter(m => m.teamId === teamId);
    if (missing.length) await db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`starting-xi:${leagueId}:${season}:${teamId}`}))`);
      for (const member of missing) {
        const verified = await loadSportsRuAuthoritativeStarterCandidate(tx, { leagueId, seasons: [season], teamId, playerId: member.playerId });
        if (!verified) throw new Error('Sports.ru mapping changed after planning');
        await tx.teamPlayerSeason.updateMany({ where: { ...scope, playerId: member.playerId, teamId: { not: teamId }, active: true }, data: { active: false, isStarter: false } });
        await tx.teamPlayerSeason.upsert({
          where: { leagueId_season_teamId_playerId: { ...scope, teamId, playerId: member.playerId } },
          create: { ...scope, ...member, source: 'sports.ru', active: true, isStarter: false },
          update: { active: true, source: 'sports.ru', position: member.position }
        });
      }
    });
    const result = await applyProbableLineupTeamPlan(db, plan);
    // Existing XI may already equal the prediction; still record its source once.
    if (result.status === 'UNCHANGED') await db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`starting-xi:${leagueId}:${season}:${teamId}`}))`);
      const row = await tx.leagueSeasonTeam.findUniqueOrThrow({ where: { leagueId_season_teamId: { ...scope, teamId } } });
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
      const previous = metadata.probableLineup as { sourceUrl?: string } | undefined;
      if (previous?.sourceUrl !== source.sourceUrl) await tx.leagueSeasonTeam.update({
        where: { leagueId_season_teamId: { ...scope, teamId } },
        data: { metadata: { ...metadata, probableLineup: { source: 'UEFA', sourceUrl: source.sourceUrl,
          sourceUpdatedText: source.sourceUpdatedText, appliedAt: new Date().toISOString(), fetchedAt: plan.fetchedAt.toISOString(),
          formation: null, opponentName: plan.sourceLineup.opponentName, venue: plan.sourceLineup.venue,
          players: plan.sourceLineup.players.map(p => ({ name: p.name, providerCode: null, shirtNumber: null })) } } }
      });
    });
    console.log(json(result));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
