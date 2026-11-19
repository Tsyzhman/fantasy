/** @spec spec://modules/agents/FEAT-017-squad-workflows#root */
import { ApiError } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { AgentActor, AgentInputSchema, AgentOperation, AgentScope } from "@/server/agent-api/contract";
import {
  checkObject, horizonField, idField, integer, listFields, movesField, nameField, objectSchema, readHorizon, readMoves,
  requireScopes, squadVersionField, stepsField, stringField, transferCountField, versionField, workflowActions
} from "./definition";
import { listSquads, loadPlanningContext, ownedSquad, squadDetails, squadVersion } from "./squads";
import { previewTransfers, proposeTransfers } from "./transfers";
import { createWorkflow, getRun, getWorkflow, listRuns, listWorkflows, publishWorkflow, runWorkflow, saveSquad, testWorkflow, updateWorkflow } from "./workflows";

type Execute = AgentOperation["execute"];
function operation(name: string, description: string, scopes: readonly AgentScope[], inputSchema: AgentInputSchema, action: Execute): AgentOperation {
  return { name, description, scopes, inputSchema, async execute(actor, input) {
    requireScopes(actor, scopes);
    checkObject(input, inputSchema);
    try {
      return await action(actor, input);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const databaseError = error as { code?: string; meta?: { code?: string } } | null;
      const code = databaseError?.code;
      const sqlState = databaseError?.meta?.code;
      if (code === "P2034" || code === "P2028" || (code === "P2010" && (sqlState === "40P01" || sqlState === "40001" || sqlState === "55P03"))) {
        throw new ApiError("RETRYABLE_CONFLICT", "The transaction was interrupted. Retry with the same inputs.", 409);
      }
      if (error instanceof Error && (error.message === "SPORTS_PUBLICATION_CHANGED" || code === "P2025")) {
        throw new ApiError("SQUAD_VERSION_CONFLICT", "The saved squad or Sports publication changed.", 409);
      }
      if (error instanceof Error && /^Fantasy squad (contains|round plan contains|changed during save)/.test(error.message)) {
        throw new ApiError("SQUAD_DATA_CHANGED", error.message, 409);
      }
      throw error;
    }
  } };
}

const readSquad = ["squads:read"] as const;
const readWorkflow = ["workflows:read"] as const;
const editWorkflow = ["workflows:write"] as const;
const readResult = ["workflows:read", "squads:read"] as const;
const workflowFields = { name: nameField, squadId: idField, steps: stepsField };
const versionFields = { workflowId: idField, version: versionField };
const executeFields = { ...versionFields, expectedSquadVersion: squadVersionField };

async function evaluateSquad(actor: AgentActor, input: Record<string, unknown>, suggest: boolean) {
  const squadId = stringField(input.squadId, "squadId");
  const horizon = readHorizon(input.horizon);
  const moves = suggest ? undefined : readMoves(input.moves);
  const maxTransfers = input.maxTransfers === undefined ? 2 : integer(input.maxTransfers, "maxTransfers", 2);
  const row = await ownedSquad(prisma, actor.user.id, squadId);
  const context = await loadPlanningContext(prisma, row);
  const evaluated = moves ? previewTransfers(context, moves, horizon) : proposeTransfers(context, maxTransfers, horizon);
  return { squadId, squadVersion: squadVersion(row), ...evaluated.preview };
}

export const agentOperations: readonly AgentOperation[] = [
  operation("squads_list", "Find your saved Machete squads by name. Continue with the returned cursor.", readSquad,
    objectSchema({ ...listFields, query: nameField }), (actor, input) => listSquads(prisma, actor.user.id, input)),
  operation("squads_get", "Read the saved players, budget and opaque squadVersion for a personal squad.", readSquad,
    objectSchema({ squadId: idField }, ["squadId"]), async (actor, input) => squadDetails(await ownedSquad(prisma, actor.user.id, stringField(input.squadId, "squadId")))),
  operation("squads_propose", "Suggest up to two transfers. Return players, expected points and bank before and after, or rejection reasons.", readSquad,
    objectSchema({ squadId: idField, maxTransfers: transferCountField, horizon: horizonField }, ["squadId"]), (actor, input) => evaluateSquad(actor, input, true)),
  operation("squads_preview", "Preview one or two explicit replacements priced and validated on the server.", readSquad,
    objectSchema({ squadId: idField, moves: movesField, horizon: horizonField }, ["squadId", "moves"]), (actor, input) => evaluateSquad(actor, input, false)),
  operation("squads_save", "Apply one or two explicit replacements to your squad at expectedSquadVersion. Reuse idempotencyKey for retries.",
    ["squads:read", "squads:write"], objectSchema({ squadId: idField, moves: movesField, horizon: horizonField,
      expectedSquadVersion: squadVersionField, idempotencyKey: idField }, ["squadId", "moves", "expectedSquadVersion", "idempotencyKey"]),
    (actor, input) => saveSquad(prisma, actor, input)),
  operation("workflows_actions", "Discover workflow steps, schemas and permissions in their execution order.", readWorkflow,
    objectSchema({}), async actor => ({ items: workflowActions.filter(entry => entry.scopes.every(scope => actor.scopes.includes(scope))) })),
  operation("workflows_list", "List your personal workflows and their latest draft versions.", readWorkflow,
    objectSchema(listFields), (actor, input) => listWorkflows(prisma, actor, input)),
  operation("workflows_get", "Open your editable workflow definition, optionally at an exact version.", readWorkflow,
    objectSchema(versionFields, ["workflowId"]), (actor, input) => getWorkflow(prisma, actor, input)),
  operation("workflows_create", "Create a personal draft with a name, target squad and ordered typed steps.", editWorkflow,
    objectSchema(workflowFields, ["name", "squadId", "steps"]), (actor, input) => createWorkflow(prisma, actor, input)),
  operation("workflows_update", "Edit name, squad or steps using the current draft's expectedVersion.", editWorkflow,
    { ...objectSchema({ ...workflowFields, workflowId: idField, expectedVersion: versionField }, ["workflowId", "expectedVersion"]), minProperties: 3 },
    (actor, input) => updateWorkflow(prisma, actor, input)),
  operation("workflows_test", "Test an exact draft or published version. A save step is simulated.", ["workflows:test", "squads:read"],
    objectSchema(executeFields, ["workflowId", "version"]), (actor, input) => testWorkflow(prisma, actor, input)),
  operation("workflows_publish", "Publish the exact immutable workflow version identified in this request.", ["workflows:publish"],
    objectSchema(versionFields, ["workflowId", "version"]), (actor, input) => publishWorkflow(prisma, actor, input)),
  operation("workflows_run", "Run a published version against expectedSquadVersion. Reuse idempotencyKey when retrying.", ["workflows:run", "squads:read"],
    objectSchema({ ...executeFields, idempotencyKey: idField }, ["workflowId", "version", "expectedSquadVersion", "idempotencyKey"]),
    (actor, input) => runWorkflow(prisma, actor, input)),
  operation("workflows_get_run", "Retrieve your stored result by runId, including validation and the applied squad version.", readResult,
    objectSchema({ runId: idField }, ["runId"]), (actor, input) => getRun(prisma, actor, input)),
  operation("workflows_list_runs", "List your stored runs for a workflow. Read each result with workflows_get_run.", readResult,
    objectSchema({ ...listFields, workflowId: idField }, ["workflowId"]), (actor, input) => listRuns(prisma, actor, input))
];
