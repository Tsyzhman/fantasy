/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
import { withProfileUser } from "@/server/agent-api/http";
import { revokeAgentKey } from "@/server/agent-api/keys";

export const runtime = "nodejs";

export const DELETE = withProfileUser(async (_request, userId, { params }: { params: Promise<{ id: string }> }) => {
  await revokeAgentKey(userId, (await params).id);
  return new Response(null, { status: 204 });
});
