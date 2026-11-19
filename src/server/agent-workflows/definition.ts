/** @spec spec://modules/agents/FEAT-017-squad-workflows#drafts */
import { ApiError } from "@/lib/api-handler";
import { isFantasySquadPlayerId } from "@/machete/squad_logic";
import type { AgentActor, AgentInputSchema, AgentScope } from "@/server/agent-api/contract";

export type Move = { outPlayerId: string; inPlayerId: string };
export type WorkflowStep =
  | { action: "squads_get" }
  | { action: "squads_propose"; maxTransfers?: number; horizon?: number }
  | { action: "squads_preview"; moves?: Move[]; horizon?: number }
  | { action: "squads_save" };

export const idField = { type: "string", minLength: 1, maxLength: 128 };
export const nameField = { type: "string", minLength: 1, maxLength: 100 };
export const versionField = { type: "integer", minimum: 1, maximum: 2_147_483_647 };
export const squadVersionField = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const horizonField = { type: "integer", enum: [1, 3, 5] };
export const transferCountField = { type: "integer", minimum: 1, maximum: 2 };
export const listFields = { limit: { type: "integer", minimum: 1, maximum: 50 }, cursor: idField };
const playerIdField = { type: "string", minLength: 1, maxLength: 384 };

export function objectSchema(properties: Record<string, object>, required: string[] = []): AgentInputSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

export const movesField = {
  type: "array", minItems: 1, maxItems: 2,
  items: objectSchema({ outPlayerId: playerIdField, inPlayerId: playerIdField }, ["outPlayerId", "inPlayerId"])
};

const readScopes = ["squads:read"] as const;
export const workflowActions = [
  { action: "squads_get", description: "Read the workflow owner's saved squad.", scopes: readScopes,
    inputSchema: objectSchema({ action: { const: "squads_get" } }, ["action"]) },
  { action: "squads_propose", description: "Suggest up to two transfers using server points and prices.", scopes: readScopes,
    inputSchema: objectSchema({ action: { const: "squads_propose" }, maxTransfers: transferCountField, horizon: horizonField }, ["action"]) },
  { action: "squads_preview", description: "Validate explicit moves or the preceding proposal against all rounds.", scopes: readScopes,
    inputSchema: objectSchema({ action: { const: "squads_preview" }, moves: movesField, horizon: horizonField }, ["action"]) },
  { action: "squads_save", description: "Apply the preceding valid preview. A test simulates this step.", scopes: ["squads:read", "squads:write"] as const,
    inputSchema: objectSchema({ action: { const: "squads_save" } }, ["action"]) }
] as const;

export const stepsField = {
  type: "array", minItems: 1, maxItems: workflowActions.length,
  description: "Each action may appear once, in catalog order. A save requires a preview. A preview without moves requires a proposal.",
  items: { oneOf: workflowActions.map(action => action.inputSchema) }
};

export function invalid(detail: string): never {
  throw new ApiError("INVALID_ARGUMENTS", detail, 400);
}

export function notFound(entity: string): never {
  throw new ApiError("NOT_FOUND", `${entity} not found.`, 404);
}

export function requireScopes(actor: AgentActor, scopes: readonly AgentScope[]) {
  if (!actor.user.isActive || scopes.some(scope => !actor.scopes.includes(scope))) {
    throw new ApiError("FORBIDDEN", "The active user and key must be authorized for this action.", 403);
  }
}

export function checkObject(value: unknown, schema: AgentInputSchema): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Expected an object.");
  if (Object.keys(value).some(key => !Object.hasOwn(schema.properties ?? {}, key))) invalid("Unexpected property.");
  if (schema.required?.some(key => !Object.hasOwn(value, key))) invalid("A required property is missing.");
}

export function stringField(value: unknown, field: string, maxLength = 128) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f]/u.test(value)) {
    invalid(`Invalid ${field}.`);
  }
  return value;
}

export function integer(value: unknown, field: string, max = 2_147_483_647) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) invalid(`Invalid ${field}.`);
  return value;
}

export function readHorizon(value: unknown) {
  if (value === undefined) return 1;
  if (value !== 1 && value !== 3 && value !== 5) invalid("horizon must be 1, 3 or 5.");
  return value;
}

export function readMoves(value: unknown): Move[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) invalid("moves must contain one or two replacements.");
  return value.map(move => {
    checkObject(move, movesField.items);
    const outPlayerId = stringField(move.outPlayerId, "outPlayerId", playerIdField.maxLength);
    const inPlayerId = stringField(move.inPlayerId, "inPlayerId", playerIdField.maxLength);
    if (!isFantasySquadPlayerId(outPlayerId) || !isFantasySquadPlayerId(inPlayerId)) invalid("Invalid fantasy player ID.");
    return { outPlayerId, inPlayerId };
  });
}

export function readSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > workflowActions.length) invalid("Expected one to four actions.");
  const steps: WorkflowStep[] = [];
  let lastIndex = -1;
  for (const raw of value) {
    const index = workflowActions.findIndex(entry => entry.action === raw?.action);
    if (index <= lastIndex) invalid("Unknown, repeated or out-of-order action.");
    const entry = workflowActions[index];
    checkObject(raw, entry.inputSchema);
    const action = entry.action;
    if (action === "squads_propose") {
      steps.push({ action, ...(raw.maxTransfers === undefined ? {} : { maxTransfers: integer(raw.maxTransfers, "maxTransfers", 2) }),
        ...(raw.horizon === undefined ? {} : { horizon: readHorizon(raw.horizon) }) });
    } else if (action === "squads_preview") {
      if (raw.moves === undefined && !steps.some(step => step.action === "squads_propose")) invalid("A preview requires moves or a proposal.");
      steps.push({ action, ...(raw.moves === undefined ? {} : { moves: readMoves(raw.moves) }),
        ...(raw.horizon === undefined ? {} : { horizon: readHorizon(raw.horizon) }) });
    } else {
      if (action === "squads_save" && !steps.some(step => step.action === "squads_preview")) invalid("A save requires a preview.");
      steps.push({ action });
    }
    lastIndex = index;
  }
  return steps;
}

export function requireStepScopes(actor: AgentActor, steps: WorkflowStep[], mode: "test" | "run") {
  for (const step of steps) {
    const entry = workflowActions.find(item => item.action === step.action)!;
    requireScopes(actor, mode === "test" && step.action === "squads_save" ? readScopes : entry.scopes);
  }
}

export function readPage(input: Record<string, unknown>) {
  return {
    limit: input.limit === undefined ? 20 : integer(input.limit, "limit", 50),
    cursor: input.cursor === undefined ? undefined : stringField(input.cursor, "cursor")
  };
}

export function pageResult<T extends { id: string }>(rows: T[], limit: number) {
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}
