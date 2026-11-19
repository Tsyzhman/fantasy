/** @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization */
import type { AuthUser } from "@/lib/auth";

export const agentScopes = [
  "squads:read",
  "squads:write",
  "workflows:read",
  "workflows:write",
  "workflows:test",
  "workflows:publish",
  "workflows:run"
] as const;

export type AgentScope = (typeof agentScopes)[number];

export type AgentActor = {
  user: AuthUser;
  keyId: string;
  scopes: readonly AgentScope[];
};

/** JSON Schema shared by tool discovery, request validation and both transports. */
export type AgentInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
  [keyword: string]: unknown;
};

export type AgentOperation = {
  name: string;
  description: string;
  inputSchema: AgentInputSchema;
  scopes: readonly AgentScope[];
  execute(actor: AgentActor, input: Record<string, unknown>): Promise<unknown>;
};
