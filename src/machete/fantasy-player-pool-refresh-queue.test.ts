import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { FantasyPlayerPoolRefreshRequest, Prisma, PrismaClient } from "@prisma/client";

import {
  drainCurrentXiTeamSnapshotRefreshQueue,
  enqueueCurrentXiTeamsSnapshotRefresh,
  fantasyPlayerPoolRefreshRetryDelayMs
} from "./fantasy-player-pool-refresh-queue";

test("enqueue deduplicates a mass-import team list into one atomic upsert without calculating", async () => {
  const queries: Prisma.Sql[] = [];
  const prisma = { $executeRaw: async (query: Prisma.Sql) => { queries.push(query); return 2; } } as unknown as PrismaClient;
  await enqueueCurrentXiTeamsSnapshotRefresh(prisma, { leagueId: 48n, season: "2026/2027", teamIds: [] });
  assert.equal(queries.length, 0);
  await enqueueCurrentXiTeamsSnapshotRefresh(prisma, { leagueId: 48n, season: "2026/2027", teamIds: [20n, 10n, 20n] });
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /ON CONFLICT \("league_id", "season", "team_id"\) DO UPDATE/);
  assert.match(queries[0].text, /"request_token" = EXCLUDED\."request_token"/);
  assert.match(queries[0].text, /"attempts" = 0/);
  assert.deepEqual(queries[0].values.filter((value) => value === 10n || value === 20n), [10n, 20n]);
  const source = readFileSync(new URL("./fantasy-player-pool-refresh-queue.ts", import.meta.url), "utf8");
  const enqueueSource = source.slice(source.indexOf("export async function enqueue"), source.indexOf("export async function drain"));
  assert.doesNotMatch(enqueueSource, /refreshCurrentXiTeams|loadFantasySquadPlanner|setTimeout/);
});

test("worker groups teams by league and season and drains only a bounded batch", async () => {
  const mock = queueMock([request("a", 48n, 10n), request("b", 48n, 20n), request("c", 55n, 30n)]);
  const calls: Array<{ leagueId: bigint; season: string; teamIds: bigint[] }> = [];
  const result = await drainCurrentXiTeamSnapshotRefreshQueue(mock.prisma, async (_prisma, input) => {
    calls.push(input);
    return { id: "ready" };
  });
  assert.deepEqual(calls, [
    { leagueId: 48n, season: "2026/2027", teamIds: [10n, 20n] },
    { leagueId: 55n, season: "2026/2027", teamIds: [30n] }
  ]);
  assert.deepEqual(result, { requests: 3, scopes: 2, completed: 3, failed: 0 });
  assert.equal(mock.rows.size, 0);
});

test("a new flag event arriving during a calculation survives acknowledgment even at the same timestamp", async () => {
  const mock = queueMock([request("a", 48n, 10n)]);
  const result = await drainCurrentXiTeamSnapshotRefreshQueue(mock.prisma, async () => {
    mock.rows.get("a")!.requestToken = "a:new-event";
    return { id: "ready" };
  });
  assert.equal(result.completed, 0);
  assert.equal(mock.rows.get("a")?.requestToken, "a:new-event");
  await drainCurrentXiTeamSnapshotRefreshQueue(mock.prisma, async () => ({ id: "new-ready" }));
  assert.equal(mock.rows.size, 0);
});

test("failed calculations retain requests with backoff and do not overwrite a newer event", async () => {
  const mock = queueMock([request("a", 48n, 10n), request("b", 48n, 20n)]);
  const before = Date.now();
  const result = await drainCurrentXiTeamSnapshotRefreshQueue(mock.prisma, async () => {
    mock.rows.get("b")!.requestToken = "b:new-event";
    throw new Error("XI changed during calculation");
  });
  assert.equal(result.failed, 2);
  assert.equal(result.completed, 0);
  assert.equal(mock.rows.get("a")?.attempts, 1);
  assert.match(mock.rows.get("a")!.lastError!, /XI changed/);
  assert.ok(mock.rows.get("a")!.availableAt.getTime() >= before + 5_000);
  assert.equal(mock.rows.get("b")?.attempts, 0);
  assert.equal(mock.rows.get("b")?.lastError, null);
  assert.equal(mock.rows.size, 2);
  assert.deepEqual([0, 1, 2, 6, 30].map(fantasyPlayerPoolRefreshRetryDelayMs), [5_000, 10_000, 20_000, 300_000, 300_000]);
});

test("future retries do not run until available and an empty queue does no computation", async () => {
  const pending = request("a", 48n, 10n);
  pending.availableAt = new Date(Date.now() + 60_000);
  const mock = queueMock([pending]);
  const result = await drainCurrentXiTeamSnapshotRefreshQueue(mock.prisma, async () => assert.fail("unexpected calculation"));
  assert.deepEqual(result, { requests: 0, scopes: 0, completed: 0, failed: 0 });
  assert.equal(mock.rows.size, 1);
});

test("manual and imported XI enqueue with their transaction client; no heavy refresh in web writers", () => {
  const manual = readFileSync(new URL("../app/api/machete/team-player-seasons/starter/route.ts", import.meta.url), "utf8");
  assert.match(manual, /await enqueueCurrentXiTeamsSnapshotRefresh\(tx,/);
  assert.ok(manual.indexOf("await enqueueCurrentXiTeamsSnapshotRefresh(tx,") < manual.indexOf("return { row, changed }"));
  assert.doesNotMatch(manual, /refreshCurrentXiTeamsSnapshot|fantasy-player-pool-snapshots/);
  for (const name of ["probable-lineup-sync.ts", "starting-xi-from-match.ts"]) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.match(source, /await (?:input\.)?onTeamsChanged\?\.\([^\n]+, tx\)/);
  }
});

function request(id: string, leagueId: bigint, teamId: bigint): FantasyPlayerPoolRefreshRequest {
  const now = new Date(Date.now() - 2_000);
  return {
    id, leagueId, season: "2026/2027", teamId, requestToken: `${id}:initial`,
    requestedAt: now, availableAt: now, attempts: 0, lastError: null, createdAt: now, updatedAt: now
  };
}

function queueMock(initial: FantasyPlayerPoolRefreshRequest[]) {
  const rows = new Map(initial.map((row) => [row.id, row]));
  type Event = Pick<FantasyPlayerPoolRefreshRequest, "id" | "requestToken">;
  const matches = (row: FantasyPlayerPoolRefreshRequest, event: Event) => row.id === event.id && row.requestToken === event.requestToken;
  const prisma = {
    fantasyPlayerPoolRefreshRequest: {
      findMany: async ({ where, take }: { where: { availableAt: { lte: Date } }; take: number }) => {
        assert.equal(take, 200);
        return [...rows.values()].filter((row) => row.availableAt <= where.availableAt.lte).slice(0, take).map((row) => ({ ...row }));
      },
      deleteMany: async ({ where }: { where: { OR: Event[] } }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (where.OR.some((event) => matches(row, event))) { rows.delete(row.id); count += 1; }
        }
        return { count };
      },
      updateMany: async ({ where, data }: { where: Event; data: Partial<FantasyPlayerPoolRefreshRequest> }) => {
        const row = rows.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }
    }
  } as unknown as PrismaClient;
  return { prisma, rows };
}
