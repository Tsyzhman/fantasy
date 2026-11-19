/** @spec spec://modules/agents/FEAT-017-squad-workflows#root */
import { createHash } from "node:crypto";
import { Prisma, type AgentSquadSave, type AgentWorkflowRun, type AgentWorkflowVersion, type PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-handler";
import { fantasyProviderPlaceholdersFromFilters } from "@/machete/squad_logic";
import { fantasySquadRoundIdsFromFilters, saveFantasySquad, sportsPublicationId } from "@/machete/squad_planner";
import type { AgentActor } from "@/server/agent-api/contract";
import { integer, invalid, notFound, pageResult, readHorizon, readMoves, readPage, readSteps, requireStepScopes, stringField, type WorkflowStep } from "./definition";
import { loadPlanningContext, lockOwnedSquad, ownedSquad, squadDetails, squadVersion, verifyPlanningInputs } from "./squads";
import { previewTransfers, proposeTransfers, type EvaluatedTransfers } from "./transfers";

type WorkflowReader = Pick<Prisma.TransactionClient, "agentWorkflowVersion">;
type ExecutionTarget = { squadId: string; steps: WorkflowStep[] };

function definition(row: AgentWorkflowVersion) {
  return { workflowId: row.workflowId, version: row.version, name: row.name, squadId: row.squadId,
    steps: readSteps(row.steps), publishedAt: row.publishedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

async function ownedDefinition(db: WorkflowReader, userId: string, workflowId: string, version?: number) {
  const row = await db.agentWorkflowVersion.findFirst({
    where: { workflowId, version, workflow: { userId } }, orderBy: { version: "desc" }
  });
  if (!row) notFound("Workflow version");
  return definition(row);
}

function versionArgs(input: Record<string, unknown>) {
  return { workflowId: stringField(input.workflowId, "workflowId"), version: integer(input.version, "version") };
}

function checkSquadVersion(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalid("Invalid expectedSquadVersion. Use the version returned by squads_get.");
  return value;
}

function staleSquad(): never {
  throw new ApiError("SQUAD_VERSION_CONFLICT", "The saved squad changed. Read the squad and test the new version.", 409);
}

async function ensureOwnedTarget(db: Pick<Prisma.TransactionClient, "userFantasySquad">, userId: string, id: string) {
  if (!await db.userFantasySquad.findFirst({ where: { id, userId }, select: { id: true } })) notFound("Squad");
}

export async function createWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const name = stringField(input.name, "name", 100).trim();
  const squadId = stringField(input.squadId, "squadId");
  const steps = readSteps(input.steps);
  await ensureOwnedTarget(db, actor.user.id, squadId);
  const row = await db.agentWorkflow.create({
    data: { userId: actor.user.id, versions: { create: { version: 1, name, squadId, steps } } }, include: { versions: true }
  });
  return definition(row.versions[0]);
}

export function getWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  return ownedDefinition(db, actor.user.id, stringField(input.workflowId, "workflowId"),
    input.version === undefined ? undefined : integer(input.version, "version"));
}

export async function listWorkflows(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const { limit, cursor } = readPage(input);
  const rows = await db.agentWorkflow.findMany({
    where: { userId: actor.user.id, ...(cursor ? { id: { gt: cursor } } : {}) }, take: limit + 1, orderBy: { id: "asc" },
    select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { name: true, version: true, squadId: true, publishedAt: true } } }
  });
  return pageResult(rows.map(row => ({ id: row.id, workflowId: row.id, ...row.versions[0],
    publishedAt: row.versions[0].publishedAt?.toISOString() ?? null })), limit);
}

export async function updateWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const workflowId = stringField(input.workflowId, "workflowId");
  const expectedVersion = integer(input.expectedVersion, "expectedVersion");
  if (input.name === undefined && input.squadId === undefined && input.steps === undefined) invalid("Provide a name, squadId or steps to edit.");
  const current = await ownedDefinition(db, actor.user.id, workflowId);
  const name = input.name === undefined ? current.name : stringField(input.name, "name", 100).trim();
  const squadId = input.squadId === undefined ? current.squadId : stringField(input.squadId, "squadId");
  const steps = input.steps === undefined ? current.steps : readSteps(input.steps);
  if (current.version !== expectedVersion) throw new ApiError("WORKFLOW_VERSION_CONFLICT", "The draft version changed.", 409);
  return db.$transaction(async tx => {
    await ensureOwnedTarget(tx, actor.user.id, squadId);
    const changed = await tx.agentWorkflow.updateMany({
      where: { id: workflowId, userId: actor.user.id, currentVersion: expectedVersion }, data: { currentVersion: { increment: 1 } }
    });
    if (!changed.count) throw new ApiError("WORKFLOW_VERSION_CONFLICT", "The draft version changed.", 409);
    return definition(await tx.agentWorkflowVersion.create({ data: { workflowId, version: expectedVersion + 1, name, squadId, steps } }));
  });
}

