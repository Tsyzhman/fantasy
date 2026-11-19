/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import { createMcpHandler, isSpecType, ProtocolError, ProtocolErrorCode, Server } from "@modelcontextprotocol/server";
import { callAgentTool, listAgentTools } from "@/server/agent-api/dispatch";
import { agentBodyLimit, agentError, withAgentKey } from "@/server/agent-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const serve = withAgentKey(async (request, actor) => {
  const handler = createMcpHandler(() => {
    const server = new Server({ name: "fantasy-scout", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler("tools/list", async () => {
      try {
        const result = { tools: await listAgentTools(actor, "mcp") };
        if (!isSpecType.ListToolsResult(result)) throw new Error("Invalid tool catalog.");
        return result;
      } catch (cause) {
        const { code, message, status } = agentError(cause);
        throw new ProtocolError(ProtocolErrorCode.InternalError, message, { code, status });
      }
    });
    server.setRequestHandler("tools/call", async ({ params }) => {
      try {
        const result = await callAgentTool(actor, "mcp", params.name, () => params.arguments ?? {});
        const payload = { result };
        return { structuredContent: payload, content: [{ type: "text", text: JSON.stringify(payload) }] };
      } catch (cause) {
        const { code, message, status } = agentError(cause);
        if (code === "UNKNOWN_TOOL") throw new ProtocolError(ProtocolErrorCode.InvalidParams, message, { code, status });
        const payload = { error: { code, message, status } };
        return { isError: true, structuredContent: payload, content: [{ type: "text", text: JSON.stringify(payload) }] };
      }
    });
    return server;
  }, { maxRequestBodySize: agentBodyLimit, maxSubscriptions: 0 });
  return handler.fetch(request);
});

export { serve as POST, serve as GET, serve as DELETE };
