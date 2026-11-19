/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import { callAgentTool } from "@/server/agent-api/dispatch";
import { readAgentJson, withAgentKey } from "@/server/agent-api/http";

export const runtime = "nodejs";

export const POST = withAgentKey(async (request, actor, { params }: { params: Promise<{ name: string }> }) => {
  const { name } = await params;
  return Response.json({ result: await callAgentTool(actor, "http", name, () => readAgentJson(request)) });
});
