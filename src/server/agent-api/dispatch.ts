/** @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization */
import Ajv2020 from "ajv/dist/2020";
import { ApiError, apiError } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { agentOperations } from "@/server/agent-workflows/operations";
import type { AgentActor, AgentOperation } from "./contract";
import { currentAgentActor } from "./keys";

type Transport = "http" | "mcp";
const validator = new Ajv2020({ ownProperties: true, allowUnionTypes: true });
const catalog = new Map(agentOperations.map(operation =>
  [operation.name, { operation, validate: validator.compile<Record<string, unknown>>(operation.inputSchema) }] as const
));

function canUse(actor: AgentActor, operation: AgentOperation) {
  return operation.scopes.every(scope => actor.scopes.includes(scope));
}

async function audited<T>(actor: AgentActor, transport: Transport, operation: string, action: () => Promise<T>): Promise<T> {
  // Persist the attempt before running a command which may have side effects.
  const event = await prisma.agentCallAudit.create({
    data: { keyId: actor.keyId, transport, operation, outcome: "STARTED" }, select: { id: true }
  });
  let result: T;
  try {
    result = await action();
  } catch (cause) {
    const outcome = cause instanceof ApiError ? `HTTP_${cause.status}` : "INTERNAL_ERROR";
    await prisma.agentCallAudit.update({ where: { id: event.id }, data: { outcome } });
    throw cause;
  }
  await prisma.agentCallAudit.update({ where: { id: event.id }, data: { outcome: "SUCCESS" } });
  return result;
}

export function listAgentTools(identity: AgentActor, transport: Transport) {
  return audited(identity, transport, "tools/list", async () => {
    const actor = await currentAgentActor(identity);
    return agentOperations.filter(operation => canUse(actor, operation)).map(({ name, description, inputSchema }) => ({
      name, description, inputSchema
    }));
  });
}

export function callAgentTool(identity: AgentActor, transport: Transport, name: string, readInput: () => unknown) {
  const entry = catalog.get(name);
  // Unknown names are arbitrary caller input, and could themselves contain a secret.
  return audited(identity, transport, entry?.operation.name ?? "unknown", async () => {
    if (!entry) throw apiError("UNKNOWN_TOOL", "Tool not found.", 404);
    const forbidden = () => apiError("FORBIDDEN", "This key lacks a required permission.", 403);
    if (!canUse(identity, entry.operation)) throw forbidden();
    const input = await readInput();
    const actor = await currentAgentActor(identity);
    if (!canUse(actor, entry.operation)) throw forbidden();
    if (!entry.validate(input)) throw apiError("INVALID_ARGUMENTS", "Arguments do not match the tool input schema.", 400);
    return entry.operation.execute(actor, input);
  });
}