export async function publishWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const { workflowId, version } = versionArgs(input);
  const target = await ownedDefinition(db, actor.user.id, workflowId, version);
  await ensureOwnedTarget(db, actor.user.id, target.squadId);
  await db.agentWorkflowVersion.updateMany({ where: { workflowId, version, workflow: { userId: actor.user.id }, publishedAt: null },
    data: { publishedAt: new Date() } });
  return ownedDefinition(db, actor.user.id, workflowId, version);
}

type StepResult = { action: WorkflowStep["action"]; status: "read" | "proposed" | "validated" | "simulated" | "saved" | "rejected" | "skipped" };

async function prepare(db: PrismaClient, actor: AgentActor, target: ExecutionTarget, expected?: string) {
  const row = await ownedSquad(db, actor.user.id, target.squadId);
  const squad = squadDetails(row);
  if (expected && squad.squadVersion !== expected) staleSquad();
  const context = target.steps.some(step => step.action !== "squads_get") ? await loadPlanningContext(db, row) : null;
  let evaluated: EvaluatedTransfers | null = null;
  const steps: StepResult[] = [];
  let save = false;
  for (const step of target.steps) {
    if (evaluated && !evaluated.preview.accepted) {
      steps.push({ action: step.action, status: "skipped" });
      continue;
    }
    switch (step.action) {
      case "squads_get":
        steps.push({ action: step.action, status: "read" });
        break;
      case "squads_propose":
        evaluated = proposeTransfers(context!, step.maxTransfers ?? 2, step.horizon ?? 1);
        steps.push({ action: step.action, status: evaluated.preview.accepted ? "proposed" : "rejected" });
        break;
      case "squads_preview":
        // The proposal already carries its validated before/after. Recalculate only for an explicit edit.
        if (step.moves || (step.horizon && evaluated?.preview.accepted && step.horizon !== evaluated.preview.horizon)) {
          evaluated = previewTransfers(context!, step.moves ?? evaluated!.preview.moves, step.horizon ?? evaluated?.preview.horizon ?? 1);
        }
        steps.push({ action: step.action, status: evaluated!.preview.accepted ? "validated" : "rejected" });
        break;
      case "squads_save":
        save = Boolean(evaluated?.plans);
        steps.push({ action: step.action, status: save ? "simulated" : "skipped" });
        break;
    }
  }
  return { row, context, plans: evaluated?.plans ?? null, save, result: {
    squadId: squad.squadId, squadVersion: squad.squadVersion, saved: false,
    status: evaluated && !evaluated.preview.accepted ? "rejected" : "succeeded",
    steps, preview: evaluated?.preview ?? null, squad: target.steps.some(step => step.action === "squads_get") ? squad : null
  } };
}

export async function testWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const { workflowId, version } = versionArgs(input);
  const expected = input.expectedSquadVersion === undefined ? undefined : checkSquadVersion(input.expectedSquadVersion);
  const target = await ownedDefinition(db, actor.user.id, workflowId, version);
  requireStepScopes(actor, target.steps, "test");
  const { result } = await prepare(db, actor, target, expected);
  return { workflowId, version, dryRun: true, result };
}

function runDetails(row: AgentWorkflowRun) {
  return { runId: row.id, workflowId: row.workflowId, version: row.version, createdAt: row.createdAt.toISOString(), result: row.result };
}

function replay(row: AgentWorkflowRun, workflowId: string, version: number, expected: string) {
  if (row.workflowId !== workflowId || row.version !== version || row.expectedSquadVersion !== expected) {
    throw new ApiError("IDEMPOTENCY_CONFLICT", "This idempotency key already identifies a different request.", 409);
  }
  return runDetails(row);
}

/** @spec spec://modules/agents/FEAT-017-squad-workflows#runs */
export async function runWorkflow(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const { workflowId, version } = versionArgs(input);
  const expected = checkSquadVersion(input.expectedSquadVersion);
  const idempotencyKey = stringField(input.idempotencyKey, "idempotencyKey");
  const userId = actor.user.id;
  const target = await ownedDefinition(db, userId, workflowId, version);
  if (!target.publishedAt) throw new ApiError("WORKFLOW_NOT_PUBLISHED", "Publish this workflow version before running it.", 409);
  const where = { userId_idempotencyKey: { userId, idempotencyKey } };
  return executeOnce(db, actor, target, expected, ["agent-workflow-run", idempotencyKey], {
    async read(tx) {
      const row = await tx.agentWorkflowRun.findUnique({ where });
      return row ? replay(row, workflowId, version, expected) : null;
    },
    async record(tx, result) {
      return runDetails(await tx.agentWorkflowRun.create({ data: { workflowId, version, userId, idempotencyKey, expectedSquadVersion: expected, result } }));
    }
  });
}

function saveDetails(row: AgentSquadSave) {
  return { saveId: row.id, ...(row.result as Prisma.JsonObject) };
}

