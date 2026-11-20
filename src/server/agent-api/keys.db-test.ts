/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";
import { GET, POST } from "@/app/api/profile/agent-keys/route";
import { DELETE } from "@/app/api/profile/agent-keys/[id]/route";
import { ApiError } from "@/lib/api-handler";
import { requireBrowserExtensionUser } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-constants";
import { prisma } from "@/lib/db";
import { activeKeyLimit, authenticateAgentKey, createAgentKey, currentAgentActor, listAgentKeys, revokeAgentKey } from "./keys";

const skip = !process.env.DATABASE_URL;
const origin = "https://example.test";
const keyInput = () => ({ name: "Scout", scopes: ["squads:read"], expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const denied = (error: unknown) => error instanceof ApiError && error.status === 401;
after(() => prisma.$disconnect());

async function owner(t: TestContext) {
  const user = await prisma.user.create({ data: { email: `agent-keys-${randomUUID()}@example.invalid` } });
  t.after(() => prisma.user.delete({ where: { id: user.id } }));
  const token = randomBytes(32).toString("base64url");
  await prisma.userSession.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 86_400_000) } });
  return { id: user.id, cookie: `${sessionCookieName}=${token}`, token };
}

test("profile creates a secret once, filters keys by session owner and revokes only the selected key", { skip }, async t => {
  const alice = await owner(t), bob = await owner(t);
  const url = origin + "/api/profile/agent-keys";
  const issue = (cookie: string, requestOrigin: string, input = keyInput()) => POST(new Request(url, {
    method: "POST", headers: { cookie, origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(input)
  }));
  assert.equal((await issue(alice.cookie, "https://foreign.test")).status, 403);
  assert.equal((await issue(alice.cookie, origin, { ...keyInput(), scopes: ["invalid"] })).status, 400);
  assert.equal((await issue(alice.cookie, origin, { ...keyInput(), expiresAt: new Date(0).toISOString() })).status, 400);
  assert.equal((await issue(alice.cookie, origin, { ...keyInput(), expiresAt: "2099-02-31T12:00:00Z" })).status, 400);

  const response = await issue(alice.cookie, origin);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const { key, secret } = await response.json();
  assert.ok(/^fs_agent_[A-Za-z0-9_-]{43}$/.test(secret));
  const row = await prisma.agentKey.findUniqueOrThrow({ where: { id: key.id } });
  assert.ok(row.secretHash === hash(secret));
  assert.ok(!JSON.stringify(row).includes(secret));
  assert.equal(key.lastUsedAt, null);
  const external = new Request(origin, { headers: { authorization: `Bearer ${secret}` } });
  const actor = await authenticateAgentKey(external);
  assert.equal(actor.user.id, alice.id);
  assert.equal((await GET(external)).status, 401);
  assert.equal((await requireBrowserExtensionUser(external)).response?.status, 401);
  await assert.rejects(authenticateAgentKey(new Request(origin, { headers: { authorization: `Bearer ${alice.token}` } })), denied);

  const listed = await (await GET(new Request(url, { headers: { cookie: alice.cookie } }))).json();
  assert.equal(listed.keys.length, 1);
  assert.ok(listed.keys[0].lastUsedAt);
  assert.ok(Math.abs(Date.parse(listed.keys[0].lastUsedAt) - Date.now()) < 60_000);
  assert.ok(!JSON.stringify(listed).includes(secret) && !JSON.stringify(listed).includes(row.secretHash));
  assert.equal((await listAgentKeys(bob.id)).keys.length, 0);
  await assert.rejects(listAgentKeys(bob.id, key.id), (e: unknown) => e instanceof ApiError && e.code === "INVALID_CURSOR");
  const remove = (cookie: string) => DELETE(new Request(url + "/" + key.id, { method: "DELETE", headers: { cookie, origin } }),
    { params: Promise.resolve({ id: key.id }) });
  assert.equal((await remove(bob.cookie)).status, 404);
  assert.equal((await authenticateAgentKey(external)).user.id, alice.id);
  const sibling = await createAgentKey(alice.id, keyInput());
  assert.equal((await remove(alice.cookie)).status, 204);
  assert.equal((await remove(alice.cookie)).status, 204);
  await assert.rejects(authenticateAgentKey(external), denied);
  await assert.rejects(currentAgentActor(actor), denied);
  assert.equal((await authenticateAgentKey(new Request(origin, { headers: { authorization: `Bearer ${sibling.secret}` } }))).keyId, sibling.key.id);
  assert.equal((await listAgentKeys(alice.id)).keys.find(k => k.id === key.id)?.status, "revoked");
});

/** @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization */
test("current grants, franchise, active owner and expiration are checked at use", { skip }, async t => {
  const alice = await owner(t);
  const { secret, key } = await createAgentKey(alice.id, keyInput());
  const request = new Request(origin, { headers: { authorization: `Bearer ${secret}` } });
  const initial = await authenticateAgentKey(request);
  await prisma.user.update({ where: { id: alice.id }, data: { role: "ADMIN", franchise: "MACHETE" } });
  await prisma.agentKey.update({ where: { id: key.id }, data: { scopes: ["workflows:read"] } });
  const current = await currentAgentActor(initial);
  assert.equal(current.user.role, "ADMIN");
  assert.equal(current.user.franchise, "MACHETE");
  assert.deepEqual(current.scopes, ["workflows:read"]);
  await prisma.user.update({ where: { id: alice.id }, data: { isActive: false } });
  await assert.rejects(authenticateAgentKey(request), denied);
  await assert.rejects(currentAgentActor(initial), denied);
  await prisma.user.update({ where: { id: alice.id }, data: { isActive: true } });
  await prisma.agentKey.update({ where: { id: key.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(authenticateAgentKey(request), denied);
  await assert.rejects(currentAgentActor(initial), denied);
  assert.equal((await listAgentKeys(alice.id)).keys[0].status, "expired");
});

test("concurrent issuance respects the per-owner limit and history paginates without duplicate keys", { skip }, async t => {
  const alice = await owner(t);
  const first = await createAgentKey(alice.id, keyInput());
  await prisma.agentKey.createMany({ data: Array.from({ length: activeKeyLimit - 2 }, () => ({
    userId: alice.id, ...keyInput(), secretHash: hash(randomUUID())
  })) });
  const attempts = await Promise.allSettled([createAgentKey(alice.id, keyInput()), createAgentKey(alice.id, keyInput())]);
  assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1);
  assert.ok(attempts.some(a => a.status === "rejected" && a.reason instanceof ApiError && a.reason.code === "KEY_LIMIT"));
  await revokeAgentKey(alice.id, first.key.id);
  await createAgentKey(alice.id, keyInput());
  const page = await listAgentKeys(alice.id);
  assert.ok(page.nextCursor);
  const last = await listAgentKeys(alice.id, page.nextCursor);
  assert.equal(last.nextCursor, null);
  const ids = [...page.keys, ...last.keys].map(k => k.id);
  assert.equal(ids.length, activeKeyLimit + 1);
  assert.equal(new Set(ids).size, ids.length);
});
