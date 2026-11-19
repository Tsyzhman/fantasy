/** @spec spec://modules/agents/FEAT-017-squad-workflows#squads */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { AgentActor, AgentScope } from "@/server/agent-api/contract";
import { callAgentTool, listAgentTools } from "@/server/agent-api/dispatch";
import { authenticateAgentKey, createAgentKey, revokeAgentKey } from "@/server/agent-api/keys";
import type { Preview } from "./transfers";
import { seedWorkflowSquad } from "./workflow-test-fixture";
import { saveSquad } from "./workflows";

const isCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
async function issue(userId: string, scopes: AgentScope[]) {
  const { secret } = await createAgentKey(userId, { name: "WI-008 QA", scopes, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  return authenticateAgentKey(new Request("http://localhost/api/v1/agent/tools", { headers: { authorization: "Bearer " + secret } }));
}
function invoke<T>(actor: AgentActor, name: string, input: Record<string, unknown>): Promise<T> {
  return callAgentTool(actor, "http", name, () => input) as Promise<T>;
}

test("a squad-only key previews and saves explicit moves exactly once", { skip: !process.env.DATABASE_URL }, async t => {
  const [owner, other] = await Promise.all(["owner", "other"].map(label => prisma.user.create({
    data: { email: `${label}-squad-save-${randomUUID()}@example.invalid` }
  })));
  t.after(() => prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }).then(() => undefined));
  const { squadId, moves, cleanup } = await seedWorkflowSquad(prisma, owner.id);
  t.after(cleanup);
  const [editor, reader, outsider] = await Promise.all([
    issue(owner.id, ["squads:read", "squads:write"]), issue(owner.id, ["squads:read"]), issue(other.id, ["squads:read", "squads:write"])
  ]);
  const tools = await listAgentTools(editor, "http");
  assert.deepEqual(tools.map(tool => tool.name).sort(), ["squads_get", "squads_list", "squads_preview", "squads_propose", "squads_save"]);
  assert.equal((await listAgentTools(reader, "http")).some(tool => tool.name === "squads_save"), false);
  const { squadVersion } = await invoke<{ squadVersion: string }>(editor, "squads_get", { squadId });
  const preview = await invoke<Preview>(editor, "squads_preview", { squadId, moves });
  assert.equal(preview.accepted, true);
  const input = { squadId, moves, expectedSquadVersion: squadVersion, idempotencyKey: "personal-save" };
  await assert.rejects(invoke(reader, "squads_save", input), isCode("FORBIDDEN"));
  await assert.rejects(invoke(outsider, "squads_save", input), isCode("NOT_FOUND"));
  await assert.rejects(invoke(editor, "squads_save", { ...input, moves: [...moves, moves[0]] }), isCode("INVALID_ARGUMENTS"));
  const original = await prisma.userFantasySquad.findUniqueOrThrow({ where: { id: squadId }, include: { players: { orderBy: { id: "asc" } } } });
  const faulty = prisma.$extends({ query: { agentSquadSave: { async create() { throw new Error("receipt failure"); } } } });
  await assert.rejects(saveSquad(faulty as unknown as PrismaClient, editor, input), /receipt failure/);
  assert.deepEqual(await prisma.userFantasySquad.findUniqueOrThrow({ where: { id: squadId }, include: { players: { orderBy: { id: "asc" } } } }), original);
  assert.equal(await prisma.agentSquadSave.count({ where: { userId: owner.id } }), 0);

  type Saved = { saveId: string; saved: boolean; squadVersionAfter: string; preview: Preview };
  const [first, simultaneous] = await Promise.all([invoke<Saved>(editor, "squads_save", input), invoke<Saved>(editor, "squads_save", input)]);
  assert.ok(first.saveId);
  assert.equal(first.saved, true);
  assert.deepEqual(first.preview, previewFields(preview));
  assert.deepEqual(first, simultaneous);
  assert.deepEqual(await invoke(editor, "squads_save", input), first);
  assert.deepEqual((await prisma.userFantasySquadPlayer.findMany({ where: { squadId }, orderBy: { slotIndex: "asc" }, select: { playerId: true } }))
    .map(player => String(player.playerId)), preview.after?.players.map(player => player.playerId));
  assert.equal(await prisma.agentSquadSave.count({ where: { userId: owner.id } }), 1);
  assert.equal(await prisma.agentWorkflow.count({ where: { userId: owner.id } }), 0);
  assert.equal(await prisma.agentWorkflowRun.count({ where: { userId: owner.id } }), 0);
  await assert.rejects(invoke(editor, "squads_save", { ...input, moves: moves.slice(0, 1) }), isCode("IDEMPOTENCY_CONFLICT"));
  await assert.rejects(invoke(editor, "squads_save", { ...input, idempotencyKey: "stale" }), isCode("SQUAD_VERSION_CONFLICT"));
  const rejected = await invoke<Saved>(editor, "squads_save", { ...input, expectedSquadVersion: first.squadVersionAfter, idempotencyKey: "already-replaced" });
  assert.equal(rejected.saved, false);
  assert.equal(rejected.preview.reasons[0].code, "PLAYER_NOT_IN_SQUAD");
  assert.equal(rejected.squadVersionAfter, first.squadVersionAfter);
  await revokeAgentKey(owner.id, editor.keyId);
  await assert.rejects(invoke(editor, "squads_save", input), isCode("UNAUTHORIZED"));
});

function previewFields(preview: Preview) {
  const { accepted, horizon, moves, before, after, delta, reasons, transfersByRound } = preview;
  return { accepted, horizon, moves, before, after, delta, reasons, transfersByRound };
}