/** @spec spec://modules/agents/FEAT-017-squad-workflows#squads */
export async function saveSquad(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const userId = actor.user.id;
  const squadId = stringField(input.squadId, "squadId");
  const expected = checkSquadVersion(input.expectedSquadVersion);
  const idempotencyKey = stringField(input.idempotencyKey, "idempotencyKey");
  const moves = readMoves(input.moves);
  const horizon = readHorizon(input.horizon);
  const requestHash = createHash("sha256").update(JSON.stringify([squadId, expected, moves, horizon])).digest("hex");
  const target: ExecutionTarget = { squadId, steps: [{ action: "squads_preview", moves, horizon }, { action: "squads_save" }] };
  const where = { userId_idempotencyKey: { userId, idempotencyKey } };
  return executeOnce(db, actor, target, expected, ["agent-squad-save", idempotencyKey], {
    async read(tx) {
      const row = await tx.agentSquadSave.findUnique({ where });
      if (!row) return null;
      if (row.requestHash !== requestHash) throw new ApiError("IDEMPOTENCY_CONFLICT", "This idempotency key already identifies a different squad save.", 409);
      return saveDetails(row);
    },
    async record(tx, { squadVersion, squadVersionAfter, saved, status, preview }) {
      const result = { squadId, squadVersion, squadVersionAfter, saved, status, preview };
      return saveDetails(await tx.agentSquadSave.create({ data: { userId, squadId, idempotencyKey, requestHash, result } }));
    }
  });
}

type RecordedResult = Awaited<ReturnType<typeof prepare>>["result"] & { squadVersionAfter: string };

/** @spec spec://modules/agents/FEAT-017-squad-workflows#runs */
async function executeOnce<T extends object>(
  db: PrismaClient, actor: AgentActor, target: ExecutionTarget, expected: string, key: [operation: string, idempotencyKey: string],
  receipt: {
    read(tx: Prisma.TransactionClient): Promise<T | null>;
    record(tx: Prisma.TransactionClient, result: RecordedResult): Promise<T>;
  }
) {
  requireStepScopes(actor, target.steps, "run");
  const userId = actor.user.id;
  const previous = await receipt.read(db);
  if (previous) return previous;

  // Forecast reads may be expensive. Keep them outside the write transaction and recheck their squad under a row lock.
  const preparation = await prepare(db, actor, target, expected).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  return db.$transaction(async tx => {
    const lock = JSON.stringify([key[0], userId, key[1]]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
    const concurrent = await receipt.read(tx);
    if (concurrent) return concurrent;
    if (!preparation.ok) throw preparation.error;
    const { context, result, save, plans } = preparation.value;
    const current = await lockOwnedSquad(tx, userId, target.squadId);
    if (result.squadVersion !== expected || squadVersion(current) !== expected) staleSquad();
    let squadVersionAfter = expected;
    if (save && plans && context) {
      const selectedIds = [...context.roundPlans[0].selections, ...plans.flatMap(plan => plan.selections)].map(selection => selection.playerId);
      await verifyPlanningInputs(tx, current, context, selectedIds);
      await saveFantasySquad(db, {
        userId, squadId: current.id, provider: current.provider, leagueId: current.leagueId, season: current.season,
        name: current.name, contestId: current.contestId, horizonRounds: current.horizonRounds, rules: context.rules,
        expectedUpdatedAt: current.updatedAt,
        expectedSportsPublicationId: current.provider === "SPORTS_RU" ? sportsPublicationId(preparation.value.row.filters) : undefined,
        selections: plans[0].selections, roundPlans: plans,
        roundPlanRoundIds: context.roundIds.length ? context.roundIds : fantasySquadRoundIdsFromFilters(current.filters),
        providerPlaceholders: fantasyProviderPlaceholdersFromFilters(current.filters, current.provider)
      }, tx);
      result.saved = true;
      result.steps[result.steps.length - 1].status = "saved";
      squadVersionAfter = squadVersion(await ownedSquad(tx, userId, current.id));
    }
    return receipt.record(tx, { ...result, squadVersionAfter });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
}

export async function getRun(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const row = await db.agentWorkflowRun.findFirst({ where: { id: stringField(input.runId, "runId"), userId: actor.user.id } });
  if (!row) notFound("Run");
  return runDetails(row);
}

export async function listRuns(db: PrismaClient, actor: AgentActor, input: Record<string, unknown>) {
  const { limit, cursor } = readPage(input);
  const workflowId = stringField(input.workflowId, "workflowId");
  await ownedDefinition(db, actor.user.id, workflowId);
  const rows = await db.agentWorkflowRun.findMany({
    where: { workflowId, userId: actor.user.id, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: limit + 1,
    select: { id: true, workflowId: true, version: true, createdAt: true }
  });
  return pageResult(rows.map(row => ({ ...row, runId: row.id, createdAt: row.createdAt.toISOString() })), limit);
}
