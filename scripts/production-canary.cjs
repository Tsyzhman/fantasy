/** @spec spec://common/INFRA-006-continuous-deployment#acceptance */
const { PrismaClient } = require('@prisma/client');
const { randomBytes, createHash } = require('node:crypto');
const db = new PrismaClient();
(async () => {
  let session;
  try {
    const user = await db.user.findFirstOrThrow({ where: { isActive: true }, select: { id: true } });
    const token = randomBytes(32).toString('base64url');
    session = await db.userSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 300000) } });
    const contest = await db.fantasyContest.findFirstOrThrow({ where: { provider: 'SPORTS_RU', leagueId: 63n, season: '2026/2027' }, select: { leagueId: true, season: true } });
    const query = new URLSearchParams({ leagueId: String(contest.leagueId), season: contest.season, progressive: '1', cursor: '0', stage: 'BASE', batchSize: '20' });
    const routes = ['/machete/squad?leagueId=63', `/api/machete/squads/snapshot?${query}`, `/api/machete/squads?${query}`];
    for (const path of routes) {
      const response = await fetch(`http://127.0.0.1:3000${path}`, { headers: { Cookie: `fantasy_session=${token}`, 'User-Agent': 'fantasy-scout-canary/1.0' }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
      const bytes = (await response.arrayBuffer()).byteLength;
      if (!response.ok || bytes === 0) throw new Error(`CANARY_DOMAIN_${response.status}_${path.split('?')[0]}`);
      console.log(JSON.stringify({ domainCanary: path.split('?')[0], status: response.status, bytes, commit: process.env.APP_RELEASE_COMMIT }));
    }
  } finally { if (session) await db.userSession.delete({ where: { id: session.id } }); await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
