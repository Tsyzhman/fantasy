/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import { listAgentTools } from "@/server/agent-api/dispatch";
import { withAgentKey } from "@/server/agent-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAgentKey(async (_request, actor) => {
  return Response.json({ tools: await listAgentTools(actor, "http") });
});
