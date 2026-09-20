/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { parseKhlProtocol } from '@/providers/khl-mobile/protocol';
import { readFileSync } from 'node:fs';
import { summarizeProtocolArchive } from '@/khl/protocol-archive';
import { projectHistory, summarizeHockeyHistory } from '@/khl/history-projection';
import { protocolOnlyHistory } from './protocol-archive-import';
import { importHistoricalSeason } from './historical-season';

const now = new Date('2026-09-20T12:00:00Z');
const row = parseKhlProtocol(readFileSync('src/providers/khl-mobile/fixtures/protocol-902038.json', 'utf8'), '902038', '1436').rows.find(r => r.officialPlayerId === '44956')!;
const entry = summarizeProtocolArchive({ officialPlayerId: row.officialPlayerId, officialSeasonId: '1369', rows: [{ matchId: '897001', row }], observedAt: now.toISOString() });
const fallback = protocolOnlyHistory(entry, '2025/2026');

test('official-only archive fills real statistics without invented fantasy points or appearance denominator', () => {
  assert.equal(fallback.games, 1);
  assert.equal(fallback.totals.toiSeconds.value, 1192);
  assert.deepEqual(fallback.officialFp, { sum: 0, count: 0 });
  const played = { ...row, points: 5 };
  const current = summarizeHockeyHistory([played, { ...played, participationStatus: 'DNP' }], '2026/2027', 'Sports');
  const projected = projectHistory({ position: 'D', current, previous: fallback, pairedGoals: 0, pairedShots: 1, leagueGoals: 0, leagueShots: 1 })!;
  assert.equal(projected.appearanceRate, 0.5);
  assert.equal(projected.details!.appearance.previousCount, 0);
  assert.equal(projected.details!.rates.officialFp.previousCount, 0);
});

test('official archive creates a missing history, deduplicates, and cannot replace recovered Sports FP', async () => {
  type Stored = { id: string; providerSeasonId: string; source: string; contentHash: string; aggregates: typeof fallback };
  let stored: Stored | null = null;
  let revisions = 0;
  const tx = {
    $queryRaw: async () => [],
    khlFantasyPlayer: { findMany: async () => [{ contestId: 'contest' }] },
    khlExternalEntityMap: { findUnique: async () => ({ playerId: 'player' }) },
    khlContest: { updateMany: async () => { revisions++; } },
    khlHistoricalSeason: {
      findUnique: async () => stored,
      upsert: async (q: { create: NonNullable<typeof stored>; update: NonNullable<typeof stored> }) => { stored = { ...(stored ?? { id: 'history' }), ...(stored ? q.update : q.create) }; },
      update: async () => {}, findMany: async () => [],
    },
  };
  const db = { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as PrismaClient;
  const input = { playerId: 'player', providerSeasonId: '1369', aggregates: fallback, observedAt: now, protocolOnly: true };
  assert.equal(await importHistoricalSeason(db, input), true);
  assert.equal(await importHistoricalSeason(db, input), false);
  assert.equal(revisions, 1);
  const sports = summarizeHockeyHistory([{ ...row, points: 7 }], '2025/2026', 'https://www.sports.ru/fantasy/hockey/player/info/107/1.html?s=1317639');
  assert.equal(await importHistoricalSeason(db, { ...input, protocolOnly: false, providerSeasonId: '1317639', aggregates: sports }), true);
  assert.equal(await importHistoricalSeason(db, input), false);
  const saved = stored! as Stored;
  assert.equal(saved.source, sports.source);
  assert.equal(saved.providerSeasonId, '1317639');
  assert.equal(saved.aggregates.officialFp.sum, 7);
  assert.equal(saved.aggregates.protocolStats!.totals.toiSeconds.value, 1192);
  await assert.rejects(importHistoricalSeason(db, { ...input, aggregates: { ...fallback, officialFp: { sum: 7, count: 1 } } }), /AGGREGATES_INVALID/);
  await assert.rejects(importHistoricalSeason(db, { ...input, playerId: 'foreign' }), /IDENTITY_INVALID/);
});
