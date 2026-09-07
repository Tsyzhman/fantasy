/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { syncFplPrices } from "./fpl-price-sync";
import { FplPublicClient, type FplBootstrap } from "@/lib/providers/fpl";

test("sync writes FPL ownership on create and update, repairs old format and deduplicates current runs", async () => {
  const now = new Date("2026-09-07T10:00:00Z");
  const bootstrap: FplBootstrap = { fetchedAt: now, events: [{ id: 1, name: "GW1", deadlineTime: new Date("2026-09-10"), finished: false, isPrevious: false, isCurrent: false, isNext: true, released: true, dataChecked: false }],
    teams: [{ id: 1, name: "Arsenal", shortName: "ARS", code: 3 }], elements: [0, 1].map((i) => ({ id: i + 1, code: i + 100, teamId: 1, elementType: 3, webName: `P${i}`, firstName: "Player", secondName: String(i), nowCost: 50,
      status: "a", chanceOfPlayingThisRound: null, selectedByPercent: i === 0 ? 0 : 100, photo: null })), elementTypes: [], chips: [], gameConfig: {} };
  const client = new FplPublicClient();
  client.getBootstrap = async () => bootstrap;
  client.getFixtures = async () => [{ id: 1, event: 1, homeTeamId: 1, awayTeamId: 2, kickoffTime: new Date("2026-09-11"), started: false, finished: false, provisionalStartTime: false }];
  const prices = new Map<string, Record<string, unknown>>();
  const succeeded = new Set<string>();
  let currentKey = "";
  const empty = { findMany: async () => [], findUnique: async () => null, upsert: async () => ({ id: "row" }), update: async () => ({}), updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) };
  const tx = {
    $executeRaw: async () => 1,
    fantasyContest: { ...empty, upsert: async () => ({ id: "contest" }) },
    fantasyProviderSyncRun: { ...empty,
      findUnique: async ({ where }: { where: { provider_contestId_idempotencyKey: { idempotencyKey: string } } }) => {
        const key = where.provider_contestId_idempotencyKey.idempotencyKey;
        return succeeded.has(key) || key.endsWith(":provider-schedule-v3") ? { status: "SUCCEEDED" } : null;
      },
      upsert: async ({ create }: { create: { idempotencyKey: string } }) => { currentKey = create.idempotencyKey; return { id: "run" }; },
      update: async () => { succeeded.add(currentKey); return {}; }
    },
    fantasyPlayerPrice: { ...empty, upsert: async ({ where, create, update }: { where: { contestId_providerPlayerId: { providerPlayerId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.contestId_providerPlayerId.providerPlayerId;
      prices.set(key, { ...(prices.get(key) ?? create), ...(prices.has(key) ? update : {}) });
    } },
    providerEntityMap: empty, coreTeam: empty, leagueSeasonTeam: empty, corePlayer: empty, teamPlayerSeason: empty,
    coreMatch: empty, fantasyProviderFixture: empty, fantasyProviderRound: empty, fantasyPlayerPriceSnapshot: empty, fantasyChipDefinition: empty, fantasyRuleset: empty
  };
  const db = { $transaction: async (operation: (value: unknown) => Promise<unknown>) => operation(tx) } as unknown as PrismaClient;
  assert.equal((await syncFplPrices(db, { client, now })).status, "SYNCED");
  assert.equal(prices.get("1")?.selectedByPercent, 0);
  assert.equal(prices.get("2")?.selectedByPercent, 100);
  assert.equal((await syncFplPrices(db, { client, now })).status, "SKIPPED");
  bootstrap.elements[0].selectedByPercent = 24.5;
  assert.equal((await syncFplPrices(db, { client, now })).status, "SYNCED");
  assert.equal(prices.get("1")?.selectedByPercent, 24.5);
  assert.equal(prices.size, bootstrap.elements.length);
  assert.equal(succeeded.size, 2);
});
