/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
import { readAgentJson, withProfileUser } from "@/server/agent-api/http";
import { createAgentKey, listAgentKeys } from "@/server/agent-api/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withProfileUser(async (request, userId) => {
  const cursor = new URL(request.url).searchParams.get("cursor");
  return Response.json(await listAgentKeys(userId, cursor));
});

export const POST = withProfileUser(async (request, userId) => {
  const input = await readAgentJson(request, 4096);
  return Response.json(await createAgentKey(userId, input), { status: 201 });
});
