/** @spec spec://modules/agents/FEAT-017-squad-workflows#acceptance */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { agentScopes, type AgentActor } from "@/server/agent-api/contract";
import { agentOperations } from "./operations";
import type { Preview } from "./transfers";
import { runWorkflow } from "./workflows";
import { seedWorkflowSquad } from "./workflow-test-fixture";

type Draft = { workflowId: string; version: number; name: string; steps: unknown[]; publishedAt: string | null };
type Outcome = { result: { status: string; saved: boolean; squadVersionAfter: string; preview: Preview; steps: { action: string; status: string }[] } };
type Run = Outcome & { runId: string; version: number };
function hasCode(code: string) {
  return (error: unknown) => error instanceof ApiError && error.code === code;
}
function call<T>(actor: AgentActor, name: string, input: Record<string, unknown>): Promise<T> {
  const operation = agentOperations.find(entry => entry.name === name);
  assert.ok(operation);
  return operation.execute(actor, input) as Promise<T>;
}

test("personal workflow versions, authorization, preview and atomic retries on PostgreSQL", { skip: !process.env.DATABASE_URL }, async t => {
  const users = await Promise.all(["owner", "other"].map(tag => prisma.user.create({
    data: { email: `agent-workflow-${tag}-${randomUUID()}@example.invalid` }
  })));
  t.after(() => prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }).then(() => undefined));
  const [owner, other] = users.map(user => ({ user, keyId: "test", scopes: agentScopes }));
  const fixture = await seedWorkflowSquad(prisma, owner.user.id);
  t.after(fixture.cleanup);
  const { squadId, moves } = fixture;
  const readSquad = () => prisma.userFantasySquad.findUniqueOrThrow({ where: { id: squadId }, include: { players: { orderBy: { slotIndex: "asc" } } } });
  const before = await readSquad();
  const args = { squadId };
  const squad = await call<{ squadVersion: string }>(owner, "squads_get", args);
  const { squadVersion: expectedSquadVersion } = squad;

  await t.test("owner-only discovery, live price and two server forecasts", async () => {
    const list = await call<{ items: { id: string }[] }>(owner, "squads_list", { query: fixture.name, limit: 1 });
    assert.deepEqual(list.items.map(entry => entry.id), [squadId]);
    assert.deepEqual(await call(other, "squads_list", {}), { items: [], nextCursor: null });
    await assert.rejects(call(other, "squads_get", args), hasCode("NOT_FOUND"));
    await assert.rejects(call(other, "squads_propose", args), hasCode("NOT_FOUND"));
    await assert.rejects(call(other, "squads_preview", { ...args, moves }), hasCode("NOT_FOUND"));
    const direct = await call<Preview>(owner, "squads_propose", { squadId, maxTransfers: 2, horizon: 1 });
    assert.equal(direct.accepted, true, JSON.stringify(direct.reasons));
    assert.ok(direct.moves.length > 0 && direct.moves.length <= 2);
    const preview = await call<Preview>(owner, "squads_preview", { squadId, moves, horizon: 1 });
    assert.equal(preview.accepted, true, JSON.stringify(preview.reasons));
    assert.equal(preview.delta?.projectedNext, 16);
    assert.equal(preview.before.bank, 25);
    assert.equal(preview.after?.bank, 25);
    assert.deepEqual(await readSquad(), before);
    await prisma.fantasyPlayerPrice.updateMany({ where: { contestId: fixture.contestId, playerId: fixture.athletes[15].id }, data: { price: 40 } });
    const refused = await call<Preview>(owner, "squads_preview", { squadId, moves: moves.slice(0, 1) });
    assert.equal(refused.accepted, false);
    assert.match(refused.reasons[0].message, /Budget exceeded/);
    await prisma.fantasyPlayerPrice.updateMany({ where: { contestId: fixture.contestId, playerId: fixture.athletes[15].id }, data: { price: 6 } });
  });

  const steps = [{ action: "squads_get" }, { action: "squads_propose", maxTransfers: 2 }, { action: "squads_preview" }, { action: "squads_save" }];
  const draft = await call<Draft>(owner, "workflows_create", { name: "Transfers", squadId, steps });
  const { workflowId } = draft;
  const key = { workflowId, version: 1 };
  const runArgs = { ...key, expectedSquadVersion, idempotencyKey: "apply-once" };
  const limited: AgentActor = { ...owner, scopes: ["squads:read", "workflows:test", "workflows:run"] };
  const newSteps = [{ action: "squads_preview", moves: moves.slice(0, 1) }, { action: "squads_save" }];
  await t.test("draft compare-and-swap, reopening, dry run and publishing immutable definitions", async () => {
    assert.deepEqual(draft.steps, steps);
    assert.deepEqual(await call(owner, "workflows_get", { workflowId }), draft);
    await assert.rejects(call(owner, "workflows_run", runArgs), hasCode("WORKFLOW_NOT_PUBLISHED"));
    const edits = await Promise.allSettled([0, 1].map(() => call<Draft>(owner, "workflows_update", {
      workflowId, expectedVersion: 1, name: "Updated", steps: newSteps
    })));
    assert.equal(edits.filter(edit => edit.status === "fulfilled").length, 1);
    const conflict = edits.find(edit => edit.status === "rejected");
    assert.ok(conflict && hasCode("WORKFLOW_VERSION_CONFLICT")(conflict.reason));
    assert.equal((await call<Draft>(owner, "workflows_get", { workflowId })).version, 2);
    assert.deepEqual((await call<Draft>(owner, "workflows_get", key)).steps, steps);
    const dry = await call<Outcome>(limited, "workflows_test", { ...key, expectedSquadVersion });
    assert.equal(dry.result.saved, false);
    assert.equal(dry.result.steps.at(-1)?.status, "simulated");
    assert.equal(dry.result.preview.accepted, true);
    assert.deepEqual(await readSquad(), before);
    assert.equal(await prisma.agentWorkflowRun.count({ where: { workflowId } }), 0);
    assert.ok((await call<Draft>(owner, "workflows_publish", key)).publishedAt);
    await call(owner, "workflows_publish", { workflowId, version: 2 });
    await assert.rejects(call(limited, "workflows_run", runArgs), hasCode("FORBIDDEN"));
    for (const name of ["workflows_get", "workflows_publish", "workflows_test"]) {
      await assert.rejects(call(other, name, key), hasCode("NOT_FOUND"));
    }
    await assert.rejects(call(other, "workflows_run", runArgs), hasCode("NOT_FOUND"));
    await assert.rejects(call(other, "workflows_update", { workflowId, expectedVersion: 2, name: "Other" }), hasCode("NOT_FOUND"));
    await assert.rejects(call(other, "workflows_create", { name: "Other", squadId, steps }), hasCode("NOT_FOUND"));
    await assert.rejects(call(other, "workflows_list_runs", { workflowId }), hasCode("NOT_FOUND"));
  });

  await t.test("a result-write failure rolls back the squad and leaves the request retryable", async () => {
    const failure = new Error("injected result persistence failure");
    const faulty = prisma.$extends({ query: { agentWorkflowRun: { async create() { throw failure; } } } });
    await assert.rejects(runWorkflow(faulty as unknown as PrismaClient, owner, runArgs), failure);
    assert.deepEqual(await readSquad(), before);
    assert.equal(await prisma.agentWorkflowRun.count({ where: { workflowId } }), 0);
  });

  await t.test("a market change after planning and a child-only roster edit both prevent the write", async () => {
    let reads = 0;
    const repriced = prisma.$extends({ query: { agentWorkflowRun: { async findUnique({ args, query }) {
      if (++reads === 2) await prisma.fantasyPlayerPrice.updateMany({
        where: { contestId: fixture.contestId }, data: { price: { increment: 1 } }
      });
      return query(args);
    } } } });
    await assert.rejects(runWorkflow(repriced as unknown as PrismaClient, owner, runArgs), hasCode("SQUAD_DATA_CHANGED"));
    assert.deepEqual(await readSquad(), before);
    assert.equal(await prisma.agentWorkflowRun.count({ where: { workflowId } }), 0);
    await prisma.fantasyPlayerPrice.updateMany({ where: { contestId: fixture.contestId }, data: { price: { decrement: 1 } } });
    const player = before.players[0];
    await prisma.userFantasySquadPlayer.update({ where: { id: player.id }, data: { isLocked: true } });
    await assert.rejects(call(owner, "workflows_run", runArgs), hasCode("SQUAD_VERSION_CONFLICT"));
    await prisma.userFantasySquadPlayer.update({ where: { id: player.id }, data: { isLocked: player.isLocked } });
  });

  await t.test("two simultaneous retries commit one run of the requested version and preserve future plans", async () => {
    const [first, second] = await Promise.all([call<Run>(owner, "workflows_run", runArgs), call<Run>(owner, "workflows_run", runArgs)]);
    assert.deepEqual(first, second);
    assert.equal(first.version, 1);
    assert.equal(first.result.saved, true);
    assert.equal(first.result.steps[1].action, "squads_propose");
    assert.notEqual(first.result.squadVersionAfter, expectedSquadVersion);
    assert.equal(await prisma.agentWorkflowRun.count({ where: { workflowId } }), 1);
    const after = await readSquad();
    assert.equal(after.players.length, 15);
    const filters = after.filters as { roundPlans: typeof fixture.roundPlans; strategy: string; personalSetting: string; sportsPublicationId: string };
    assert.equal(filters.strategy, "upside");
    assert.equal(filters.personalSetting, "retained");
    assert.equal(filters.sportsPublicationId, "publication-1");
    assert.deepEqual(filters.roundPlans.slice(2), fixture.roundPlans.slice(2));
    assert.deepEqual(await call(owner, "workflows_run", runArgs), first);
    await assert.rejects(call(limited, "workflows_run", runArgs), hasCode("FORBIDDEN"));
    assert.deepEqual(await call(owner, "workflows_get_run", { runId: first.runId }), first);
    await assert.rejects(call(other, "workflows_get_run", { runId: first.runId }), hasCode("NOT_FOUND"));
    await assert.rejects(call(owner, "workflows_run", { ...runArgs, version: 2 }), hasCode("IDEMPOTENCY_CONFLICT"));
    await assert.rejects(call(owner, "workflows_run", { ...runArgs, idempotencyKey: "stale" }), hasCode("SQUAD_VERSION_CONFLICT"));
    const current = await call<{ squadVersion: string }>(owner, "squads_get", args);
    assert.equal(current.squadVersion, first.result.squadVersionAfter);
    await prisma.userFantasySquad.update({ where: { id: squadId }, data: { filters: { ...filters, sportsPublicationId: "publication-2" } } });
    await assert.rejects(call(owner, "workflows_run", { ...runArgs, expectedSquadVersion: current.squadVersion, idempotencyKey: "sports" }), hasCode("SQUAD_VERSION_CONFLICT"));
    assert.equal(await prisma.agentWorkflowRun.count({ where: { workflowId } }), 1);
  });
});
