/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { POST as mcp } from "@/app/api/mcp/route";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api-handler";
import { callAgentTool } from "./dispatch";
import { authenticateAgentKey, createAgentKey, revokeAgentKey } from "./keys";

after(() => prisma.$disconnect());

test("SDK discovery and calls enforce scopes and leave a secret-free audit of results and denials", { skip: !process.env.DATABASE_URL }, async t => {
  const owner = await prisma.user.create({ data: { email: `agent-sdk-${randomUUID()}@example.invalid` } });
  t.after(() => prisma.user.delete({ where: { id: owner.id } }));
  const { secret, key } = await createAgentKey(owner.id, {
    name: "Test client", scopes: ["squads:read"], expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const url = new URL("https://agent.example.test/api/mcp");
  const headers = { authorization: `Bearer ${secret}` };
  // Keep the actual SDK wire protocol, routing its fetch to the Next handler in this process.
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers }, fetch: (input, init) => mcp(new Request(input, init)) });
  await client.connect(transport);
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.ok(tools.some(tool => tool.name === "squads_list"));
  assert.ok(!tools.some(tool => tool.name === "workflows_create"));
  const privateQuery = `private-${randomUUID()}`;
  const listed = await client.callTool({ name: "squads_list", arguments: { query: privateQuery } });
  assert.ok(!listed.isError && listed.structuredContent);
  const denied = await client.callTool({ name: "workflows_create", arguments: {} });
  assert.equal(denied.isError, true);
  assert.equal((denied.structuredContent as { error: { code: string } }).error.code, "FORBIDDEN");
  const invalid = await client.callTool({ name: "squads_list", arguments: { limit: 0 } });
  assert.equal((invalid.structuredContent as { error: { code: string } }).error.code, "INVALID_ARGUMENTS");
  await assert.rejects(client.callTool({ name: privateQuery, arguments: {} }));

  const actor = await authenticateAgentKey(new Request(url, { headers }));
  await assert.rejects(callAgentTool(actor, "http", "squads_list", async () => {
    await revokeAgentKey(owner.id, key.id);
    return {};
  }), (error: unknown) => error instanceof ApiError && error.status === 401);
  await assert.rejects(client.listTools());
  const events = await prisma.agentCallAudit.findMany({ where: { keyId: key.id } });
  for (const [operation, outcome] of [["tools/list", "SUCCESS"], ["squads_list", "SUCCESS"], ["workflows_create", "HTTP_403"],
    ["squads_list", "HTTP_400"], ["unknown", "HTTP_404"], ["squads_list", "HTTP_401"]]) {
    assert.ok(events.some(event => event.operation === operation && event.outcome === outcome));
  }
  const audit = JSON.stringify(events);
  assert.ok(!audit.includes(secret) && !audit.includes(privateQuery) && !audit.includes("Bearer"));
});
